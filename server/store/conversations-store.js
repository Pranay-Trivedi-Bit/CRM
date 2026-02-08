const fs = require('fs');
const path = require('path');
const config = require('../config');

const convDir = path.join(config.dataDir, 'conversations');

function ensureDir() {
  if (!fs.existsSync(convDir)) {
    fs.mkdirSync(convDir, { recursive: true });
  }
}

function sanitizePhone(phone) {
  return phone.replace(/[^0-9+]/g, '');
}

function getByPhone(phone) {
  ensureDir();
  const filePath = path.join(convDir, `${sanitizePhone(phone)}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createOrGet(phone, leadId, leadName) {
  let conv = getByPhone(phone);
  if (!conv) {
    conv = {
      phone: sanitizePhone(phone),
      leadId: leadId || null,
      leadName: leadName || '',
      flowState: null,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    saveConversation(conv);
  }
  return conv;
}

function addMessage(phone, message) {
  const conv = createOrGet(phone);
  if (!message.id) {
    message.id = 'msg_' + Date.now() + '_' + Math.random().toString(16).substring(2, 6);
  }
  if (!message.timestamp) {
    message.timestamp = new Date().toISOString();
  }
  conv.messages.push(message);
  conv.updatedAt = new Date().toISOString();
  saveConversation(conv);
  return message;
}

function getState(phone) {
  const conv = getByPhone(phone);
  return conv ? conv.flowState : null;
}

function setState(phone, state) {
  const conv = createOrGet(phone);
  conv.flowState = state;
  conv.updatedAt = new Date().toISOString();
  saveConversation(conv);
}

function updateMessageStatus(phone, waMessageId, status) {
  const conv = getByPhone(phone);
  if (!conv) return;
  const msg = conv.messages.find(m => m.waMessageId === waMessageId);
  if (msg) {
    msg.status = status;
    conv.updatedAt = new Date().toISOString();
    saveConversation(conv);
  }
}

function listAll() {
  ensureDir();
  const files = fs.readdirSync(convDir).filter(f => f.endsWith('.json'));
  return files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(convDir, f), 'utf8'));
    const lastMsg = data.messages[data.messages.length - 1];
    return {
      phone: data.phone,
      leadId: data.leadId,
      leadName: data.leadName,
      lastMessage: lastMsg ? lastMsg.text || '[media]' : '',
      lastMessageAt: lastMsg ? lastMsg.timestamp : data.createdAt,
      messageCount: data.messages.length
    };
  }).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
}

function saveConversation(conv) {
  ensureDir();
  const filePath = path.join(convDir, `${sanitizePhone(conv.phone)}.json`);
  fs.writeFileSync(filePath, JSON.stringify(conv, null, 2));
}

module.exports = { getByPhone, createOrGet, addMessage, getState, setState, updateMessageStatus, listAll };
