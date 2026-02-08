/**
 * WhatsApp Marketing Module — Single Koenig Solutions Brand Account
 * All messages sent from one Koenig WhatsApp Business number (WHATSAPP_PHONE_NUMBER_ID).
 * - Real-time auto-acknowledge when new leads are generated
 * - Bulk WhatsApp messaging from dashboard leads
 * - Message history tracking
 */
var WAMarketing = (function () {
  'use strict';

  var initialized = false;
  var autoAckEnabled = false;
  var apiConfigured = false;
  var lastKnownLeadCount = 0;
  var autoAckPollInterval = null;
  var messageHistory = [];

  function init() {
    if (!initialized) {
      initialized = true;
      bindEvents();
      loadSettings();
      loadMessageHistory();
      loadCSMOptions();
    }
    // Always re-check API status when tab activates
    checkAPIConfig();
  }

  function checkAPIConfig() {
    fetch('/api/whatsapp/config')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var btn = document.getElementById('wamApiStatusBtn');
        if (data.configured) {
          apiConfigured = true;
          if (btn) {
            btn.className = 'wam-status-btn wam-status-btn--live';
            btn.innerHTML = '<span class="wam-status-btn__dot"></span> LIVE';
          }
        } else {
          apiConfigured = false;
          if (btn) {
            btn.className = 'wam-status-btn wam-status-btn--offline';
            btn.innerHTML = '<span class="wam-status-btn__dot"></span> NOT CONFIGURED';
          }
        }
      })
      .catch(function () {});
  }

  function syncToggleSwitch(on) {
    var sw = document.getElementById('wamAutoAckSwitch');
    if (sw) {
      if (on) sw.classList.add('wam-toggle--on');
      else sw.classList.remove('wam-toggle--on');
    }
  }

  function bindEvents() {
    // Auto-acknowledge header click — opens/closes the panel
    var ackHeader = document.getElementById('wamAutoAckHeader');
    var statusBtn = document.getElementById('wamApiStatusBtn');
    var toggle = document.getElementById('wamAutoAckToggle');
    var sw = document.getElementById('wamAutoAckSwitch');
    if (ackHeader) {
      ackHeader.addEventListener('click', function (e) {
        // If user clicked the status button or toggle, don't toggle the panel
        if (statusBtn && (e.target === statusBtn || statusBtn.contains(e.target))) return;
        if (sw && (e.target === sw || sw.contains(e.target))) return;
        var body = document.getElementById('wamAutoAckBody');
        var arrow = document.getElementById('wamAutoAckArrow');
        var isOpen = body && body.style.display !== 'none';
        if (isOpen) {
          if (body) body.style.display = 'none';
          if (arrow) arrow.classList.remove('wam-expand-arrow--open');
        } else {
          if (body) body.style.display = '';
          if (arrow) arrow.classList.add('wam-expand-arrow--open');
        }
      });
    }

    // Toggle switch — ON/OFF for auto-acknowledge mode
    if (sw) {
      sw.addEventListener('click', function (e) {
        e.stopPropagation();
        autoAckEnabled = !autoAckEnabled;
        if (toggle) toggle.checked = autoAckEnabled;
        syncToggleSwitch(autoAckEnabled);
        if (autoAckEnabled) {
          startAutoAckPolling();
        } else {
          stopAutoAckPolling();
        }
        saveSettings();
      });
    }

    // Recent Messages header click — toggle open/close
    var recentHeader = document.getElementById('wamRecentHeader');
    if (recentHeader) {
      recentHeader.addEventListener('click', function () {
        var body = document.getElementById('wamRecentBody');
        var arrow = document.getElementById('wamRecentArrow');
        var isOpen = body && body.style.display !== 'none';
        if (isOpen) {
          if (body) body.style.display = 'none';
          if (arrow) arrow.classList.remove('wam-expand-arrow--open');
        } else {
          if (body) body.style.display = '';
          if (arrow) arrow.classList.add('wam-expand-arrow--open');
          loadMessageHistory(); // refresh sent messages when opening
        }
      });
    }

    // Bulk Send header click — toggle open/close
    var bulkHeader = document.getElementById('wamBulkSendHeader');
    if (bulkHeader) {
      bulkHeader.addEventListener('click', function () {
        var body = document.getElementById('wamBulkSendBody');
        var arrow = document.getElementById('wamBulkSendArrow');
        var isOpen = body && body.style.display !== 'none';
        if (isOpen) {
          if (body) body.style.display = 'none';
          if (arrow) arrow.classList.remove('wam-expand-arrow--open');
        } else {
          if (body) body.style.display = '';
          if (arrow) arrow.classList.add('wam-expand-arrow--open');
        }
      });
    }

    // Template variable chips - click to insert
    var chips = document.querySelectorAll('.wam-var-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].addEventListener('click', function () {
        var textarea = this.closest('.wam-form-group').querySelector('textarea');
        if (textarea) {
          var start = textarea.selectionStart;
          var end = textarea.selectionEnd;
          var text = textarea.value;
          textarea.value = text.substring(0, start) + this.textContent + text.substring(end);
          textarea.focus();
          textarea.setSelectionRange(start + this.textContent.length, start + this.textContent.length);
        }
      });
    }

    // Load leads button
    var loadBtn = document.getElementById('wamLoadLeads');
    if (loadBtn) loadBtn.addEventListener('click', loadDashboardLeads);

    // Select all checkbox
    var selectAll = document.getElementById('wamSelectAll');
    if (selectAll) {
      selectAll.addEventListener('change', function () {
        var checkboxes = document.querySelectorAll('.wam-lead-check');
        for (var j = 0; j < checkboxes.length; j++) {
          checkboxes[j].checked = this.checked;
        }
        updateSelectedCount();
      });
    }

    // Send bulk button
    var sendBtn = document.getElementById('wamSendBulk');
    if (sendBtn) sendBtn.addEventListener('click', sendBulkMessages);

    // Save template on change
    var ackTemplate = document.getElementById('wamAckTemplate');
    if (ackTemplate) {
      ackTemplate.addEventListener('input', debounce(function () {
        saveSettings();
      }, 500));
    }

    // Filter changes
    var filters = ['wamFilterStatus', 'wamFilterTemp', 'wamFilterCSM'];
    filters.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', loadDashboardLeads);
    });
  }

  // ============ Settings Persistence ============
  function loadSettings() {
    try {
      var settings = JSON.parse(localStorage.getItem('wamSettings') || '{}');
      autoAckEnabled = settings.autoAckEnabled || false;
      var toggle = document.getElementById('wamAutoAckToggle');
      if (toggle) toggle.checked = autoAckEnabled;
      syncToggleSwitch(autoAckEnabled);
      // Panel starts collapsed — user clicks header to open
      var body = document.getElementById('wamAutoAckBody');
      if (body) body.style.display = 'none';
      var arrow = document.getElementById('wamAutoAckArrow');
      if (arrow) arrow.classList.remove('wam-expand-arrow--open');
      var template = document.getElementById('wamAckTemplate');
      if (template && settings.ackTemplate) template.value = settings.ackTemplate;

      // Track current lead count
      lastKnownLeadCount = getLeadsData().length;

      if (autoAckEnabled) startAutoAckPolling();
    } catch (e) { /* ignore */ }
  }

  function saveSettings() {
    try {
      var template = document.getElementById('wamAckTemplate');
      localStorage.setItem('wamSettings', JSON.stringify({
        autoAckEnabled: autoAckEnabled,
        ackTemplate: template ? template.value : ''
      }));
    } catch (e) { /* ignore */ }
  }

  // ============ Auto-Acknowledge Polling ============
  function startAutoAckPolling() {
    stopAutoAckPolling();
    lastKnownLeadCount = getLeadsData().length;
    // Check for new leads every 3 seconds
    autoAckPollInterval = setInterval(checkForNewLeads, 3000);
  }

  function stopAutoAckPolling() {
    if (autoAckPollInterval) {
      clearInterval(autoAckPollInterval);
      autoAckPollInterval = null;
    }
  }

  function checkForNewLeads() {
    if (!autoAckEnabled) return;
    var leads = getLeadsData();
    var currentCount = leads.length;

    if (currentCount > lastKnownLeadCount) {
      // New leads detected!
      var newLeads = leads.slice(lastKnownLeadCount);
      var template = document.getElementById('wamAckTemplate');
      var messageTemplate = template ? template.value : 'Hi {{name}}, thank you for your interest!';

      newLeads.forEach(function (lead) {
        if (lead.phone) {
          sendAutoAck(lead, messageTemplate);
        }
      });

      lastKnownLeadCount = currentCount;
      updateAckStats();
    } else if (currentCount < lastKnownLeadCount) {
      // Leads were removed, update count
      lastKnownLeadCount = currentCount;
    }
  }

  async function sendAutoAck(lead, template) {
    var message = interpolateTemplate(template, lead);

    try {
      var res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: lead.phone,
          text: message,
          leadId: lead.id,
          leadName: lead.name,
          csmName: lead.assignedTo || ''
        })
      });
      var data = await res.json();

      addToHistory({
        type: 'auto-ack',
        leadName: lead.name || 'Unknown',
        phone: lead.phone,
        csmName: lead.assignedTo || '',
        message: message,
        status: data.success ? 'sent' : 'failed',
        simulated: data.simulated || false,
        timestamp: new Date().toISOString()
      });

      showToast('Auto-ack sent to ' + (lead.name || lead.phone), 'success');
    } catch (err) {
      addToHistory({
        type: 'auto-ack',
        leadName: lead.name || 'Unknown',
        phone: lead.phone,
        csmName: lead.assignedTo || '',
        message: message,
        status: 'failed',
        timestamp: new Date().toISOString()
      });
    }
  }

  // ============ Dashboard Leads Loading ============
  function loadDashboardLeads() {
    var dispositionFilter = document.getElementById('wamFilterStatus').value;
    var tempFilter = document.getElementById('wamFilterTemp').value;
    var csmFilter = document.getElementById('wamFilterCSM').value;

    var leads = getLeadsData();

    // Filter: only leads with phone numbers, using Disposition.classify() like the dashboard
    var filtered = leads.filter(function (l) {
      if (!l.phone) return false;

      // Classify using the same Disposition engine as the dashboard
      var classification = (typeof Disposition !== 'undefined')
        ? Disposition.classify(l.currentRemark || l.lastRemark || l.remark || '')
        : { disposition: l.disposition || '', subDisposition: l.subDisposition || '', leadTemp: l.priority || l.temperature || 'Cold' };

      if (dispositionFilter !== 'all' && classification.disposition !== dispositionFilter) return false;
      if (tempFilter !== 'all' && classification.leadTemp !== tempFilter) return false;
      if (csmFilter !== 'all' && l.assignedTo !== csmFilter) return false;
      return true;
    });

    renderLeadsTable(filtered);
  }

  function renderLeadsTable(leads) {
    var tbody = document.getElementById('wamLeadsBody');
    if (!tbody) return;

    if (leads.length === 0) {
      tbody.innerHTML = '<tr><td colspan="13" class="wam-empty">No leads with phone numbers match your filters.</td></tr>';
      updateSelectedCount();
      return;
    }

    tbody.innerHTML = '';
    leads.forEach(function (lead, idx) {
      var tr = document.createElement('tr');

      // Use Disposition.classify() exactly like the dashboard does
      var remark = lead.currentRemark || lead.lastRemark || lead.remark || '';
      var classification = (typeof Disposition !== 'undefined')
        ? Disposition.classify(remark)
        : { disposition: lead.disposition || 'Remark Not Clear', subDisposition: lead.subDisposition || 'Remark Not Clear', leadTemp: lead.priority || lead.temperature || 'Cold' };

      var dispClass = (typeof Disposition !== 'undefined')
        ? Disposition.getDispositionClass(classification.disposition)
        : 'unclear';
      var tempClass = (typeof Disposition !== 'undefined')
        ? Disposition.getLeadTempClass(classification.leadTemp)
        : (classification.leadTemp || 'cold').toLowerCase();

      tr.innerHTML =
        '<td><input type="checkbox" class="wam-lead-check" data-idx="' + idx + '" data-lead-id="' + (lead.id || '') + '" checked></td>' +
        '<td><strong>' + escapeHtml(lead.name || 'Unknown') + '</strong></td>' +
        '<td>' +
          '<div class="wam-contact-cell">' +
            (lead.email ? '<span class="wam-contact-email">' + escapeHtml(lead.email) + '</span>' : '') +
            (lead.phone ? '<span class="wam-contact-phone">' + escapeHtml(lead.phone) + '</span>' : '') +
          '</div>' +
        '</td>' +
        '<td>' + escapeHtml(lead.company || '-') + '</td>' +
        '<td>' + escapeHtml(lead.jobTitle || '-') + '</td>' +
        '<td>' + escapeHtml(lead.seniority || '-') + '</td>' +
        '<td>' + escapeHtml(lead.campaign || '-') + '</td>' +
        '<td>' + escapeHtml(lead.location || '-') + '</td>' +
        '<td>' + escapeHtml(lead.assignedTo || '-') + '</td>' +
        '<td class="wam-remark-cell">' + escapeHtml(truncate(remark || '-', 40)) + '</td>' +
        '<td><span class="badge badge--disposition badge--disp-' + dispClass + '">' + escapeHtml(classification.disposition) + '</span></td>' +
        '<td><span class="badge badge--sub-disposition">' + escapeHtml(classification.subDisposition) + '</span></td>' +
        '<td><span class="badge badge--temp badge--temp-' + tempClass + '">' + escapeHtml(classification.leadTemp) + '</span></td>';

      var checkbox = tr.querySelector('.wam-lead-check');
      checkbox.addEventListener('change', updateSelectedCount);
      tbody.appendChild(tr);
    });

    // Store the filtered leads for sending
    tbody.dataset.leads = JSON.stringify(leads);
    updateSelectedCount();
  }

  function updateSelectedCount() {
    var checkboxes = document.querySelectorAll('.wam-lead-check');
    var checked = 0;
    for (var i = 0; i < checkboxes.length; i++) {
      if (checkboxes[i].checked) checked++;
    }

    var countEl = document.getElementById('wamSelectedCount');
    if (countEl) countEl.textContent = checked + ' leads selected';

    var sendBtn = document.getElementById('wamSendBulk');
    if (sendBtn) sendBtn.disabled = checked === 0;
  }

  function loadCSMOptions() {
    var select = document.getElementById('wamFilterCSM');
    if (!select) return;
    var leads = getLeadsData();
    var csms = {};
    leads.forEach(function (l) {
      if (l.assignedTo) csms[l.assignedTo] = true;
    });
    Object.keys(csms).sort().forEach(function (csm) {
      var opt = document.createElement('option');
      opt.value = csm;
      opt.textContent = csm;
      select.appendChild(opt);
    });
  }

  // ============ Bulk Send ============
  async function sendBulkMessages() {
    var tbody = document.getElementById('wamLeadsBody');
    var messageEl = document.getElementById('wamBulkMessage');
    if (!tbody || !messageEl) return;

    var messageTemplate = messageEl.value.trim();
    if (!messageTemplate) {
      showToast('Please type a message first.', 'error');
      return;
    }

    var leads = [];
    try { leads = JSON.parse(tbody.dataset.leads || '[]'); } catch (e) { return; }

    var checkboxes = document.querySelectorAll('.wam-lead-check');
    var selectedLeads = [];
    for (var i = 0; i < checkboxes.length; i++) {
      if (checkboxes[i].checked) {
        var idx = parseInt(checkboxes[i].dataset.idx);
        if (leads[idx]) selectedLeads.push(leads[idx]);
      }
    }

    if (selectedLeads.length === 0) {
      showToast('No leads selected.', 'error');
      return;
    }

    var sendBtn = document.getElementById('wamSendBulk');
    var statusEl = document.getElementById('wamSendStatus');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    var sentCount = 0;
    var failCount = 0;

    for (var j = 0; j < selectedLeads.length; j++) {
      var lead = selectedLeads[j];
      var message = interpolateTemplate(messageTemplate, lead);
      statusEl.textContent = 'Sending ' + (j + 1) + ' of ' + selectedLeads.length + '...';

      try {
        var res = await fetch('/api/messages/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: lead.phone,
            text: message,
            leadId: lead.id,
            leadName: lead.name,
            csmName: lead.assignedTo || ''
          })
        });
        var data = await res.json();

        addToHistory({
          type: 'bulk',
          leadName: lead.name || 'Unknown',
          phone: lead.phone,
          csmName: lead.assignedTo || '',
          message: message,
          status: data.success ? 'sent' : 'failed',
          simulated: data.simulated || false,
          timestamp: new Date().toISOString()
        });

        if (data.success) sentCount++;
        else failCount++;
      } catch (err) {
        failCount++;
        addToHistory({
          type: 'bulk',
          leadName: lead.name || 'Unknown',
          phone: lead.phone,
          csmName: lead.assignedTo || '',
          message: message,
          status: 'failed',
          timestamp: new Date().toISOString()
        });
      }

      // Small delay between sends to avoid rate limiting
      if (j < selectedLeads.length - 1) {
        await new Promise(function (resolve) { setTimeout(resolve, 200); });
      }
    }

    statusEl.textContent = 'Sent: ' + sentCount + ', Failed: ' + failCount;
    statusEl.style.color = failCount > 0 ? '#f59e0b' : '#34d399';
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg> Send WhatsApp Messages';

    showToast('Sent ' + sentCount + ' messages' + (failCount > 0 ? ', ' + failCount + ' failed' : ''), sentCount > 0 ? 'success' : 'error');

    renderMessageHistory();
    updateAckStats();
  }

  // ============ Message History ============
  function loadMessageHistory() {
    try {
      messageHistory = JSON.parse(localStorage.getItem('wamMessageHistory') || '[]');
    } catch (e) { messageHistory = []; }
    renderMessageHistory();
    updateAckStats();
  }

  function addToHistory(entry) {
    messageHistory.unshift(entry);
    if (messageHistory.length > 100) messageHistory = messageHistory.slice(0, 100);
    localStorage.setItem('wamMessageHistory', JSON.stringify(messageHistory));
    renderMessageHistory();
  }

  function renderMessageHistory() {
    var list = document.getElementById('wamRecentList');
    if (!list) return;

    if (messageHistory.length === 0) {
      list.innerHTML = '<div class="wam-empty">No messages sent yet.</div>';
      return;
    }

    list.innerHTML = '';
    var shown = messageHistory.slice(0, 20);
    shown.forEach(function (entry) {
      var item = document.createElement('div');
      item.className = 'wam-history-item';

      var statusIcon = entry.status === 'sent'
        ? '<svg viewBox="0 0 16 12" width="16" height="12"><path d="M1 6l3 3 7-7" fill="none" stroke="#34d399" stroke-width="1.5"/><path d="M4 6l3 3 7-7" fill="none" stroke="#34d399" stroke-width="1.5"/></svg>'
        : '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="6" fill="none" stroke="#f43f5e" stroke-width="1.5"/><line x1="5" y1="5" x2="11" y2="11" stroke="#f43f5e" stroke-width="1.5"/><line x1="11" y1="5" x2="5" y2="11" stroke="#f43f5e" stroke-width="1.5"/></svg>';

      var typeLabel = entry.type === 'auto-ack' ? '<span class="wam-type-badge wam-type-badge--ack">Auto-Ack</span>' : '<span class="wam-type-badge wam-type-badge--bulk">Bulk</span>';

      var csmInfo = entry.csmName ? '<span class="wam-type-badge wam-type-badge--csm">via ' + escapeHtml(entry.csmName) + '</span>' : '';

      item.innerHTML =
        '<div class="wam-history-item__status">' + statusIcon + '</div>' +
        '<div class="wam-history-item__body">' +
          '<div class="wam-history-item__top">' +
            '<strong>' + escapeHtml(entry.leadName) + '</strong>' +
            ' <span class="wam-history-item__phone">' + escapeHtml(entry.phone || '') + '</span>' +
            typeLabel +
            csmInfo +
            (entry.simulated ? '<span class="wam-type-badge wam-type-badge--sim">Simulated</span>' : '') +
          '</div>' +
          '<div class="wam-history-item__msg">' + escapeHtml(entry.message || '') + '</div>' +
          '<div class="wam-history-item__time">' + formatTime(entry.timestamp) + '</div>' +
        '</div>';

      list.appendChild(item);
    });
  }

  function updateAckStats() {
    var today = new Date().toISOString().split('T')[0];
    var sentToday = 0;
    var totalSent = 0;
    var failed = 0;

    messageHistory.forEach(function (entry) {
      if (entry.status === 'sent') {
        totalSent++;
        if (entry.timestamp && entry.timestamp.startsWith(today)) sentToday++;
      } else {
        failed++;
      }
    });

    var el1 = document.getElementById('wamAckSentToday');
    var el2 = document.getElementById('wamAckSentTotal');
    var el3 = document.getElementById('wamAckFailed');
    if (el1) el1.textContent = sentToday;
    if (el2) el2.textContent = totalSent;
    if (el3) el3.textContent = failed;
  }

  // ============ Helpers ============
  function interpolateTemplate(template, lead) {
    return template
      .replace(/\{\{name\}\}/gi, lead.name || 'there')
      .replace(/\{\{phone\}\}/gi, lead.phone || '')
      .replace(/\{\{email\}\}/gi, lead.email || '')
      .replace(/\{\{company\}\}/gi, lead.company || '')
      .replace(/\{\{jobTitle\}\}/gi, lead.jobTitle || '')
      .replace(/\{\{location\}\}/gi, lead.location || '')
      .replace(/\{\{campaign\}\}/gi, lead.campaign || '')
      .replace(/\{\{source\}\}/gi, lead.source || '')
      .replace(/\{\{status\}\}/gi, lead.status || '')
      .replace(/\{\{function\}\}/gi, (typeof JobFunction !== 'undefined' ? JobFunction.classify(lead.jobTitle) : '') || '')
      .replace(/\{\{industry\}\}/gi, (typeof Industry !== 'undefined' ? Industry.classify(lead.company) : '') || '');
  }

  function getLeadsData() {
    try {
      return JSON.parse(localStorage.getItem('salesLeads') || '[]');
    } catch (e) { return []; }
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function truncate(text, max) {
    if (!text || text.length <= max) return text || '';
    return text.substring(0, max) + '...';
  }

  function formatDate(iso) {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (e) { return '-'; }
  }

  function formatTime(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      var now = new Date();
      var diff = now - d;
      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
      if (diff < 86400000) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function debounce(fn, delay) {
    var timer;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
    };
  }

  function showToast(message, type) {
    var container = document.getElementById('toastContainer');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast toast--' + (type || 'info');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function () { toast.classList.add('toast--show'); }, 10);
    setTimeout(function () {
      toast.classList.remove('toast--show');
      setTimeout(function () { if (toast.parentNode) container.removeChild(toast); }, 300);
    }, 3000);
  }

  // Public API
  return {
    init: init,
    checkForNewLeads: checkForNewLeads,
    stopPolling: stopAutoAckPolling
  };
})();
