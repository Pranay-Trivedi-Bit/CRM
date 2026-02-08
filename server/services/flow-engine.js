const flowsStore = require('../store/flows-store');
const conversationsStore = require('../store/conversations-store');
const whatsappApi = require('./whatsapp-api');
const leadSync = require('./lead-sync');

async function processIncoming(phone, message, contactName) {
  const activeFlow = flowsStore.getActive();
  if (!activeFlow) return;

  const text = extractText(message);
  let state = conversationsStore.getState(phone);

  // No active state - check if message matches a trigger keyword
  if (!state) {
    const startNode = activeFlow.nodes.find(n => n.type === 'start');
    if (!startNode) return;

    const trigger = (startNode.data.triggerKeyword || '').toLowerCase();
    if (trigger && !text.toLowerCase().includes(trigger)) return;

    state = {
      flowId: activeFlow.id,
      currentNodeId: startNode.id,
      collectedData: {},
      startedAt: new Date().toISOString()
    };
  }

  // Walk the flow from current node
  await executeFromNode(phone, activeFlow, state, text, contactName);
}

async function executeFromNode(phone, flow, state, userInput, contactName) {
  let currentNodeId = state.currentNodeId;
  let iterations = 0;
  const maxIterations = 20; // Prevent infinite loops

  // Find the next node after the current one (current was already processed or is start)
  const nextNodeId = getNextNode(flow, currentNodeId, userInput, state);
  if (nextNodeId) {
    currentNodeId = nextNodeId;
  } else if (state.currentNodeId === flow.nodes.find(n => n.type === 'start')?.id) {
    // Start node: move to next connected node
    const conn = flow.connections.find(c => c.from === currentNodeId);
    if (conn) currentNodeId = conn.to;
    else return;
  } else {
    return; // Dead end
  }

  while (currentNodeId && iterations < maxIterations) {
    iterations++;
    const node = flow.nodes.find(n => n.id === currentNodeId);
    if (!node) break;

    if (node.type === 'message') {
      const msgText = interpolateText(node.data.messageText || '', state.collectedData, contactName);
      await whatsappApi.sendTextMessage(phone, msgText);
      conversationsStore.addMessage(phone, {
        direction: 'outgoing',
        type: 'text',
        text: msgText,
        status: 'sent'
      });

      // Move to next node
      const conn = flow.connections.find(c => c.from === currentNodeId && c.fromPort === 'out');
      currentNodeId = conn ? conn.to : null;

    } else if (node.type === 'question') {
      const questionText = interpolateText(node.data.questionText || '', state.collectedData, contactName);
      const options = node.data.options || [];

      if (node.data.replyType === 'list') {
        await whatsappApi.sendInteractiveList(phone, questionText, 'Select', [{
          title: 'Options',
          rows: options.map(opt => ({ id: opt.id, title: opt.text }))
        }]);
      } else {
        if (options.length <= 3) {
          await whatsappApi.sendInteractiveButtons(phone, questionText, options);
        } else {
          await whatsappApi.sendInteractiveList(phone, questionText, 'Select', [{
            title: 'Options',
            rows: options.map(opt => ({ id: opt.id, title: opt.text }))
          }]);
        }
      }

      conversationsStore.addMessage(phone, {
        direction: 'outgoing',
        type: 'interactive',
        text: questionText,
        status: 'sent'
      });

      // Wait for user response - save state and stop
      state.currentNodeId = currentNodeId;
      conversationsStore.setState(phone, state);
      return;

    } else if (node.type === 'condition') {
      const field = node.data.field || '';
      const operator = node.data.operator || 'equals';
      const value = node.data.value || '';
      const actual = state.collectedData[field] || userInput || '';

      let matched = false;
      if (operator === 'equals') matched = actual.toLowerCase() === value.toLowerCase();
      else if (operator === 'contains') matched = actual.toLowerCase().includes(value.toLowerCase());
      else if (operator === 'not_equals') matched = actual.toLowerCase() !== value.toLowerCase();

      const port = matched ? 'true' : 'false';
      const conn = flow.connections.find(c => c.from === currentNodeId && c.fromPort === port);
      currentNodeId = conn ? conn.to : null;

    } else if (node.type === 'action') {
      await executeAction(phone, node.data, state, contactName);
      const conn = flow.connections.find(c => c.from === currentNodeId && c.fromPort === 'out');
      currentNodeId = conn ? conn.to : null;

    } else if (node.type === 'delay') {
      const duration = (node.data.duration || 1) * getDelayMultiplier(node.data.unit);
      state.currentNodeId = currentNodeId;
      conversationsStore.setState(phone, state);
      // Schedule continuation after delay
      setTimeout(async () => {
        const conn = flow.connections.find(c => c.from === currentNodeId && c.fromPort === 'out');
        if (conn) {
          state.currentNodeId = conn.to;
          await executeFromNode(phone, flow, state, '', contactName);
        }
      }, Math.min(duration, 300000)); // Cap at 5 minutes
      return;

    } else if (node.type === 'api') {
      // API node - make external call
      try {
        const axios = require('axios');
        const response = await axios({
          method: node.data.method || 'GET',
          url: node.data.url,
          data: node.data.body ? JSON.parse(interpolateText(node.data.body, state.collectedData, contactName)) : undefined,
          timeout: 10000
        });
        state.collectedData['_apiResponse'] = JSON.stringify(response.data);
        const conn = flow.connections.find(c => c.from === currentNodeId && c.fromPort === 'success');
        currentNodeId = conn ? conn.to : null;
      } catch (err) {
        state.collectedData['_apiError'] = err.message;
        const conn = flow.connections.find(c => c.from === currentNodeId && c.fromPort === 'error');
        currentNodeId = conn ? conn.to : null;
      }

    } else {
      break;
    }
  }

  // End of flow
  state.currentNodeId = null;
  conversationsStore.setState(phone, state);
}

