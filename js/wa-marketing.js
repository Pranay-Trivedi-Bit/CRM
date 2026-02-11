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

    // Media Upload card header click — toggle open/close
    var mediaHeader = document.getElementById('wamMediaHeader');
    if (mediaHeader) {
      mediaHeader.addEventListener('click', function () {
        var body = document.getElementById('wamMediaBody');
        var arrow = document.getElementById('wamMediaArrow');
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

    // Media type tab buttons
    var mediaTypeBtns = document.querySelectorAll('.wam-media-type-btn');
    for (var m = 0; m < mediaTypeBtns.length; m++) {
      mediaTypeBtns[m].addEventListener('click', function () {
        for (var n = 0; n < mediaTypeBtns.length; n++) {
          mediaTypeBtns[n].classList.remove('wam-media-type-btn--active');
        }
        this.classList.add('wam-media-type-btn--active');
        var type = this.getAttribute('data-type');
        updateMediaTypeHint(type);
        clearMediaPreview();
      });
    }

    // Upload zone click & drag-drop
    var uploadZone = document.getElementById('wamUploadZone');
    var fileInput = document.getElementById('wamFileInput');
    if (uploadZone && fileInput) {
      uploadZone.addEventListener('click', function () { fileInput.click(); });
      uploadZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.add('wam-upload-zone--dragover');
      });
      uploadZone.addEventListener('dragleave', function (e) {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.remove('wam-upload-zone--dragover');
      });
      uploadZone.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.remove('wam-upload-zone--dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleMediaFile(e.dataTransfer.files[0]);
        }
      });
      fileInput.addEventListener('change', function () {
        if (this.files && this.files.length > 0) {
          handleMediaFile(this.files[0]);
        }
      });
    }

    // Media URL input — detect paste/enter
    var mediaUrlInput = document.getElementById('wamMediaUrl');
    if (mediaUrlInput) {
      mediaUrlInput.addEventListener('change', function () {
        var url = this.value.trim();
        if (url) {
          showUrlPreview(url);
        } else {
          clearMediaPreview();
        }
      });
    }

    // Preview remove button
    var removeBtn = document.getElementById('wamPreviewRemove');
    if (removeBtn) {
      removeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        clearMediaPreview();
      });
    }

    // ---- Auto-Ack Media Upload Handlers ----
    var ackMediaBtns = document.querySelectorAll('.wam-media-type-btn[data-scope="ack"]');
    for (var a = 0; a < ackMediaBtns.length; a++) {
      ackMediaBtns[a].addEventListener('click', function () {
        for (var b = 0; b < ackMediaBtns.length; b++) {
          ackMediaBtns[b].classList.remove('wam-media-type-btn--active');
        }
        this.classList.add('wam-media-type-btn--active');
        var type = this.getAttribute('data-type');
        updateAckMediaTypeHint(type);
        clearAckMediaPreview();
      });
    }

    var ackUploadZone = document.getElementById('wamAckUploadZone');
    var ackFileInput = document.getElementById('wamAckFileInput');
    if (ackUploadZone && ackFileInput) {
      ackUploadZone.addEventListener('click', function () { ackFileInput.click(); });
      ackUploadZone.addEventListener('dragover', function (e) {
        e.preventDefault(); e.stopPropagation();
        ackUploadZone.classList.add('wam-upload-zone--dragover');
      });
      ackUploadZone.addEventListener('dragleave', function (e) {
        e.preventDefault(); e.stopPropagation();
        ackUploadZone.classList.remove('wam-upload-zone--dragover');
      });
      ackUploadZone.addEventListener('drop', function (e) {
        e.preventDefault(); e.stopPropagation();
        ackUploadZone.classList.remove('wam-upload-zone--dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleAckMediaFile(e.dataTransfer.files[0]);
        }
      });
      ackFileInput.addEventListener('change', function () {
        if (this.files && this.files.length > 0) {
          handleAckMediaFile(this.files[0]);
        }
      });
    }

    var ackMediaUrlInput = document.getElementById('wamAckMediaUrl');
    if (ackMediaUrlInput) {
      ackMediaUrlInput.addEventListener('change', function () {
        var url = this.value.trim();
        if (url) { showAckUrlPreview(url); } else { clearAckMediaPreview(); }
      });
    }

    var ackRemoveBtn = document.getElementById('wamAckPreviewRemove');
    if (ackRemoveBtn) {
      ackRemoveBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        clearAckMediaPreview();
      });
    }

    // ---- Bulk Send Media Upload Handlers ----
    var bulkMediaBtns = document.querySelectorAll('.wam-media-type-btn[data-scope="bulk"]');
    for (var bm = 0; bm < bulkMediaBtns.length; bm++) {
      bulkMediaBtns[bm].addEventListener('click', function () {
        for (var bn = 0; bn < bulkMediaBtns.length; bn++) {
          bulkMediaBtns[bn].classList.remove('wam-media-type-btn--active');
        }
        this.classList.add('wam-media-type-btn--active');
        var type = this.getAttribute('data-type');
        updateBulkMediaTypeHint(type);
        clearBulkMediaPreview();
      });
    }

    var bulkUploadZone = document.getElementById('wamBulkUploadZone');
    var bulkFileInput = document.getElementById('wamBulkFileInput');
    if (bulkUploadZone && bulkFileInput) {
      bulkUploadZone.addEventListener('click', function () { bulkFileInput.click(); });
      bulkUploadZone.addEventListener('dragover', function (e) {
        e.preventDefault(); e.stopPropagation();
        bulkUploadZone.classList.add('wam-upload-zone--dragover');
      });
      bulkUploadZone.addEventListener('dragleave', function (e) {
        e.preventDefault(); e.stopPropagation();
        bulkUploadZone.classList.remove('wam-upload-zone--dragover');
      });
      bulkUploadZone.addEventListener('drop', function (e) {
        e.preventDefault(); e.stopPropagation();
        bulkUploadZone.classList.remove('wam-upload-zone--dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleBulkMediaFile(e.dataTransfer.files[0]);
        }
      });
      bulkFileInput.addEventListener('change', function () {
        if (this.files && this.files.length > 0) {
          handleBulkMediaFile(this.files[0]);
        }
      });
    }

    var bulkMediaUrlInput = document.getElementById('wamBulkMediaUrl');
    if (bulkMediaUrlInput) {
      bulkMediaUrlInput.addEventListener('change', function () {
        var url = this.value.trim();
        if (url) { showBulkUrlPreview(url); } else { clearBulkMediaPreview(); }
      });
    }

    var bulkRemoveBtn = document.getElementById('wamBulkPreviewRemove');
    if (bulkRemoveBtn) {
      bulkRemoveBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        clearBulkMediaPreview();
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
    var ackMedia = getAckMediaAttachment();

    try {
      var res;
      // Send text message first
      res = await fetch('/api/messages/send', {
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

      // If media is attached, send it as a follow-up
      if (ackMedia && data.success) {
        try {
          await fetch('/api/messages/send-media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: lead.phone,
              mediaType: ackMedia.mediaType,
              mediaUrl: ackMedia.mediaUrl,
              caption: '',
              filename: ackMedia.filename,
              leadId: lead.id,
              leadName: lead.name
            })
          });
        } catch (mediaErr) { /* media send failed, text was still sent */ }
      }

      addToHistory({
        type: 'auto-ack',
        leadName: lead.name || 'Unknown',
        phone: lead.phone,
        csmName: lead.assignedTo || '',
        message: ackMedia ? message + ' [+' + ackMedia.mediaType + ']' : message,
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
    var mediaAttachment = getBulkMediaAttachment();

    // Need at least text or media
    if (!messageTemplate && !mediaAttachment) {
      showToast('Please type a message or attach media first.', 'error');
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
      var message = messageTemplate ? interpolateTemplate(messageTemplate, lead) : '';
      statusEl.textContent = 'Sending ' + (j + 1) + ' of ' + selectedLeads.length + '...';

      try {
        var res;
        if (mediaAttachment) {
          // Send media message (with optional caption)
          var mediaCaption = mediaAttachment.caption ? interpolateTemplate(mediaAttachment.caption, lead) : '';
          var fullCaption = (mediaCaption && message) ? mediaCaption + '\n\n' + message : (mediaCaption || message);
          res = await fetch('/api/messages/send-media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: lead.phone,
              mediaType: mediaAttachment.mediaType,
              mediaUrl: mediaAttachment.mediaUrl,
              caption: fullCaption,
              filename: mediaAttachment.filename,
              leadId: lead.id,
              leadName: lead.name
            })
          });
        } else {
          // Text-only message
          res = await fetch('/api/messages/send', {
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
        }
        var data = await res.json();

        addToHistory({
          type: mediaAttachment ? 'media' : 'bulk',
          leadName: lead.name || 'Unknown',
          phone: lead.phone,
          csmName: lead.assignedTo || '',
          message: mediaAttachment ? '[' + mediaAttachment.mediaType + '] ' + (message || mediaAttachment.caption || '') : message,
          status: data.success ? 'sent' : 'failed',
          simulated: data.simulated || false,
          timestamp: new Date().toISOString()
        });

        if (data.success) sentCount++;
        else failCount++;
      } catch (err) {
        failCount++;
        addToHistory({
          type: mediaAttachment ? 'media' : 'bulk',
          leadName: lead.name || 'Unknown',
          phone: lead.phone,
          csmName: lead.assignedTo || '',
          message: message || (mediaAttachment ? '[' + mediaAttachment.mediaType + ']' : ''),
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
      .replace(/\{\{firstName\}\}/gi, (lead.name ? lead.name.split(' ')[0] : 'there'))
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

  // ============ Media Upload Helpers ============
  var currentMediaType = 'image';
  var currentMediaUrl = '';
  var currentMediaFilename = '';

  var mediaTypeConfig = {
    image:    { accept: 'image/jpeg,image/png', hint: 'JPEG, PNG \u00b7 Max 5 MB', maxSize: 5 * 1024 * 1024 },
    video:    { accept: 'video/mp4,video/3gpp', hint: 'MP4, 3GPP \u00b7 Max 16 MB', maxSize: 16 * 1024 * 1024 },
    document: { accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt', hint: 'PDF, DOC, XLS, PPT, TXT \u00b7 Max 100 MB', maxSize: 100 * 1024 * 1024 }
  };

  function getActiveMediaType() {
    var activeBtn = document.querySelector('.wam-media-type-btn--active');
    return activeBtn ? activeBtn.getAttribute('data-type') : 'image';
  }

  function updateMediaTypeHint(type) {
    currentMediaType = type;
    var hint = document.getElementById('wamMediaHint');
    var fileInput = document.getElementById('wamFileInput');
    var cfg = mediaTypeConfig[type] || mediaTypeConfig.image;
    if (hint) hint.textContent = cfg.hint;
    if (fileInput) fileInput.setAttribute('accept', cfg.accept);
  }

  function handleMediaFile(file) {
    var type = getActiveMediaType();
    var cfg = mediaTypeConfig[type] || mediaTypeConfig.image;

    if (file.size > cfg.maxSize) {
      showToast('File too large. Max ' + (cfg.maxSize / (1024 * 1024)) + ' MB for ' + type + '.', 'error');
      return;
    }

    currentMediaFilename = file.name;
    // For preview only — actual sending uses URL. Show preview from local blob.
    var blobUrl = URL.createObjectURL(file);
    currentMediaUrl = blobUrl;
    currentMediaType = type;
    renderPreview(blobUrl, file.name, type);

    // Store file reference for potential upload
    var uploadZone = document.getElementById('wamUploadZone');
    if (uploadZone) uploadZone._selectedFile = file;
  }

  function showUrlPreview(url) {
    var type = getActiveMediaType();
    currentMediaUrl = url;
    currentMediaType = type;
    currentMediaFilename = url.split('/').pop().split('?')[0] || 'media';
    renderPreview(url, currentMediaFilename, type);
  }

  function renderPreview(url, name, type) {
    var previewContainer = document.getElementById('wamMediaPreview');
    var previewInner = document.getElementById('wamPreviewInner');
    var previewName = document.getElementById('wamPreviewName');
    if (!previewContainer || !previewInner) return;

    previewInner.innerHTML = '';
    if (type === 'image') {
      var img = document.createElement('img');
      img.src = url;
      img.alt = name;
      img.onerror = function () { previewInner.innerHTML = '<div class="wam-doc-icon"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>Image preview unavailable</span></div>'; };
      previewInner.appendChild(img);
    } else if (type === 'video') {
      var vid = document.createElement('video');
      vid.src = url;
      vid.controls = true;
      vid.style.maxWidth = '100%';
      vid.style.maxHeight = '280px';
      vid.onerror = function () { previewInner.innerHTML = '<div class="wam-doc-icon"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg><span>Video preview unavailable</span></div>'; };
      previewInner.appendChild(vid);
    } else {
      previewInner.innerHTML = '<div class="wam-doc-icon"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>' + escapeHtml(name) + '</span></div>';
    }

    if (previewName) previewName.textContent = name;
    previewContainer.style.display = '';
  }

  function clearMediaPreview() {
    var previewContainer = document.getElementById('wamMediaPreview');
    var previewInner = document.getElementById('wamPreviewInner');
    var previewName = document.getElementById('wamPreviewName');
    var urlInput = document.getElementById('wamMediaUrl');
    var fileInput = document.getElementById('wamFileInput');
    var uploadZone = document.getElementById('wamUploadZone');

    if (previewContainer) previewContainer.style.display = 'none';
    if (previewInner) previewInner.innerHTML = '';
    if (previewName) previewName.textContent = '';
    if (urlInput) urlInput.value = '';
    if (fileInput) fileInput.value = '';
    if (uploadZone) uploadZone._selectedFile = null;

    currentMediaUrl = '';
    currentMediaFilename = '';
  }

  function getMediaAttachment() {
    // Returns current media state from the standalone Media Upload card
    var url = (document.getElementById('wamMediaUrl') || {}).value || '';
    var caption = (document.getElementById('wamMediaCaption') || {}).value || '';
    if (!url && !currentMediaUrl) return null;
    return {
      mediaType: getActiveMediaType(),
      mediaUrl: url || currentMediaUrl,
      caption: caption,
      filename: currentMediaFilename || 'media'
    };
  }

  function getBulkMediaAttachment() {
    // Returns current media state from the bulk send card's media section
    var url = (document.getElementById('wamBulkMediaUrl') || {}).value || '';
    var caption = (document.getElementById('wamBulkMediaCaption') || {}).value || '';
    if (!url && !bulkMediaUrl) return null;
    return {
      mediaType: getActiveBulkMediaType(),
      mediaUrl: url || bulkMediaUrl,
      caption: caption,
      filename: bulkMediaFilename || 'media'
    };
  }

  // ============ Auto-Ack Media Upload Helpers ============
  var ackMediaType = 'image';
  var ackMediaUrl = '';
  var ackMediaFilename = '';

  function getActiveAckMediaType() {
    var activeBtn = document.querySelector('.wam-media-type-btn--active[data-scope="ack"]');
    return activeBtn ? activeBtn.getAttribute('data-type') : 'image';
  }

  function updateAckMediaTypeHint(type) {
    ackMediaType = type;
    var hint = document.getElementById('wamAckMediaHint');
    var fileInput = document.getElementById('wamAckFileInput');
    var cfg = mediaTypeConfig[type] || mediaTypeConfig.image;
    if (hint) hint.textContent = cfg.hint;
    if (fileInput) fileInput.setAttribute('accept', cfg.accept);
  }

  function handleAckMediaFile(file) {
    var type = getActiveAckMediaType();
    var cfg = mediaTypeConfig[type] || mediaTypeConfig.image;
    if (file.size > cfg.maxSize) {
      showToast('File too large. Max ' + (cfg.maxSize / (1024 * 1024)) + ' MB for ' + type + '.', 'error');
      return;
    }
    ackMediaFilename = file.name;
    var blobUrl = URL.createObjectURL(file);
    ackMediaUrl = blobUrl;
    ackMediaType = type;
    renderAckPreview(blobUrl, file.name, type);
    var zone = document.getElementById('wamAckUploadZone');
    if (zone) zone._selectedFile = file;
  }

  function showAckUrlPreview(url) {
    var type = getActiveAckMediaType();
    ackMediaUrl = url;
    ackMediaType = type;
    ackMediaFilename = url.split('/').pop().split('?')[0] || 'media';
    renderAckPreview(url, ackMediaFilename, type);
  }

  function renderAckPreview(url, name, type) {
    var container = document.getElementById('wamAckMediaPreview');
    var inner = document.getElementById('wamAckPreviewInner');
    var nameEl = document.getElementById('wamAckPreviewName');
    if (!container || !inner) return;
    inner.innerHTML = '';
    if (type === 'image') {
      var img = document.createElement('img');
      img.src = url; img.alt = name;
      img.onerror = function () { inner.innerHTML = '<div class="wam-doc-icon"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>Image preview unavailable</span></div>'; };
      inner.appendChild(img);
    } else if (type === 'video') {
      var vid = document.createElement('video');
      vid.src = url; vid.controls = true; vid.style.maxWidth = '100%'; vid.style.maxHeight = '280px';
      vid.onerror = function () { inner.innerHTML = '<div class="wam-doc-icon"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg><span>Video preview unavailable</span></div>'; };
      inner.appendChild(vid);
    } else {
      inner.innerHTML = '<div class="wam-doc-icon"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>' + escapeHtml(name) + '</span></div>';
    }
    if (nameEl) nameEl.textContent = name;
    container.style.display = '';
  }

  function clearAckMediaPreview() {
    var container = document.getElementById('wamAckMediaPreview');
    var inner = document.getElementById('wamAckPreviewInner');
    var nameEl = document.getElementById('wamAckPreviewName');
    var urlInput = document.getElementById('wamAckMediaUrl');
    var fileInput = document.getElementById('wamAckFileInput');
    var zone = document.getElementById('wamAckUploadZone');
    if (container) container.style.display = 'none';
    if (inner) inner.innerHTML = '';
    if (nameEl) nameEl.textContent = '';
    if (urlInput) urlInput.value = '';
    if (fileInput) fileInput.value = '';
    if (zone) zone._selectedFile = null;
    ackMediaUrl = '';
    ackMediaFilename = '';
  }

  function getAckMediaAttachment() {
    var url = (document.getElementById('wamAckMediaUrl') || {}).value || '';
    if (!url && !ackMediaUrl) return null;
    return {
      mediaType: getActiveAckMediaType(),
      mediaUrl: url || ackMediaUrl,
      filename: ackMediaFilename || 'media'
    };
  }

  // ============ Bulk Send Media Upload Helpers ============
  var bulkMediaType = 'image';
  var bulkMediaUrl = '';
  var bulkMediaFilename = '';

  function getActiveBulkMediaType() {
    var activeBtn = document.querySelector('.wam-media-type-btn--active[data-scope="bulk"]');
    return activeBtn ? activeBtn.getAttribute('data-type') : 'image';
  }

  function updateBulkMediaTypeHint(type) {
    bulkMediaType = type;
    var hint = document.getElementById('wamBulkMediaHint');
    var fileInput = document.getElementById('wamBulkFileInput');
    var cfg = mediaTypeConfig[type] || mediaTypeConfig.image;
    if (hint) hint.textContent = cfg.hint;
    if (fileInput) fileInput.setAttribute('accept', cfg.accept);
  }

  function handleBulkMediaFile(file) {
    var type = getActiveBulkMediaType();
    var cfg = mediaTypeConfig[type] || mediaTypeConfig.image;
    if (file.size > cfg.maxSize) {
      showToast('File too large. Max ' + (cfg.maxSize / (1024 * 1024)) + ' MB for ' + type + '.', 'error');
      return;
    }
    bulkMediaFilename = file.name;
    var blobUrl = URL.createObjectURL(file);
    bulkMediaUrl = blobUrl;
    bulkMediaType = type;
    renderBulkPreview(blobUrl, file.name, type);
    var zone = document.getElementById('wamBulkUploadZone');
    if (zone) zone._selectedFile = file;
  }

  function showBulkUrlPreview(url) {
    var type = getActiveBulkMediaType();
    bulkMediaUrl = url;
    bulkMediaType = type;
    bulkMediaFilename = url.split('/').pop().split('?')[0] || 'media';
    renderBulkPreview(url, bulkMediaFilename, type);
  }

  function renderBulkPreview(url, name, type) {
    var container = document.getElementById('wamBulkMediaPreview');
    var inner = document.getElementById('wamBulkPreviewInner');
    var nameEl = document.getElementById('wamBulkPreviewName');
    if (!container || !inner) return;
    inner.innerHTML = '';
    if (type === 'image') {
      var img = document.createElement('img');
      img.src = url; img.alt = name;
      img.onerror = function () { inner.innerHTML = '<div class="wam-doc-icon"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>Image preview unavailable</span></div>'; };
      inner.appendChild(img);
    } else if (type === 'video') {
      var vid = document.createElement('video');
      vid.src = url; vid.controls = true; vid.style.maxWidth = '100%'; vid.style.maxHeight = '280px';
      vid.onerror = function () { inner.innerHTML = '<div class="wam-doc-icon"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg><span>Video preview unavailable</span></div>'; };
      inner.appendChild(vid);
    } else {
      inner.innerHTML = '<div class="wam-doc-icon"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>' + escapeHtml(name) + '</span></div>';
    }
    if (nameEl) nameEl.textContent = name;
    container.style.display = '';
  }

  function clearBulkMediaPreview() {
    var container = document.getElementById('wamBulkMediaPreview');
    var inner = document.getElementById('wamBulkPreviewInner');
    var nameEl = document.getElementById('wamBulkPreviewName');
    var urlInput = document.getElementById('wamBulkMediaUrl');
    var fileInput = document.getElementById('wamBulkFileInput');
    var zone = document.getElementById('wamBulkUploadZone');
    if (container) container.style.display = 'none';
    if (inner) inner.innerHTML = '';
    if (nameEl) nameEl.textContent = '';
    if (urlInput) urlInput.value = '';
    if (fileInput) fileInput.value = '';
    if (zone) zone._selectedFile = null;
    bulkMediaUrl = '';
    bulkMediaFilename = '';
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
    stopPolling: stopAutoAckPolling,
    getMediaAttachment: getMediaAttachment
  };
})();
