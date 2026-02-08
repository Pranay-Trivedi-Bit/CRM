/**
 * Bot Builder - Main orchestrator for the visual bot builder
 */
var BotBuilder = (function () {
  'use strict';

  var currentFlow = null;
  var nodes = {};
  var selectedNodeId = null;
  var selectedConnId = null;
  var isDirty = false;
  var dragState = null;
  var connectionDrag = null;

  // DOM references
  var els = {};

  function init() {
    els.container = document.getElementById('bbContainer');
    els.canvas = document.getElementById('bbCanvas');
    els.svg = document.getElementById('bbSvg');
    els.nodesContainer = document.getElementById('bbNodes');
    els.palette = document.getElementById('bbPalette');
    els.toolbar = document.getElementById('bbToolbar');
    els.flowName = document.getElementById('bbFlowName');
    els.empty = document.getElementById('bbEmpty');
    els.properties = document.getElementById('waProperties');
    els.propertiesBody = document.getElementById('waPropertiesBody');
    els.propertiesClose = document.getElementById('waPropertiesClose');

    BotBuilderCanvas.init(els.svg, els.container, els.canvas);
    bindEvents();
  }

  function bindEvents() {
    // Palette drag
    var paletteNodes = document.querySelectorAll('.bb-palette__node');
    for (var i = 0; i < paletteNodes.length; i++) {
      paletteNodes[i].addEventListener('dragstart', onPaletteDragStart);
    }

    els.container.addEventListener('dragover', function (e) { e.preventDefault(); });
    els.container.addEventListener('drop', onCanvasDrop);

    // Canvas click to deselect
    els.canvas.addEventListener('click', function (e) {
      if (e.target === els.canvas || e.target === els.nodesContainer || e.target === els.svg) {
        deselectAll();
      }
    });

    // Connection drag events on canvas
    els.canvas.addEventListener('mousemove', onCanvasMouseMove);
    els.canvas.addEventListener('mouseup', onCanvasMouseUp);

    // Delete key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
        if (selectedConnId) {
          deleteConnection(selectedConnId);
        } else if (selectedNodeId) {
          deleteNode(selectedNodeId);
        }
      }
    });

    // Connection selection event
    document.addEventListener('bb-connection-selected', function (e) {
      selectedConnId = e.detail.connId;
      selectedNodeId = null;
    });

    // Node updated event (from properties panel)
    document.addEventListener('bb-node-updated', function (e) {
      var nodeId = e.detail.nodeId;
      if (nodes[nodeId]) {
        refreshNodeElement(nodeId);
        isDirty = true;
      }
    });

    // Toolbar buttons
    document.getElementById('btnSaveFlow').addEventListener('click', saveFlow);
    document.getElementById('btnTestFlow').addEventListener('click', testFlow);
    document.getElementById('btnActivateFlow').addEventListener('click', activateFlow);
    document.getElementById('btnDeleteFlow').addEventListener('click', deleteFlow);

    // Properties close
    if (els.propertiesClose) {
      els.propertiesClose.addEventListener('click', function () {
        els.properties.style.display = 'none';
        deselectAll();
      });
    }

    // New flow button
    document.getElementById('btnNewFlow').addEventListener('click', createNewFlow);

    // Test panel
    document.getElementById('bbTestClose').addEventListener('click', function () {
      document.getElementById('bbTestPanel').style.display = 'none';
    });
    document.getElementById('bbTestSend').addEventListener('click', sendTestMessage);
    document.getElementById('bbTestInput').addEventListener('keypress', function (e) {
      if (e.key === 'Enter') sendTestMessage();
    });
  }

  function onPaletteDragStart(e) {
    e.dataTransfer.setData('nodeType', e.target.dataset.nodeType);
  }

  function onCanvasDrop(e) {
    e.preventDefault();
    var nodeType = e.dataTransfer.getData('nodeType');
    if (!nodeType || !currentFlow) return;

    var canvasRect = els.canvas.getBoundingClientRect();
    var zoom = BotBuilderCanvas.getZoom();
    var x = (e.clientX - canvasRect.left) / zoom;
    var y = (e.clientY - canvasRect.top) / zoom;

    addNode(nodeType, x, y);
  }

  function addNode(type, x, y) {
    var typeDef = BotBuilderNodes.NODE_TYPES[type];
    if (!typeDef) return;

    // Only allow one start node
    if (type === 'start') {
      for (var nid in nodes) {
        if (nodes[nid].type === 'start') {
          showToast('Only one Start node is allowed', 'error');
          return;
        }
      }
    }

    var nodeId = 'node_' + Date.now() + '_' + Math.random().toString(16).substring(2, 6);
    var node = {
      id: nodeId,
      type: type,
      position: { x: x, y: y },
      data: JSON.parse(JSON.stringify(typeDef.defaultData))
    };

    nodes[nodeId] = node;
    currentFlow.nodes.push(node);
    renderNode(node);
    isDirty = true;
    selectNode(nodeId);
  }

  function renderNode(node) {
    var el = BotBuilderNodes.createNodeElement(node);
    if (!el) return;

    // Make node draggable
    el.addEventListener('mousedown', function (e) {
      if (e.target.classList.contains('bb-port')) return;
      startDragNode(node.id, e);
    });

    // Click to select
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!e.target.classList.contains('bb-port')) {
        selectNode(node.id);
      }
    });

    // Port events
    var ports = el.querySelectorAll('.bb-port');
    for (var i = 0; i < ports.length; i++) {
      ports[i].addEventListener('mousedown', onPortMouseDown);
    }

    els.nodesContainer.appendChild(el);
  }

  function refreshNodeElement(nodeId) {
    var node = nodes[nodeId];
    if (!node) return;

    var oldEl = els.nodesContainer.querySelector('[data-node-id="' + nodeId + '"]');
    if (oldEl) {
      var newEl = BotBuilderNodes.createNodeElement(node);

      // Make node draggable
      newEl.addEventListener('mousedown', function (e) {
        if (e.target.classList.contains('bb-port')) return;
        startDragNode(nodeId, e);
      });

      newEl.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!e.target.classList.contains('bb-port')) {
          selectNode(nodeId);
        }
      });

      var ports = newEl.querySelectorAll('.bb-port');
      for (var i = 0; i < ports.length; i++) {
        ports[i].addEventListener('mousedown', onPortMouseDown);
      }

      if (oldEl.classList.contains('bb-node--selected')) {
        newEl.classList.add('bb-node--selected');
      }

      oldEl.replaceWith(newEl);
    }
  }

  function deleteNode(nodeId) {
    if (!nodes[nodeId]) return;

    // Remove connections to/from this node
    currentFlow.connections = currentFlow.connections.filter(function (conn) {
      if (conn.from === nodeId || conn.to === nodeId) {
        BotBuilderCanvas.removeConnection(conn.id);
        return false;
      }
      return true;
    });

    // Remove from flow
    currentFlow.nodes = currentFlow.nodes.filter(function (n) { return n.id !== nodeId; });
    delete nodes[nodeId];

    // Remove DOM element
    var el = els.nodesContainer.querySelector('[data-node-id="' + nodeId + '"]');
    if (el) el.remove();

    deselectAll();
    isDirty = true;
  }

  function deleteConnection(connId) {
    currentFlow.connections = currentFlow.connections.filter(function (c) { return c.id !== connId; });
    BotBuilderCanvas.removeConnection(connId);
    selectedConnId = null;
    isDirty = true;
  }

  function selectNode(nodeId) {
    deselectAll();
    selectedNodeId = nodeId;
    selectedConnId = null;

    var el = els.nodesContainer.querySelector('[data-node-id="' + nodeId + '"]');
    if (el) el.classList.add('bb-node--selected');

    // Show properties
    var node = nodes[nodeId];
    if (node) {
      els.properties.style.display = '';
      BotBuilderNodes.renderProperties(node, els.propertiesBody);
    }
  }

  function deselectAll() {
    selectedNodeId = null;
    selectedConnId = null;

    var selected = els.nodesContainer.querySelectorAll('.bb-node--selected');
    for (var i = 0; i < selected.length; i++) {
      selected[i].classList.remove('bb-node--selected');
    }

    var selectedConns = els.svg.querySelectorAll('.bb-connection--selected');
    for (var j = 0; j < selectedConns.length; j++) {
      selectedConns[j].classList.remove('bb-connection--selected');
    }

    els.properties.style.display = 'none';
  }

  // --- Node Dragging ---
  function startDragNode(nodeId, e) {
    var el = els.nodesContainer.querySelector('[data-node-id="' + nodeId + '"]');
    if (!el) return;

    var zoom = BotBuilderCanvas.getZoom();
    dragState = {
      nodeId: nodeId,
      el: el,
      offsetX: e.clientX / zoom - parseInt(el.style.left),
      offsetY: e.clientY / zoom - parseInt(el.style.top)
    };

    e.preventDefault();
    document.addEventListener('mousemove', onDragNodeMove);
    document.addEventListener('mouseup', onDragNodeEnd);
  }

  function onDragNodeMove(e) {
    if (!dragState) return;
    var zoom = BotBuilderCanvas.getZoom();
    var x = e.clientX / zoom - dragState.offsetX;
    var y = e.clientY / zoom - dragState.offsetY;

    x = Math.max(0, x);
    y = Math.max(0, y);

    dragState.el.style.left = x + 'px';
    dragState.el.style.top = y + 'px';

    // Update node position
    nodes[dragState.nodeId].position.x = x;
    nodes[dragState.nodeId].position.y = y;

    BotBuilderCanvas.updateConnectionsForNode(dragState.nodeId);
  }

  function onDragNodeEnd() {
    if (dragState) {
      isDirty = true;
      dragState = null;
    }
    document.removeEventListener('mousemove', onDragNodeMove);
    document.removeEventListener('mouseup', onDragNodeEnd);
  }

  // --- Port Connection Dragging ---
  function onPortMouseDown(e) {
    e.stopPropagation();
    e.preventDefault();

    var port = e.target.closest('.bb-port');
    if (!port) return;

    var nodeEl = port.closest('.bb-node');
    var portType = port.dataset.portType;
    var portId = port.dataset.portId;

    if (portType !== 'output') return; // Only drag from output ports

    var canvasRect = els.canvas.getBoundingClientRect();
    var zoom = BotBuilderCanvas.getZoom();
    var portRect = port.getBoundingClientRect();
    var startX = (portRect.left + portRect.width / 2 - canvasRect.left) / zoom;
    var startY = (portRect.top + portRect.height / 2 - canvasRect.top) / zoom;

    connectionDrag = BotBuilderCanvas.startDragConnection(nodeEl, portId, startX, startY);
    connectionDrag.fromNodeId = nodeEl.dataset.nodeId;
    connectionDrag.fromPortId = portId;
  }

  function onCanvasMouseMove(e) {
    if (connectionDrag) {
      BotBuilderCanvas.updateDragConnection(connectionDrag, e.clientX, e.clientY);
    }
  }

  function onCanvasMouseUp(e) {
    if (!connectionDrag) return;

    BotBuilderCanvas.endDragConnection();

    // Check if we dropped on an input port
    var target = document.elementFromPoint(e.clientX, e.clientY);
    if (target) {
      var port = target.closest('.bb-port--input');
      if (port) {
        var toNodeEl = port.closest('.bb-node');
        var toNodeId = toNodeEl.dataset.nodeId;
        var toPortId = port.dataset.portId;

        // Don't connect to self
        if (toNodeId !== connectionDrag.fromNodeId) {
          createConnection(connectionDrag.fromNodeId, connectionDrag.fromPortId, toNodeId, toPortId);
        }
      }
    }

    connectionDrag = null;
  }

  function createConnection(fromNodeId, fromPort, toNodeId, toPort) {
    // Check if connection already exists
    var exists = currentFlow.connections.some(function (c) {
      return c.from === fromNodeId && c.fromPort === fromPort;
    });
    if (exists) return;

    var connId = 'conn_' + Date.now() + '_' + Math.random().toString(16).substring(2, 4);
    var conn = { id: connId, from: fromNodeId, fromPort: fromPort, to: toNodeId, toPort: toPort };
    currentFlow.connections.push(conn);

    var fromEl = els.nodesContainer.querySelector('[data-node-id="' + fromNodeId + '"]');
    var toEl = els.nodesContainer.querySelector('[data-node-id="' + toNodeId + '"]');
    BotBuilderCanvas.drawConnection(connId, fromEl, fromPort, toEl, toPort);
    isDirty = true;
  }

  // --- Flow Management ---
  function loadFlow(flow) {
    currentFlow = flow;
    nodes = {};
    els.nodesContainer.innerHTML = '';
    BotBuilderCanvas.clearAll();

    els.flowName.textContent = flow.name;
    els.empty.style.display = 'none';
    enableToolbar(true);

    // Render nodes
    for (var i = 0; i < flow.nodes.length; i++) {
      var node = flow.nodes[i];
      nodes[node.id] = node;
      renderNode(node);
    }

    // Render connections (after all nodes are in DOM)
    setTimeout(function () {
      for (var j = 0; j < flow.connections.length; j++) {
        var conn = flow.connections[j];
        var fromEl = els.nodesContainer.querySelector('[data-node-id="' + conn.from + '"]');
        var toEl = els.nodesContainer.querySelector('[data-node-id="' + conn.to + '"]');
        if (fromEl && toEl) {
          BotBuilderCanvas.drawConnection(conn.id, fromEl, conn.fromPort, toEl, conn.toPort);
        }
      }
    }, 50);

    isDirty = false;
  }

  function clearCanvas() {
    currentFlow = null;
    nodes = {};
    els.nodesContainer.innerHTML = '';
    BotBuilderCanvas.clearAll();
    els.flowName.textContent = 'Select or create a flow';
    els.empty.style.display = '';
    els.properties.style.display = 'none';
    enableToolbar(false);
    isDirty = false;
  }

  function enableToolbar(enabled) {
    document.getElementById('btnSaveFlow').disabled = !enabled;
    document.getElementById('btnTestFlow').disabled = !enabled;
    document.getElementById('btnActivateFlow').disabled = !enabled;
    document.getElementById('btnDeleteFlow').disabled = !enabled;
  }

  async function saveFlow() {
    if (!currentFlow) return;

    // Sync node positions from DOM
    currentFlow.nodes = Object.values(nodes);

    try {
      var method = currentFlow.id && !currentFlow._isNew ? 'PUT' : 'POST';
      var url = method === 'PUT' ? '/api/flows/' + currentFlow.id : '/api/flows';

      var res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentFlow)
      });
      var data = await res.json();
      if (data.flow) {
        currentFlow = data.flow;
        delete currentFlow._isNew;
        isDirty = false;
        showToast('Flow saved', 'success');
        WhatsAppModule.loadFlows();
      }
    } catch (err) {
      showToast('Failed to save flow: ' + err.message, 'error');
    }
  }

  async function activateFlow() {
    if (!currentFlow || !currentFlow.id) return;
    try {
      await fetch('/api/flows/' + currentFlow.id + '/activate', { method: 'POST' });
      showToast('Flow activated', 'success');
      WhatsAppModule.loadFlows();
    } catch (err) {
      showToast('Failed to activate: ' + err.message, 'error');
    }
  }

  async function deleteFlow() {
    if (!currentFlow || !currentFlow.id) return;
    if (!confirm('Delete this flow? This cannot be undone.')) return;
    try {
      await fetch('/api/flows/' + currentFlow.id, { method: 'DELETE' });
      showToast('Flow deleted', 'success');
      clearCanvas();
      WhatsAppModule.loadFlows();
    } catch (err) {
      showToast('Failed to delete: ' + err.message, 'error');
    }
  }

  async function testFlow() {
    if (!currentFlow) return;
    var panel = document.getElementById('bbTestPanel');
    var messages = document.getElementById('bbTestMessages');
    messages.innerHTML = '';
    panel.style.display = '';

    // Save first if dirty
    if (isDirty) await saveFlow();

    try {
      var res = await fetch('/api/flows/' + currentFlow.id + '/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'hi' })
      });
      var data = await res.json();
      (data.responses || []).forEach(function (resp) {
        var bubble = document.createElement('div');
        bubble.className = 'wa-chat-bubble wa-chat-bubble--received';
        if (resp.type === 'question') {
          bubble.innerHTML = '<div class="wa-chat-bubble__text">' + escapeHtml(resp.text) + '</div>' +
            '<div class="wa-chat-bubble__options">' +
            (resp.options || []).map(function (o) { return '<button class="wa-chat-bubble__option">' + escapeHtml(o.text) + '</button>'; }).join('') +
            '</div>';
        } else if (resp.type === 'action') {
          bubble.className = 'wa-chat-bubble wa-chat-bubble--system';
          bubble.textContent = '[Action: ' + resp.actionType + '] ' + (resp.label || '');
        } else if (resp.type === 'delay') {
          bubble.className = 'wa-chat-bubble wa-chat-bubble--system';
          bubble.textContent = '[Delay: ' + resp.duration + ' ' + resp.unit + ']';
        } else {
          bubble.innerHTML = '<div class="wa-chat-bubble__text">' + escapeHtml(resp.text || '') + '</div>';
        }
        messages.appendChild(bubble);
      });
    } catch (err) {
      messages.innerHTML = '<div class="wa-empty-hint">Error: ' + err.message + '</div>';
    }
  }

  function sendTestMessage() {
    var input = document.getElementById('bbTestInput');
    var msg = input.value.trim();
    if (!msg) return;

    var messages = document.getElementById('bbTestMessages');
    var bubble = document.createElement('div');
    bubble.className = 'wa-chat-bubble wa-chat-bubble--sent';
    bubble.textContent = msg;
    messages.appendChild(bubble);
    input.value = '';

    // In test mode, just show the message was sent
    // Full test would require stateful flow simulation
  }

  function createNewFlow() {
    var name = prompt('Enter flow name:');
    if (!name) return;

    var flow = {
      _isNew: true,
      name: name,
      description: '',
      isActive: false,
      nodes: [],
      connections: []
    };

    // Auto-add a start node
    var startNode = {
      id: 'node_' + Date.now() + '_start',
      type: 'start',
      position: { x: 100, y: 200 },
      data: { label: 'Start', triggerKeyword: 'hi' }
    };
    flow.nodes.push(startNode);

    loadFlow(flow);
    isDirty = true;
  }

  function showToast(message, type) {
    // Use existing toast system if available
    var container = document.getElementById('toastContainer');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast toast--' + (type || 'info');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 3000);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    init: init,
    loadFlow: loadFlow,
    clearCanvas: clearCanvas,
    getCurrentFlow: function () { return currentFlow; }
  };
})();
