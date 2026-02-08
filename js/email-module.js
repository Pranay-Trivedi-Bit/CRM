/**
 * Email Marketing Module — Real SMTP Email Sending
 * - Real-time auto-acknowledge email from CSM when new lead is created
 * - Bulk email send to dashboard leads (from CSM accounts)
 * - Recent emails history
 * - Analytics summary
 * - SMTP status indicator (live / dry-run / not configured)
 *
 * Uses /api/email/send (single) and /api/email/send-batch (bulk) endpoints.
 * When EMAIL_ENABLED=true in .env, real emails are sent via SMTP.
 * When EMAIL_ENABLED=false, operates in dry-run mode (logs only).
 */
var EmailModule = (function () {
  'use strict';

  var initialized = false;
  var autoAckEnabled = false;
  var lastKnownLeadCount = 0;
  var autoAckPollInterval = null;
  var emailHistory = [];
  var emailStatus = { enabled: false, mode: 'unknown' };

  // CSM data (loaded from csm-data.js or window.CSM_EMAIL_MAP)
  var csmEmailMap = (typeof window !== 'undefined' && window.CSM_EMAIL_MAP) ? window.CSM_EMAIL_MAP : {};

  function init() {
    if (initialized) return;
    initialized = true;
    bindEvents();
    loadSettings();
    loadEmailHistory();
    loadCSMOptions();
    loadTemplateOptions('emAckTemplateSelect');
    loadTemplateOptions('emBulkTemplateSelect');
    loadAnalytics();
    checkEmailStatus();
  }

  function onTabActivated() {
    init();
    loadAnalytics();
    loadEmailHistory();
    loadTemplateOptions('emAckTemplateSelect');
    loadTemplateOptions('emBulkTemplateSelect');
    checkEmailStatus();
  }

  // ============ SMTP Status Check ============
  async function checkEmailStatus() {
    try {
      var res = await fetch('/api/email/status');
      var data = await res.json();
      emailStatus = data;
      renderEmailStatusBadge(data);
    } catch (err) {
      emailStatus = { enabled: false, mode: 'offline' };
      renderEmailStatusBadge({ enabled: false, mode: 'offline', configured: false });
    }
  }

  function renderEmailStatusBadge(status) {
    var badge = document.getElementById('emSmtpStatus');
    if (!badge) {
      // Create status badge in the auto-ack card header
      var cardHeader = document.querySelector('#emailMarketingView .emc-card--primary .emc-card__header');
      if (cardHeader) {
        badge = document.createElement('div');
        badge.id = 'emSmtpStatus';
        badge.className = 'emc-smtp-status';
        var toggle = cardHeader.querySelector('.emc-toggle');
        if (toggle) {
          cardHeader.insertBefore(badge, toggle);
        } else {
          cardHeader.appendChild(badge);
        }
      }
    }
    if (!badge) return;

    if (status.enabled && status.configured) {
      badge.innerHTML = '<span class="emc-smtp-dot emc-smtp-dot--live"></span> LIVE — SMTP Connected';
      badge.className = 'emc-smtp-status emc-smtp-status--live';
    } else if (status.configured && !status.enabled) {
      badge.innerHTML = '<span class="emc-smtp-dot emc-smtp-dot--dryrun"></span> DRY-RUN — Emails Logged Only';
      badge.className = 'emc-smtp-status emc-smtp-status--dryrun';
    } else {
      badge.innerHTML = '<span class="emc-smtp-dot emc-smtp-dot--offline"></span> NOT CONFIGURED';
      badge.className = 'emc-smtp-status emc-smtp-status--offline';
    }
  }

  // ============ Collapsible Card Panels (same as WAM) ============
  function setupCollapsibleCard(headerId, bodyId, arrowId) {
    var header = document.getElementById(headerId);
    var body = document.getElementById(bodyId);
    var arrow = document.getElementById(arrowId);
    if (!header || !body) return;

    header.addEventListener('click', function (e) {
      // Don't toggle when clicking on the toggle switch or its label
      if (e.target.closest('.emc-toggle') || e.target.closest('input[type="checkbox"]')) return;
      var isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : '';
      if (arrow) {
        arrow.classList.toggle('emc-expand-arrow--open', !isOpen);
      }
    });
  }

  function bindEvents() {
    // Collapsible card panels (like WhatsApp Marketing)
    setupCollapsibleCard('emAutoAckHeader', 'emAutoAckBody', 'emAutoAckArrow');
    setupCollapsibleCard('emBulkSendHeader', 'emBulkSendBody', 'emBulkSendArrow');
    setupCollapsibleCard('emRecentHeader', 'emRecentBody', 'emRecentArrow');
    setupCollapsibleCard('emAnalyticsHeader', 'emAnalyticsBody', 'emAnalyticsArrow');

    // Auto-acknowledge toggle (hidden checkbox + label switch, same as WAM)
    var toggle = document.getElementById('emAutoAckToggle');
    var toggleSwitch = document.getElementById('emAutoAckSwitch');
    if (toggle && toggleSwitch) {
      toggleSwitch.addEventListener('click', function (e) {
        e.stopPropagation(); // Don't trigger card collapse
        toggle.checked = !toggle.checked;
        autoAckEnabled = toggle.checked;
        // Update toggle visual
        if (toggle.checked) {
          toggleSwitch.classList.add('emc-toggle--on');
        } else {
          toggleSwitch.classList.remove('emc-toggle--on');
        }
        // Show/hide live indicator
        var liveIndicator = document.getElementById('emLiveIndicator');
        if (liveIndicator) liveIndicator.style.display = toggle.checked ? '' : 'none';
        saveSettings();
        if (toggle.checked) {
          startAutoAckPolling();
        } else {
          stopAutoAckPolling();
        }
      });
    }

    // Template variable chips - click to insert
    var chips = document.querySelectorAll('.emc-var-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].addEventListener('click', function () {
        var parent = this.closest('.emc-form-group');
        if (!parent) return;
        var textarea = parent.querySelector('textarea');
        var input = parent.querySelector('input[type="text"]');
        var target = textarea || input;
        if (target) {
          var start = target.selectionStart;
          var end = target.selectionEnd;
          var text = target.value;
          target.value = text.substring(0, start) + this.textContent + text.substring(end);
          target.focus();
          target.setSelectionRange(start + this.textContent.length, start + this.textContent.length);
        }
      });
    }

    // Load leads button
    var loadBtn = document.getElementById('emLoadLeads');
    if (loadBtn) loadBtn.addEventListener('click', loadDashboardLeads);

    // Select all checkbox
    var selectAll = document.getElementById('emSelectAll');
    if (selectAll) {
      selectAll.addEventListener('change', function () {
        var checkboxes = document.querySelectorAll('.emc-lead-check');
        for (var j = 0; j < checkboxes.length; j++) {
          checkboxes[j].checked = this.checked;
        }
        updateSelectedCount();
      });
    }

    // Send bulk button
    var sendBtn = document.getElementById('emSendBulk');
    if (sendBtn) sendBtn.addEventListener('click', sendBulkEmails);

    // Save settings on template/subject change
    var ackTemplate = document.getElementById('emAckTemplate');
    if (ackTemplate) ackTemplate.addEventListener('input', debounce(saveSettings, 500));
    var ackSubject = document.getElementById('emAckSubject');
    if (ackSubject) ackSubject.addEventListener('input', debounce(saveSettings, 500));

    // Filter changes
    ['emFilterStatus', 'emFilterTemp', 'emFilterCSM'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', loadDashboardLeads);
    });

    // Bulk template select -> fill subject
    var bulkTmplSelect = document.getElementById('emBulkTemplateSelect');
    if (bulkTmplSelect) {
      bulkTmplSelect.addEventListener('change', function () {
        loadTemplateIntoComposer(this.value);
      });
    }
  }

  // ============ Settings Persistence ============
  function loadSettings() {
    try {
      var settings = JSON.parse(localStorage.getItem('emSettings') || '{}');
      autoAckEnabled = settings.autoAckEnabled || false;
      var toggle = document.getElementById('emAutoAckToggle');
      if (toggle) toggle.checked = autoAckEnabled;

      // Update toggle switch visual (WAM-style label toggle)
      var toggleSwitch = document.getElementById('emAutoAckSwitch');
      if (toggleSwitch) {
        if (autoAckEnabled) {
          toggleSwitch.classList.add('emc-toggle--on');
        } else {
          toggleSwitch.classList.remove('emc-toggle--on');
        }
      }

      // Show/hide live indicator
      var liveIndicator = document.getElementById('emLiveIndicator');
      if (liveIndicator) liveIndicator.style.display = autoAckEnabled ? '' : 'none';

      if (settings.ackTemplate) {
        var tmpl = document.getElementById('emAckTemplate');
        if (tmpl) tmpl.value = settings.ackTemplate;
      }
      if (settings.ackSubject) {
        var subj = document.getElementById('emAckSubject');
        if (subj) subj.value = settings.ackSubject;
      }

      if (autoAckEnabled) startAutoAckPolling();

      if (settings.ackStats) {
        updateAckStats(settings.ackStats);
      }
    } catch (e) { /* ignore */ }
  }

  function saveSettings() {
    try {
      var ackTemplate = document.getElementById('emAckTemplate');
      var ackSubject = document.getElementById('emAckSubject');
      localStorage.setItem('emSettings', JSON.stringify({
        autoAckEnabled: autoAckEnabled,
        ackTemplate: ackTemplate ? ackTemplate.value : '',
        ackSubject: ackSubject ? ackSubject.value : '',
        ackStats: {
          sentToday: parseInt(document.getElementById('emAckSentToday').textContent) || 0,
          sentTotal: parseInt(document.getElementById('emAckSentTotal').textContent) || 0,
          opened: parseInt(document.getElementById('emAckOpened').textContent) || 0,
          failed: parseInt(document.getElementById('emAckFailed').textContent) || 0
        }
      }));
    } catch (e) { /* ignore */ }
  }

  function updateAckStats(stats) {
    if (!stats) return;
    var el;
    el = document.getElementById('emAckSentToday');
    if (el) el.textContent = stats.sentToday || 0;
    el = document.getElementById('emAckSentTotal');
    if (el) el.textContent = stats.sentTotal || 0;
    el = document.getElementById('emAckOpened');
    if (el) el.textContent = stats.opened || 0;
    el = document.getElementById('emAckFailed');
    if (el) el.textContent = stats.failed || 0;
  }

  // ============ Auto-Acknowledge Polling ============
  function startAutoAckPolling() {
    if (autoAckPollInterval) return;
    lastKnownLeadCount = getLeadsData().length;
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
    if (leads.length > lastKnownLeadCount) {
      var newLeads = leads.slice(lastKnownLeadCount);
      lastKnownLeadCount = leads.length;
      newLeads.forEach(function (lead) {
        if (lead.email) {
          sendAutoAckEmail(lead);
        }
      });
    } else {
      lastKnownLeadCount = leads.length;
    }
  }

  /**
   * Send auto-acknowledge email — Direct /api/email/send call.
   * Sends via real SMTP when EMAIL_ENABLED=true, dry-run otherwise.
   */
  async function sendAutoAckEmail(lead) {
    var subject = (document.getElementById('emAckSubject') || {}).value || 'Thank you for your interest!';
    var htmlBody = (document.getElementById('emAckTemplate') || {}).value || '<p>Thank you for your interest!</p>';
    var templateId = (document.getElementById('emAckTemplateSelect') || {}).value || null;

    var csmName = lead.assignedTo || lead.csm || 'Unassigned';

    try {
      var res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: lead.email,
          name: lead.name || '',
          company: lead.company || '',
          assignedTo: csmName,
          subject: subject,
          html: htmlBody,
          templateId: templateId || undefined
        })
      });

      var data = await res.json();

      if (data.success) {
        var sentToday = parseInt(document.getElementById('emAckSentToday').textContent) || 0;
        var sentTotal = parseInt(document.getElementById('emAckSentTotal').textContent) || 0;
        document.getElementById('emAckSentToday').textContent = sentToday + 1;
        document.getElementById('emAckSentTotal').textContent = sentTotal + 1;

        addToEmailHistory({
          type: 'ack',
          email: lead.email,
          name: lead.name || '',
          subject: subject,
          from: data.csmEmail || data.from,
          csmName: data.csmName || csmName,
          timestamp: new Date().toISOString(),
          success: true,
          mode: data.mode
        });

        saveSettings();

        var modeLabel = data.mode === 'live' ? '' : ' [DRY-RUN]';
        showToast('Auto-ack sent to ' + lead.email + ' from ' + (data.csmName || csmName) + modeLabel, 'success');
      } else {
        throw new Error(data.error || 'Send failed');
      }
    } catch (err) {
      console.error('Auto-ack email failed:', err);
      var failEl = document.getElementById('emAckFailed');
      if (failEl) failEl.textContent = (parseInt(failEl.textContent) || 0) + 1;

      addToEmailHistory({
        type: 'ack',
        email: lead.email,
        name: lead.name || '',
        subject: 'Failed: ' + (err.message || 'Unknown error'),
        from: '',
        csmName: csmName,
        timestamp: new Date().toISOString(),
        success: false,
        error: err.message
      });
      saveSettings();
      showToast('Auto-ack failed: ' + err.message, 'error');
    }
  }

  // ============ CSM Resolution ============
  function resolveCsmEmail(csmName) {
    if (!csmName) return null;
    var key = csmName.toLowerCase();
    if (csmEmailMap[key]) return csmEmailMap[key];
    if (typeof window !== 'undefined' && window.CSM_EMAIL_MAP) {
      if (window.CSM_EMAIL_MAP[key]) return window.CSM_EMAIL_MAP[key];
    }
    return null;
  }

  function loadCSMOptions() {
    var select = document.getElementById('emFilterCSM');
    if (!select) return;

    var map = csmEmailMap;
    if (typeof window !== 'undefined' && window.CSM_EMAIL_MAP) map = window.CSM_EMAIL_MAP;

    var csmNames = {};
    var leads = getLeadsData();
    leads.forEach(function (l) {
      var csm = l.assignedTo || l.csm;
      if (csm) csmNames[csm] = true;
    });

    Object.keys(map).forEach(function (k) {
      var name = k.split(' ').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
      csmNames[name] = true;
    });

    var names = Object.keys(csmNames).sort();
    select.innerHTML = '<option value="all">All CSMs</option>';
    names.forEach(function (n) {
      var opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      select.appendChild(opt);
    });
  }

  // ============ Load Dashboard Leads — Disposition-based (same as WhatsApp Marketing) ============
  function loadDashboardLeads() {
    var dispositionFilter = (document.getElementById('emFilterStatus') || {}).value || 'all';
    var tempFilter = (document.getElementById('emFilterTemp') || {}).value || 'all';
    var csmFilter = (document.getElementById('emFilterCSM') || {}).value || 'all';

    var leads = getLeadsData();

    // Filter: only leads with email addresses, using Disposition.classify() like the dashboard
    var filtered = leads.filter(function (l) {
      if (!l.email) return false;

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
    var tbody = document.getElementById('emLeadsBody');
    if (!tbody) return;

    if (leads.length === 0) {
      tbody.innerHTML = '<tr><td colspan="14" class="emc-empty">No leads with email addresses match your filters.</td></tr>';
      updateSelectedCount();
      return;
    }

    tbody.innerHTML = '';
    leads.forEach(function (lead, idx) {
      var csmName = lead.assignedTo || lead.csm || 'Unassigned';
      var csmEmail = resolveCsmEmail(csmName) || 'noreply@koenig-solutions.com';

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

      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><input type="checkbox" class="emc-lead-check" data-idx="' + idx + '" data-email="' + escapeHtml(lead.email) + '" data-name="' + escapeHtml(lead.name || '') + '" data-company="' + escapeHtml(lead.company || '') + '" data-csm="' + escapeHtml(csmName) + '" data-csm-email="' + escapeHtml(csmEmail) + '" checked></td>' +
        '<td><strong>' + escapeHtml(lead.name || 'Unknown') + '</strong></td>' +
        '<td>' +
          '<div class="emc-contact-cell">' +
            (lead.email ? '<span class="emc-contact-email">' + escapeHtml(lead.email) + '</span>' : '') +
            (lead.phone ? '<span class="emc-contact-phone">' + escapeHtml(lead.phone) + '</span>' : '') +
          '</div>' +
        '</td>' +
        '<td>' + escapeHtml(lead.company || '-') + '</td>' +
        '<td>' + escapeHtml(lead.jobTitle || '-') + '</td>' +
        '<td>' + escapeHtml(lead.seniority || '-') + '</td>' +
        '<td>' + escapeHtml(lead.campaign || '-') + '</td>' +
        '<td>' + escapeHtml(lead.location || '-') + '</td>' +
        '<td>' + escapeHtml(csmName) + '</td>' +
        '<td class="emc-csm-email-cell">' + escapeHtml(csmEmail) + '</td>' +
        '<td class="emc-remark-cell">' + escapeHtml(truncate(remark || '-', 40)) + '</td>' +
        '<td><span class="badge badge--disposition badge--disp-' + dispClass + '">' + escapeHtml(classification.disposition) + '</span></td>' +
        '<td><span class="badge badge--sub-disposition">' + escapeHtml(classification.subDisposition) + '</span></td>' +
        '<td><span class="badge badge--temp badge--temp-' + tempClass + '">' + escapeHtml(classification.leadTemp) + '</span></td>';

      tr.querySelector('.emc-lead-check').addEventListener('change', updateSelectedCount);
      tbody.appendChild(tr);
    });

    // Store the filtered leads for reference
    tbody.dataset.leads = JSON.stringify(leads);
    updateSelectedCount();
  }

  function updateSelectedCount() {
    var checked = document.querySelectorAll('.emc-lead-check:checked');
    var countEl = document.getElementById('emSelectedCount');
    if (countEl) countEl.textContent = checked.length + ' leads selected';

    var sendBtn = document.getElementById('emSendBulk');
    if (sendBtn) sendBtn.disabled = (checked.length === 0);
  }

  // ============ Bulk Send — Direct /api/email/send-batch ============
  async function sendBulkEmails() {
    var checked = document.querySelectorAll('.emc-lead-check:checked');
    if (checked.length === 0) return;

    var subject = (document.getElementById('emBulkSubject') || {}).value || 'No Subject';
    var body = (document.getElementById('emBulkMessage') || {}).value || '';
    var tmplId = (document.getElementById('emBulkTemplateSelect') || {}).value;

    var btn = document.getElementById('emSendBulk');
    var statusEl = document.getElementById('emSendStatus');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    if (statusEl) statusEl.textContent = 'Sending to ' + checked.length + ' leads via SMTP...';

    var contacts = [];
    for (var i = 0; i < checked.length; i++) {
      var cb = checked[i];
      contacts.push({
        email: cb.dataset.email,
        name: cb.dataset.name || '',
        company: cb.dataset.company || '',
        assignedTo: cb.dataset.csm || ''
      });
    }

    try {
      var res = await fetch('/api/email/send-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: contacts,
          subject: subject,
          html: body || undefined,
          templateId: tmplId || undefined
        })
      });

      var data = await res.json();

      if (data.total > 0) {
        var modeLabel = data.mode === 'live' ? '' : ' [DRY-RUN]';
        btn.textContent = 'Sent!' + modeLabel;
        if (statusEl) statusEl.textContent = data.sent + ' sent, ' + data.failed + ' failed' + modeLabel;

        if (data.csmSendLog && data.csmSendLog.length > 0) {
          showCsmSendLog(data.csmSendLog, data.mode);
        }

        contacts.forEach(function (c) {
          var matchResult = (data.results || []).find(function (r) { return r.email === c.email; });
          addToEmailHistory({
            type: 'bulk',
            email: c.email,
            name: c.name,
            subject: subject,
            from: matchResult ? (matchResult.csmEmail || matchResult.from) : (resolveCsmEmail(c.assignedTo) || 'noreply@koenig-solutions.com'),
            csmName: matchResult ? matchResult.csmName : (c.assignedTo || 'Unassigned'),
            timestamp: new Date().toISOString(),
            success: matchResult ? matchResult.success : true,
            mode: data.mode,
            error: matchResult ? matchResult.error : null
          });
        });

        showToast('Sent ' + data.sent + ' emails' + modeLabel, 'success');
        loadAnalytics();

        setTimeout(function () {
          btn.disabled = false;
          btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg> Send Emails from CSM Accounts';
          if (statusEl) statusEl.textContent = '';
        }, 4000);
      } else if (data.error) {
        btn.disabled = false;
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg> Send Emails from CSM Accounts';
        if (statusEl) statusEl.textContent = '';
        showToast(data.error, 'error');
      }
    } catch (err) {
      console.error('Bulk send failed:', err);
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg> Send Emails from CSM Accounts';
      if (statusEl) statusEl.textContent = '';
      showToast('Failed to send: ' + err.message, 'error');
    }
  }

  function showCsmSendLog(csmSendLog, mode) {
    var panel = document.getElementById('emCsmSendLogPanel');
    var body = document.getElementById('emSendLogBody');
    if (!panel || !body) return;

    panel.style.display = '';

    var modeLabel = mode === 'live'
      ? '<span style="color:#34d399;font-weight:700;">LIVE</span>'
      : '<span style="color:#fbbf24;font-weight:700;">DRY-RUN</span>';

    var html = '<div style="margin-bottom:10px;font-size:0.85rem;color:#7c85a0;">Mode: ' + modeLabel + '</div>';
    html += '<table><thead><tr>' +
      '<th>CSM Name</th><th>Sent From</th><th>Sent</th><th>Failed</th><th>Leads</th>' +
      '</tr></thead><tbody>';

    csmSendLog.forEach(function (csm) {
      var leadNames = csm.leads.map(function (l) {
        var icon = l.success ? '&#10003; ' : '&#10007; ';
        var errorHint = l.error ? ' <span style="color:#f43f5e;font-size:0.7rem;">(' + escapeHtml(l.error) + ')</span>' : '';
        return icon + escapeHtml(l.name || l.email) + errorHint;
      }).join('<br>');

      html += '<tr>' +
        '<td><strong>' + escapeHtml(csm.csmName) + '</strong></td>' +
        '<td style="font-size:0.8rem;color:#06b6d4;">' + escapeHtml(csm.csmEmail) + '</td>' +
        '<td style="color:#34d399;font-weight:700;">' + csm.sent + '</td>' +
        '<td style="color:#f43f5e;font-weight:700;">' + (csm.failed || csm.bounced || 0) + '</td>' +
        '<td style="font-size:0.75rem;line-height:1.6;">' + leadNames + '</td>' +
        '</tr>';
    });

    html += '</tbody></table>';
    body.innerHTML = html;
  }

  // ============ Template Loading ============
  async function loadTemplateOptions(selectId) {
    var select = document.getElementById(selectId);
    if (!select) return;

    try {
      var res = await fetch('/api/email-templates');
      var data = await res.json();
      var templates = data.templates || [];

      var currentVal = select.value;
      select.innerHTML = '<option value="">Select a template...</option>';
      templates.forEach(function (t) {
        var opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name + (t.isPrebuilt ? ' (Built-in)' : '');
        select.appendChild(opt);
      });
      if (currentVal) select.value = currentVal;
    } catch (err) { /* ignore */ }
  }

  async function loadTemplateIntoComposer(templateId) {
    if (!templateId) return;
    try {
      var res = await fetch('/api/email-templates/' + templateId);
      var data = await res.json();
      if (data.template) {
        var subjectField = document.getElementById('emBulkSubject');
        if (subjectField && !subjectField.value && data.template.subject) {
          subjectField.value = data.template.subject;
        }
        var bodyField = document.getElementById('emBulkMessage');
        if (bodyField && !bodyField.value) {
          bodyField.placeholder = 'Template "' + data.template.name + '" will be used. Or write custom body here to override.';
        }
      }
    } catch (err) { /* ignore */ }
  }

  // ============ Email History ============
  function loadEmailHistory() {
    try {
      emailHistory = JSON.parse(localStorage.getItem('emEmailHistory') || '[]');
    } catch (e) {
      emailHistory = [];
    }
    renderEmailHistory();
  }

  function addToEmailHistory(entry) {
    emailHistory.unshift(entry);
    if (emailHistory.length > 100) emailHistory = emailHistory.slice(0, 100);
    try {
      localStorage.setItem('emEmailHistory', JSON.stringify(emailHistory));
    } catch (e) { /* ignore */ }
    renderEmailHistory();
  }

  function renderEmailHistory() {
    var list = document.getElementById('emRecentList');
    if (!list) return;

    if (emailHistory.length === 0) {
      list.innerHTML = '<div class="emc-empty">No emails sent yet.</div>';
      return;
    }

    list.innerHTML = '';
    emailHistory.slice(0, 50).forEach(function (entry) {
      var item = document.createElement('div');
      item.className = 'emc-history-item';

      var statusIcon = entry.success
        ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#06b6d4" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
        : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f43f5e" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';

      var typeBadge = '<span class="emc-type-badge emc-type-badge--' + entry.type + '">' + entry.type + '</span>';
      var csmBadge = entry.csmName ? '<span class="emc-type-badge emc-type-badge--csm">From: ' + escapeHtml(entry.csmName) + '</span>' : '';
      var modeBadge = entry.mode === 'dry-run' ? '<span class="emc-type-badge emc-type-badge--dryrun">DRY-RUN</span>' : '';
      var errorBadge = entry.error ? '<span class="emc-type-badge emc-type-badge--error">' + escapeHtml(entry.error) + '</span>' : '';

      item.innerHTML =
        '<div class="emc-history-item__status">' + statusIcon + '</div>' +
        '<div class="emc-history-item__body">' +
          '<div class="emc-history-item__top">' +
            '<strong>' + escapeHtml(entry.name || entry.email) + '</strong>' +
            typeBadge + csmBadge + modeBadge + errorBadge +
          '</div>' +
          '<div class="emc-history-item__email">' + escapeHtml(entry.email) + '</div>' +
          '<div class="emc-history-item__subject">' + escapeHtml(entry.subject || '') + '</div>' +
          (entry.from ? '<div class="emc-history-item__from">Sent from: ' + escapeHtml(entry.from) + '</div>' : '') +
          '<div class="emc-history-item__time">' + formatTimeAgo(entry.timestamp) + '</div>' +
        '</div>';

      list.appendChild(item);
    });
  }

  // ============ Analytics ============
  async function loadAnalytics() {
    try {
      var campRes = await fetch('/api/campaigns');
      var campData = await campRes.json();
      var campaigns = campData.campaigns || [];

      var statsRes = await fetch('/api/email-tracking');
      var statsData = await statsRes.json();
      var allStats = statsData.stats || {};

      var totals = { sent: 0, opened: 0, clicked: 0, bounced: 0 };
      campaigns.forEach(function (c) {
        var stats = allStats[c.id] || c.stats || {};
        totals.sent += stats.sent || 0;
        totals.opened += stats.opened || 0;
        totals.clicked += stats.clicked || 0;
        totals.bounced += stats.bounced || 0;
      });

      var el;
      el = document.getElementById('emStatSent');
      if (el) el.textContent = totals.sent;
      el = document.getElementById('emStatOpened');
      if (el) el.textContent = totals.opened;
      el = document.getElementById('emStatClicked');
      if (el) el.textContent = totals.clicked;
      el = document.getElementById('emStatBounced');
      if (el) el.textContent = totals.bounced;

      var tbody = document.getElementById('emAnalyticsTableBody');
      if (tbody) {
        if (campaigns.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" class="emc-empty">No campaign data yet.</td></tr>';
        } else {
          tbody.innerHTML = '';
          campaigns.forEach(function (c) {
            var stats = allStats[c.id] || c.stats || {};
            var sent = stats.sent || 0;
            var opened = stats.opened || 0;
            var clicked = stats.clicked || 0;
            var bounced = stats.bounced || 0;
            var openRate = sent > 0 ? ((opened / sent) * 100).toFixed(1) + '%' : '-';
            var clickRate = sent > 0 ? ((clicked / sent) * 100).toFixed(1) + '%' : '-';

            var tr = document.createElement('tr');
            tr.innerHTML =
              '<td>' + escapeHtml(c.name) + '</td>' +
              '<td><span class="emc-status-badge emc-status-badge--' + (c.status || '').toLowerCase() + '">' + (c.status || '') + '</span></td>' +
              '<td>' + sent + '</td>' +
              '<td>' + opened + '</td>' +
              '<td>' + clicked + '</td>' +
              '<td>' + bounced + '</td>' +
              '<td>' + openRate + '</td>' +
              '<td>' + clickRate + '</td>';
            tbody.appendChild(tr);
          });
        }
      }

      renderAnalyticsChart(campaigns, allStats);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    }
  }

  function renderAnalyticsChart(campaigns, allStats) {
    var canvas = document.getElementById('emAnalyticsChart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 280 * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '280px';
    ctx.scale(dpr, dpr);

    var w = rect.width;
    var h = 280;
    ctx.clearRect(0, 0, w, h);

    var sentCampaigns = campaigns.filter(function (c) { return c.status === 'sent'; });
    if (sentCampaigns.length === 0) {
      ctx.fillStyle = '#7c85a0';
      ctx.font = '14px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No sent campaigns to chart', w / 2, h / 2);
      return;
    }

    var padding = { top: 30, right: 30, bottom: 60, left: 50 };
    var chartW = w - padding.left - padding.right;
    var chartH = h - padding.top - padding.bottom;
    var barGroupWidth = chartW / sentCampaigns.length;
    var barWidth = Math.min(barGroupWidth * 0.2, 24);
    var barGap = 3;

    var maxVal = 1;
    sentCampaigns.forEach(function (c) {
      var stats = allStats[c.id] || c.stats || {};
      maxVal = Math.max(maxVal, stats.sent || 0, stats.opened || 0, stats.clicked || 0, stats.bounced || 0);
    });

    var colors = ['#06b6d4', '#34d399', '#3b82f6', '#f43f5e'];
    var labels = ['Sent', 'Opened', 'Clicked', 'Bounced'];

    sentCampaigns.forEach(function (c, i) {
      var stats = allStats[c.id] || c.stats || {};
      var values = [stats.sent || 0, stats.opened || 0, stats.clicked || 0, stats.bounced || 0];
      var groupX = padding.left + i * barGroupWidth + barGroupWidth / 2;
      var totalBarWidth = 4 * barWidth + 3 * barGap;
      var startX = groupX - totalBarWidth / 2;

      values.forEach(function (val, j) {
        var barH = (val / maxVal) * chartH;
        var x = startX + j * (barWidth + barGap);
        var y = padding.top + chartH - barH;
        ctx.fillStyle = colors[j];
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barH, 3);
        } else {
          ctx.rect(x, y, barWidth, barH);
        }
        ctx.fill();
      });

      ctx.fillStyle = '#67e8f9';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      var campLabel = c.name.length > 12 ? c.name.substring(0, 12) + '...' : c.name;
      ctx.fillText(campLabel, groupX, h - padding.bottom + 20);
    });

    var legendX = padding.left;
    var legendY = h - 10;
    labels.forEach(function (label, i) {
      ctx.fillStyle = colors[i];
      ctx.fillRect(legendX, legendY - 8, 10, 10);
      ctx.fillStyle = '#7c85a0';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, legendX + 14, legendY);
      legendX += ctx.measureText(label).width + 30;
    });

    ctx.fillStyle = '#7c85a0';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    for (var i = 0; i <= 4; i++) {
      var yVal = Math.round((maxVal / 4) * i);
      var yPos = padding.top + chartH - (chartH / 4) * i;
      ctx.fillText(yVal.toString(), padding.left - 10, yPos + 4);
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.08)';
      ctx.beginPath();
      ctx.moveTo(padding.left, yPos);
      ctx.lineTo(w - padding.right, yPos);
      ctx.stroke();
    }
  }

  // ============ Helpers ============
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

  function formatTimeAgo(iso) {
    if (!iso) return '';
    try {
      var now = new Date();
      var then = new Date(iso);
      var diff = Math.floor((now - then) / 1000);
      if (diff < 60) return 'Just now';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (e) { return ''; }
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
      setTimeout(function () { container.removeChild(toast); }, 300);
    }, 3000);
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

  return {
    init: init,
    onTabActivated: onTabActivated,
    stopPolling: stopAutoAckPolling
  };
})();
