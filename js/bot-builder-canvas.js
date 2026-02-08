/**
 * Bot Builder Canvas - SVG connection lines, pan/zoom
 */
var BotBuilderCanvas = (function () {
  'use strict';

  var svg = null;
  var container = null;
  var canvasEl = null;
  var connections = {};
  var tempLine = null;
  var panState = { isPanning: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 };
  var zoom = 1;

  function init(svgElement, containerElement, canvasElement) {
    svg = svgElement;
    container = containerElement;
    canvasEl = canvasElement;

    // Set SVG to fill canvas
    svg.setAttribute('width', '5000');
    svg.setAttribute('height', '5000');

    // Pan with middle mouse or space+drag
    container.addEventListener('mousedown', function (e) {
      if (e.button === 1 || (e.button === 0 && e.target === container)) {
        panState.isPanning = true;
        panState.startX = e.clientX;
        panState.startY = e.clientY;
        panState.scrollLeft = container.scrollLeft;
        panState.scrollTop = container.scrollTop;
        container.style.cursor = 'grabbing';
        e.preventDefault();
      }
    });

    window.addEventListener('mousemove', function (e) {
      if (panState.isPanning) {
        container.scrollLeft = panState.scrollLeft - (e.clientX - panState.startX);
        container.scrollTop = panState.scrollTop - (e.clientY - panState.startY);
      }
    });

    window.addEventListener('mouseup', function () {
      if (panState.isPanning) {
        panState.isPanning = false;
        container.style.cursor = '';
      }
    });

    // Zoom with scroll wheel
    container.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        var delta = e.deltaY > 0 ? -0.1 : 0.1;
        zoom = Math.max(0.3, Math.min(2, zoom + delta));
        canvasEl.style.transform = 'scale(' + zoom + ')';
        canvasEl.style.transformOrigin = '0 0';
      }
    }, { passive: false });
  }

  function drawConnection(connId, fromEl, fromPort, toEl, toPort) {
    var fromRect = getPortPosition(fromEl, fromPort, 'output');
    var toRect = getPortPosition(toEl, toPort, 'input');

    if (!fromRect || !toRect) return;

    var path = createBezierPath(fromRect.x, fromRect.y, toRect.x, toRect.y);

    var pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', path);
    pathEl.setAttribute('class', 'bb-connection');
    pathEl.setAttribute('data-conn-id', connId);
    pathEl.setAttribute('fill', 'none');
    pathEl.setAttribute('stroke', 'rgba(167, 139, 250, 0.5)');
    pathEl.setAttribute('stroke-width', '2');

    // Click to select/delete
    pathEl.addEventListener('click', function (e) {
      e.stopPropagation();
      selectConnection(connId);
    });

    svg.appendChild(pathEl);
    connections[connId] = { pathEl: pathEl, fromEl: fromEl, fromPort: fromPort, toEl: toEl, toPort: toPort };
  }

  function removeConnection(connId) {
    if (connections[connId]) {
      connections[connId].pathEl.remove();
      delete connections[connId];
    }
  }

  function updateConnectionsForNode(nodeId) {
    for (var connId in connections) {
      var conn = connections[connId];
      var fromNodeId = conn.fromEl.dataset.nodeId;
      var toNodeId = conn.toEl.dataset.nodeId;

      if (fromNodeId === nodeId || toNodeId === nodeId) {
        var fromRect = getPortPosition(conn.fromEl, conn.fromPort, 'output');
        var toRect = getPortPosition(conn.toEl, conn.toPort, 'input');
        if (fromRect && toRect) {
          var path = createBezierPath(fromRect.x, fromRect.y, toRect.x, toRect.y);
          conn.pathEl.setAttribute('d', path);
        }
      }
    }
  }

  function selectConnection(connId) {
    // Deselect all
    var all = svg.querySelectorAll('.bb-connection');
    for (var i = 0; i < all.length; i++) {
      all[i].classList.remove('bb-connection--selected');
    }
    if (connections[connId]) {
      connections[connId].pathEl.classList.add('bb-connection--selected');
    }
    // Dispatch event for deletion
    document.dispatchEvent(new CustomEvent('bb-connection-selected', { detail: { connId: connId } }));
  }

  function startDragConnection(fromEl, fromPort, startX, startY) {
    tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tempLine.setAttribute('class', 'bb-connection bb-connection--temp');
    tempLine.setAttribute('fill', 'none');
    tempLine.setAttribute('stroke', 'rgba(167, 139, 250, 0.3)');
    tempLine.setAttribute('stroke-width', '2');
    tempLine.setAttribute('stroke-dasharray', '5,5');
    svg.appendChild(tempLine);
    return { fromEl: fromEl, fromPort: fromPort, startX: startX, startY: startY };
  }

  function updateDragConnection(dragState, mouseX, mouseY) {
    if (!tempLine) return;
    var canvasRect = canvasEl.getBoundingClientRect();
    var x = (mouseX - canvasRect.left) / zoom;
    var y = (mouseY - canvasRect.top) / zoom;
    var path = createBezierPath(dragState.startX, dragState.startY, x, y);
    tempLine.setAttribute('d', path);
  }

  function endDragConnection() {
    if (tempLine) {
      tempLine.remove();
      tempLine = null;
    }
  }

  function clearAll() {
    for (var connId in connections) {
      connections[connId].pathEl.remove();
    }
    connections = {};
  }

  function getPortPosition(nodeEl, portId, portType) {
    var port = nodeEl.querySelector('[data-port-id="' + portId + '"]');
    if (!port) {
      // Fallback: use the node's default input/output port
      port = nodeEl.querySelector(portType === 'input' ? '.bb-port--input' : '.bb-port--output');
    }
    if (!port) return null;

    var portRect = port.getBoundingClientRect();
    var canvasRect = canvasEl.getBoundingClientRect();
    return {
      x: (portRect.left + portRect.width / 2 - canvasRect.left) / zoom,
      y: (portRect.top + portRect.height / 2 - canvasRect.top) / zoom
    };
  }

  function createBezierPath(x1, y1, x2, y2) {
    var dx = Math.abs(x2 - x1) * 0.5;
    return 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (x2 - dx) + ' ' + y2 + ', ' + x2 + ' ' + y2;
  }

  function getZoom() { return zoom; }

  function getCanvasOffset() {
    if (!canvasEl) return { x: 0, y: 0 };
    var rect = canvasEl.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  }

  return {
    init: init,
    drawConnection: drawConnection,
    removeConnection: removeConnection,
    updateConnectionsForNode: updateConnectionsForNode,
    startDragConnection: startDragConnection,
    updateDragConnection: updateDragConnection,
    endDragConnection: endDragConnection,
    clearAll: clearAll,
    getZoom: getZoom,
    getCanvasOffset: getCanvasOffset
  };
})();
