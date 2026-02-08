/**
 * Bot Builder Nodes - Node type definitions and rendering
 */
var BotBuilderNodes = (function () {
  'use strict';

  var NODE_TYPES = {
    start: {
      label: 'Start',
      color: '#10b981',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
      defaultData: { label: 'Start', triggerKeyword: 'hi' },
      outputs: ['out'],
      inputs: []
    },
    message: {
      label: 'Message',
      color: '#3b82f6',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
      defaultData: { label: 'Message', messageText: 'Hello!', messageType: 'text' },
      outputs: ['out'],
      inputs: ['in']
    },
    question: {
      label: 'Question',
      color: '#f59e0b',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      defaultData: {
        label: 'Question',
        questionText: 'What would you like?',
        replyType: 'buttons',
        options: [
          { id: 'opt_1', text: 'Option 1', value: 'option1' },
          { id: 'opt_2', text: 'Option 2', value: 'option2' }
        ]
      },
      outputs: function (data) {
        return (data.options || []).map(function (opt) { return opt.id; });
      },
      inputs: ['in']
    },
    condition: {
      label: 'Condition',
      color: '#8b5cf6',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
      defaultData: { label: 'Condition', field: '', operator: 'equals', value: '' },
      outputs: ['true', 'false'],
      inputs: ['in']
    },
    action: {
      label: 'Action',
      color: '#ef4444',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
      defaultData: { label: 'Action', actionType: 'addRemark', params: { remarkText: '' } },
      outputs: ['out'],
      inputs: ['in']
    },
    delay: {
      label: 'Delay',
      color: '#6b7280',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      defaultData: { label: 'Delay', duration: 5, unit: 'seconds' },
      outputs: ['out'],
      inputs: ['in']
    },
    api: {
      label: 'API Call',
      color: '#06b6d4',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>',
      defaultData: { label: 'API Call', url: '', method: 'GET', body: '', headers: '' },
      outputs: ['success', 'error'],
      inputs: ['in']
    }
  };

  function getOutputs(type, data) {
    var typeDef = NODE_TYPES[type];
    if (!typeDef) return ['out'];
    if (typeof typeDef.outputs === 'function') return typeDef.outputs(data);
    return typeDef.outputs;
  }

  function createNodeElement(node) {
    var typeDef = NODE_TYPES[node.type];
    if (!typeDef) return null;

    var el = document.createElement('div');
    el.className = 'bb-node';
    el.dataset.nodeId = node.id;
    el.dataset.nodeType = node.type;
    el.style.left = node.position.x + 'px';
    el.style.top = node.position.y + 'px';

    // Header
    var header = document.createElement('div');
    header.className = 'bb-node__header';
    header.style.background = typeDef.color;
    header.innerHTML = typeDef.icon + '<span class="bb-node__title">' + (node.data.label || typeDef.label) + '</span>';
    el.appendChild(header);

    // Body
    var body = document.createElement('div');
    body.className = 'bb-node__body';

    if (node.type === 'message') {
      body.textContent = truncate(node.data.messageText || '', 50);
    } else if (node.type === 'question') {
      body.textContent = truncate(node.data.questionText || '', 40);
    } else if (node.type === 'condition') {
      body.textContent = (node.data.field || '?') + ' ' + (node.data.operator || '=') + ' ' + (node.data.value || '?');
    } else if (node.type === 'action') {
      body.textContent = node.data.actionType || 'action';
    } else if (node.type === 'delay') {
      body.textContent = (node.data.duration || 0) + ' ' + (node.data.unit || 'sec');
    } else if (node.type === 'api') {
      body.textContent = (node.data.method || 'GET') + ' ' + truncate(node.data.url || '', 30);
    } else if (node.type === 'start') {
      body.textContent = 'Trigger: ' + (node.data.triggerKeyword || 'any');
    }
    el.appendChild(body);

    // Input ports
    var inputs = typeDef.inputs || [];
    for (var i = 0; i < inputs.length; i++) {
      var inputPort = document.createElement('div');
      inputPort.className = 'bb-port bb-port--input';
      inputPort.dataset.portId = inputs[i];
      inputPort.dataset.portType = 'input';
      inputPort.title = 'Input';
      el.appendChild(inputPort);
    }

    // Output ports
    var outputs = getOutputs(node.type, node.data);
    for (var j = 0; j < outputs.length; j++) {
      var outputPort = document.createElement('div');
      outputPort.className = 'bb-port bb-port--output';
      outputPort.dataset.portId = outputs[j];
      outputPort.dataset.portType = 'output';

      // Position output ports vertically distributed
      var totalOutputs = outputs.length;
      if (totalOutputs > 1) {
        var pct = ((j + 1) / (totalOutputs + 1)) * 100;
        outputPort.style.top = pct + '%';
      }

      // Label for multi-output
      if (outputs[j] !== 'out') {
        var portLabel = document.createElement('span');
        portLabel.className = 'bb-port__label';
        portLabel.textContent = getPortLabel(node.type, outputs[j], node.data);
        outputPort.appendChild(portLabel);
      }

      el.appendChild(outputPort);
    }

    return el;
  }

  function getPortLabel(nodeType, portId, data) {
    if (nodeType === 'condition') {
      return portId === 'true' ? 'Yes' : 'No';
    }
    if (nodeType === 'api') {
      return portId === 'success' ? 'OK' : 'Err';
    }
    if (nodeType === 'question') {
      var opt = (data.options || []).find(function (o) { return o.id === portId; });
      return opt ? truncate(opt.text, 12) : portId;
    }
    return portId;
  }

  function renderProperties(node, panel) {
    panel.innerHTML = '';
    var typeDef = NODE_TYPES[node.type];
    if (!typeDef) return;

    // Label
    addField(panel, 'Label', 'text', node.data.label || '', function (val) { node.data.label = val; });

    if (node.type === 'start') {
      addField(panel, 'Trigger Keyword', 'text', node.data.triggerKeyword || '', function (val) { node.data.triggerKeyword = val; });
    } else if (node.type === 'message') {
      addField(panel, 'Message Text', 'textarea', node.data.messageText || '', function (val) { node.data.messageText = val; });
      addSelect(panel, 'Message Type', ['text', 'image', 'document'], node.data.messageType || 'text', function (val) { node.data.messageType = val; });
      if (node.data.messageType === 'image' || node.data.messageType === 'document') {
        addField(panel, 'Media URL', 'text', node.data.mediaUrl || '', function (val) { node.data.mediaUrl = val; });
      }
    } else if (node.type === 'question') {
      addField(panel, 'Question Text', 'textarea', node.data.questionText || '', function (val) { node.data.questionText = val; });
      addSelect(panel, 'Reply Type', ['buttons', 'list'], node.data.replyType || 'buttons', function (val) { node.data.replyType = val; });
      renderOptionsEditor(panel, node);
    } else if (node.type === 'condition') {
      addField(panel, 'Field Name', 'text', node.data.field || '', function (val) { node.data.field = val; });
      addSelect(panel, 'Operator', ['equals', 'contains', 'not_equals'], node.data.operator || 'equals', function (val) { node.data.operator = val; });
      addField(panel, 'Value', 'text', node.data.value || '', function (val) { node.data.value = val; });
    } else if (node.type === 'action') {
      addSelect(panel, 'Action Type', ['addRemark', 'updateTemp', 'updateStatus', 'assignCSM'], node.data.actionType || 'addRemark', function (val) { node.data.actionType = val; });
      if (node.data.actionType === 'addRemark' || node.data.actionType === 'updateTemp') {
        addField(panel, 'Remark Text', 'text', (node.data.params && node.data.params.remarkText) || '', function (val) {
          if (!node.data.params) node.data.params = {};
          node.data.params.remarkText = val;
        });
      }
      if (node.data.actionType === 'updateTemp') {
        addSelect(panel, 'Temperature', ['Hot', 'Warm', 'Cold', 'Dead'], (node.data.params && node.data.params.temperature) || 'Hot', function (val) {
          if (!node.data.params) node.data.params = {};
          node.data.params.temperature = val;
        });
      }
      if (node.data.actionType === 'updateStatus') {
        addSelect(panel, 'Status', ['New', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'], (node.data.params && node.data.params.status) || 'Contacted', function (val) {
          if (!node.data.params) node.data.params = {};
          node.data.params.status = val;
        });
      }
      if (node.data.actionType === 'assignCSM') {
        addField(panel, 'CSM Name (or "auto")', 'text', (node.data.params && node.data.params.csmName) || 'auto', function (val) {
          if (!node.data.params) node.data.params = {};
          node.data.params.csmName = val;
        });
      }
    } else if (node.type === 'delay') {
      addField(panel, 'Duration', 'number', node.data.duration || 5, function (val) { node.data.duration = parseInt(val) || 1; });
      addSelect(panel, 'Unit', ['seconds', 'minutes', 'hours'], node.data.unit || 'seconds', function (val) { node.data.unit = val; });
    } else if (node.type === 'api') {
      addField(panel, 'URL', 'text', node.data.url || '', function (val) { node.data.url = val; });
      addSelect(panel, 'Method', ['GET', 'POST', 'PUT', 'DELETE'], node.data.method || 'GET', function (val) { node.data.method = val; });
      addField(panel, 'Body (JSON)', 'textarea', node.data.body || '', function (val) { node.data.body = val; });
    }
  }

  function renderOptionsEditor(panel, node) {
    var wrapper = document.createElement('div');
    wrapper.className = 'bb-options-editor';

    var title = document.createElement('div');
    title.className = 'bb-options-editor__title';
    title.textContent = 'Response Options';
    wrapper.appendChild(title);

    var list = document.createElement('div');
    list.className = 'bb-options-editor__list';

    (node.data.options || []).forEach(function (opt, idx) {
      var row = document.createElement('div');
      row.className = 'bb-options-editor__row';

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'form__input form__input--sm';
      input.value = opt.text;
      input.addEventListener('change', function () {
        opt.text = this.value;
        opt.value = this.value.toLowerCase().replace(/\s+/g, '_');
        document.dispatchEvent(new CustomEvent('bb-node-updated', { detail: { nodeId: node.id } }));
      });
      row.appendChild(input);

      var removeBtn = document.createElement('button');
      removeBtn.className = 'btn btn--danger btn--xs';
      removeBtn.textContent = 'x';
      removeBtn.addEventListener('click', function () {
        node.data.options.splice(idx, 1);
        renderProperties(node, panel);
        document.dispatchEvent(new CustomEvent('bb-node-updated', { detail: { nodeId: node.id } }));
      });
      row.appendChild(removeBtn);

      list.appendChild(row);
    });

    wrapper.appendChild(list);

    var addBtn = document.createElement('button');
    addBtn.className = 'btn btn--secondary btn--sm';
    addBtn.textContent = '+ Add Option';
    addBtn.addEventListener('click', function () {
      var newId = 'opt_' + Date.now();
      if (!node.data.options) node.data.options = [];
      node.data.options.push({ id: newId, text: 'New Option', value: 'new_option' });
      renderProperties(node, panel);
      document.dispatchEvent(new CustomEvent('bb-node-updated', { detail: { nodeId: node.id } }));
    });
    wrapper.appendChild(addBtn);

    panel.appendChild(wrapper);
  }

  function addField(panel, label, type, value, onChange) {
    var group = document.createElement('div');
    group.className = 'form__group';

    var lbl = document.createElement('label');
    lbl.className = 'form__label';
    lbl.textContent = label;
    group.appendChild(lbl);

    var input;
    if (type === 'textarea') {
      input = document.createElement('textarea');
      input.className = 'form__textarea';
      input.rows = 3;
      input.value = value;
    } else {
      input = document.createElement('input');
      input.type = type;
      input.className = 'form__input';
      input.value = value;
    }

    input.addEventListener('change', function () { onChange(this.value); });
    group.appendChild(input);
    panel.appendChild(group);
  }

  function addSelect(panel, label, options, value, onChange) {
    var group = document.createElement('div');
    group.className = 'form__group';

    var lbl = document.createElement('label');
    lbl.className = 'form__label';
    lbl.textContent = label;
    group.appendChild(lbl);

    var sel = document.createElement('select');
    sel.className = 'toolbar__select';
    options.forEach(function (opt) {
      var o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      if (opt === value) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { onChange(this.value); });
    group.appendChild(sel);
    panel.appendChild(group);
  }

  function truncate(text, max) {
    if (!text || text.length <= max) return text || '';
    return text.substring(0, max) + '...';
  }

  return {
    NODE_TYPES: NODE_TYPES,
    getOutputs: getOutputs,
    createNodeElement: createNodeElement,
    renderProperties: renderProperties
  };
})();