function getNextNode(flow, currentNodeId, userInput, state) {
  const node = flow.nodes.find(n => n.id === currentNodeId);
  if (!node) return null;

  if (node.type === 'question') {
    const options = node.data.options || [];
    const matched = options.find(opt =>
      opt.text.toLowerCase() === userInput.toLowerCase() ||
      opt.value === userInput ||
      opt.id === userInput
    );
    if (matched) {
      state.collectedData[node.data.label || node.id] = matched.value || matched.text;
      const conn = flow.connections.find(c => c.from === currentNodeId && c.fromPort === matched.id);
      return conn ? conn.to : null;
    }
    // Default: take first connection if no match
    const defaultConn = flow.connections.find(c => c.from === currentNodeId);
    return defaultConn ? defaultConn.to : null;
  }

  // For non-question nodes, follow default output
  const conn = flow.connections.find(c => c.from === currentNodeId && (c.fromPort === 'out' || !c.fromPort));
  return conn ? conn.to : null;
}

async function executeAction(phone, actionData, state, contactName) {
  const actionType = actionData.actionType;
  const params = actionData.params || {};

  if (actionType === 'updateTemp' || actionType === 'updateStatus' || actionType === 'addRemark' || actionType === 'assignCSM') {
    await leadSync.updateFromWhatsApp(phone, actionType, params);
  }
}

function interpolateText(text, data, contactName) {
  let result = text;
  result = result.replace(/\{\{name\}\}/gi, contactName || 'there');
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), value);
  }
  return result;
}

function getDelayMultiplier(unit) {
  const multipliers = { seconds: 1000, minutes: 60000, hours: 3600000 };
  return multipliers[unit] || 1000;
}

function extractText(message) {
  if (!message) return '';
  switch (message.type) {
    case 'text': return message.text.body;
    case 'button': return message.button.text;
    case 'interactive':
      if (message.interactive.type === 'button_reply') return message.interactive.button_reply.title;
      if (message.interactive.type === 'list_reply') return message.interactive.list_reply.title;
      return '';
    default: return '';
  }
}

// Simulate a flow for testing (no actual WhatsApp sending)
function simulateFlow(flow, initialMessage) {
  const responses = [];
  let currentNodeId = null;

  // Find start node
  const startNode = flow.nodes.find(n => n.type === 'start');
  if (!startNode) return responses;

  // Find first connected node after start
  const firstConn = flow.connections.find(c => c.from === startNode.id);
  if (!firstConn) return responses;
  currentNodeId = firstConn.to;

  const state = { collectedData: {} };
  let iterations = 0;

  while (currentNodeId && iterations < 20) {
    iterations++;
    const node = flow.nodes.find(n => n.id === currentNodeId);
    if (!node) break;

    if (node.type === 'message') {
      responses.push({
        type: 'message',
        text: interpolateText(node.data.messageText || '', state.collectedData, 'Test User')
      });
      const conn = flow.connections.find(c => c.from === currentNodeId && c.fromPort === 'out');
      currentNodeId = conn ? conn.to : null;
    } else if (node.type === 'question') {
      responses.push({
        type: 'question',
        text: node.data.questionText,
        options: node.data.options || [],
        waitingForInput: true
      });
      break; // Stop at question
    } else if (node.type === 'action') {
      responses.push({
        type: 'action',
        actionType: node.data.actionType,
        label: node.data.label
      });
      const conn = flow.connections.find(c => c.from === currentNodeId && c.fromPort === 'out');
      currentNodeId = conn ? conn.to : null;
    } else if (node.type === 'delay') {
      responses.push({
        type: 'delay',
        duration: node.data.duration,
        unit: node.data.unit
      });
      const conn = flow.connections.find(c => c.from === currentNodeId && c.fromPort === 'out');
      currentNodeId = conn ? conn.to : null;
    } else {
      break;
    }
  }

  return responses;
}

module.exports = { processIncoming, simulateFlow };
