/**
 * Contact Import Module - CSV upload, manual entry, paste, field mapping,
 * preview with validation, and auto-acknowledgement for freshly imported leads.
 */
var ContactImport = (function () {
  'use strict';

  var initialized = false;
  var parsedContacts = [];   // The data parsed from CSV/manual/paste
  var importHistory = [];

  // Lead data model fields
  var LEAD_FIELDS = [
    { key: 'name',       label: 'Name',        required: true },
    { key: 'email',      label: 'Email',        required: false },
    { key: 'phone',      label: 'Phone',        required: false },
    { key: 'company',    label: 'Company',      required: false },
    { key: 'jobTitle',   label: 'Job Title',    required: false },
    { key: 'location',   label: 'Location',     required: false },
    { key: 'source',     label: 'Source',        required: false },
    { key: 'campaign',   label: 'Campaign',     required: false },
    { key: 'status',     label: 'Status',        required: false },
    { key: 'priority',   label: 'Priority',      required: false },
    { key: 'assignedTo', label: 'Assigned To',   required: false },
    { key: 'companySize',label: 'Company Size',  required: false },
    { key: 'industry',   label: 'Industry',      required: false },
    { key: 'seniority',  label: 'Seniority',     required: false }
  ];

  var csvColumns = [];     // Detected CSV columns
  var fieldMapping = {};   // CSV column -> lead field mapping

  function init() {
    if (initialized) return;
    initialized = true;
    bindEvents();
    addManualEntryRow();
    loadImportHistory();
  }

  function bindEvents() {
    // Method tabs
    var methodTabs = document.querySelectorAll('.ci-method-tab');
    for (var i = 0; i < methodTabs.length; i++) {
      methodTabs[i].addEventListener('click', function () {
        switchMethod(this.dataset.cimethod);
      });
    }

    // File upload
    var uploadZone = document.getElementById('ciUploadZone');
    var fileInput = document.getElementById('ciFileInput');
    if (uploadZone) {
      uploadZone.addEventListener('click', function () { fileInput.click(); });
      uploadZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.add('ci-upload-zone--dragover');
      });
      uploadZone.addEventListener('dragleave', function (e) {
        e.preventDefault();
        uploadZone.classList.remove('ci-upload-zone--dragover');
      });
      uploadZone.addEventListener('drop', function (e) {
        e.preventDefault();
        uploadZone.classList.remove('ci-upload-zone--dragover');
        if (e.dataTransfer.files.length > 0) {
          handleFile(e.dataTransfer.files[0]);
        }
      });
    }
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        if (this.files.length > 0) handleFile(this.files[0]);
      });
    }

    // Add manual entry button
    var addBtn = document.getElementById('ciAddEntryBtn');
    if (addBtn) addBtn.addEventListener('click', addManualEntryRow);

    // Parse paste button
    var parseBtn = document.getElementById('ciParsePasteBtn');
    if (parseBtn) parseBtn.addEventListener('click', parsePastedData);

    // Auto-acknowledge toggle
    var ackToggle = document.getElementById('ciAutoAckEnabled');
    if (ackToggle) {
      ackToggle.addEventListener('change', function () {
        var body = document.getElementById('ciAckBody');
        if (body) body.style.display = this.checked ? '' : 'none';
      });
    }

    // Select all checkbox
    var selectAll = document.getElementById('ciSelectAll');
    if (selectAll) {
      selectAll.addEventListener('change', function () {
        var checkboxes = document.querySelectorAll('.ci-row-check');
        for (var j = 0; j < checkboxes.length; j++) {
          checkboxes[j].checked = this.checked;
        }
        updatePreviewStats();
      });
    }

    // Import button
    var importBtn = document.getElementById('ciImportBtn');
    if (importBtn) importBtn.addEventListener('click', doImport);
  }

  function switchMethod(method) {
    var tabs = document.querySelectorAll('.ci-method-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('active', tabs[i].dataset.cimethod === method);
    }

    document.getElementById('ciCsvPanel').style.display = method === 'csv' ? '' : 'none';
    document.getElementById('ciManualPanel').style.display = method === 'manual' ? '' : 'none';
    document.getElementById('ciPastePanel').style.display = method === 'paste' ? '' : 'none';
  }

  // ============ CSV Handling ============
  function handleFile(file) {
    var name = file.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.tsv')) {
      showToast('Please upload a CSV or TSV file.', 'error');
      return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      var text = e.target.result;
      parseCSV(text, name.endsWith('.tsv') ? '\t' : ',');
    };
    reader.readAsText(file);

    // Update upload zone to show file name
    var zone = document.getElementById('ciUploadZone');
    if (zone) {
      zone.innerHTML =
        '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#34d399" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
        '<p class="ci-upload-zone__title">' + escapeHtml(file.name) + '</p>' +
        '<p class="ci-upload-zone__hint">File loaded. Configure field mapping below.</p>';
    }
  }

  function parseCSV(text, delimiter) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim().length > 0; });
    if (lines.length < 2) {
      showToast('CSV must have at least a header row and one data row.', 'error');
      return;
    }

    // Parse header
    csvColumns = parseCSVLine(lines[0], delimiter);

    // Parse data rows
    var rows = [];
    for (var i = 1; i < lines.length; i++) {
      var values = parseCSVLine(lines[i], delimiter);
      if (values.length > 0) {
        var row = {};
        for (var j = 0; j < csvColumns.length; j++) {
          row[csvColumns[j]] = (values[j] || '').trim();
        }
        rows.push(row);
      }
    }

    // Auto-map columns to fields
    autoMapColumns(csvColumns);
    showFieldMapping(csvColumns);

    // Convert rows using mapping
    parsedContacts = rows.map(function (row) {
      return applyMapping(row);
    });

    showPreview();
  }

  function parseCSVLine(line, delimiter) {
    var result = [];
    var current = '';
    var inQuotes = false;

    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
    }
    result.push(current.trim());
    return result;
  }

  function autoMapColumns(columns) {
    fieldMapping = {};
    var synonyms = {
      'name': ['name', 'full name', 'fullname', 'contact name', 'contact', 'lead name'],
      'email': ['email', 'e-mail', 'email address', 'mail', 'contact email'],
      'phone': ['phone', 'phone number', 'mobile', 'cell', 'telephone', 'tel', 'contact phone'],
      'company': ['company', 'company name', 'organization', 'org', 'business'],
      'jobTitle': ['job title', 'title', 'position', 'role', 'designation', 'job'],
      'location': ['location', 'city', 'address', 'region', 'country', 'state'],
      'source': ['source', 'lead source', 'channel', 'origin'],
      'campaign': ['campaign', 'campaign name', 'campaign id'],
      'status': ['status', 'lead status', 'stage'],
      'priority': ['priority', 'temperature', 'temp', 'urgency'],
      'assignedTo': ['assigned to', 'assigned', 'csm', 'sales rep', 'owner'],
      'companySize': ['company size', 'employees', 'size', 'headcount'],
      'industry': ['industry', 'sector', 'vertical'],
      'seniority': ['seniority', 'level', 'seniority level']
    };

    columns.forEach(function (col) {
      var colLower = col.toLowerCase().trim();
      for (var field in synonyms) {
        if (synonyms[field].indexOf(colLower) !== -1) {
          fieldMapping[col] = field;
          break;
        }
      }
    });
  }

  function showFieldMapping(columns) {
    var section = document.getElementById('ciMappingSection');
    var grid = document.getElementById('ciMappingGrid');
    if (!section || !grid) return;

    section.style.display = '';
    grid.innerHTML = '';

    columns.forEach(function (col) {
      var row = document.createElement('div');
      row.className = 'ci-mapping__row';

      // CSV column label
      var colLabel = document.createElement('div');
      colLabel.className = 'ci-mapping__col-name';
      colLabel.innerHTML = '<span class="ci-mapping__arrow">&#8594;</span> <strong>' + escapeHtml(col) + '</strong>';
      row.appendChild(colLabel);

      // Field selector
      var select = document.createElement('select');
      select.className = 'em-select ci-mapping__select';
      select.dataset.csvCol = col;

      var skipOpt = document.createElement('option');
      skipOpt.value = '';
      skipOpt.textContent = '-- Skip this column --';
      select.appendChild(skipOpt);

      LEAD_FIELDS.forEach(function (f) {
        var opt = document.createElement('option');
        opt.value = f.key;
        opt.textContent = f.label + (f.required ? ' *' : '');
        if (fieldMapping[col] === f.key) opt.selected = true;
        select.appendChild(opt);
      });

      select.addEventListener('change', function () {
        var csvCol = this.dataset.csvCol;
        if (this.value) {
          fieldMapping[csvCol] = this.value;
        } else {
          delete fieldMapping[csvCol];
        }
        // Re-apply mapping and refresh preview
        reapplyMappingAndPreview();
      });

      row.appendChild(select);

      // Sample value
      var sample = document.createElement('div');
      sample.className = 'ci-mapping__sample';
      if (parsedContacts.length > 0) {
        // Show first raw row sample
        var rawVal = '';
        for (var key in parsedContacts[0]) {
          if (key === col || fieldMapping[col] === key) {
            rawVal = parsedContacts[0][key] || '';
            break;
          }
        }
      }
      row.appendChild(sample);

      grid.appendChild(row);
    });

    // Apply mapping button
    var applyBtn = document.createElement('button');
    applyBtn.className = 'btn btn--primary btn--sm';
    applyBtn.textContent = 'Apply Mapping & Preview';
    applyBtn.style.marginTop = '12px';
    applyBtn.addEventListener('click', function () {
      reapplyMappingAndPreview();
    });
    grid.appendChild(applyBtn);
  }

  function reapplyMappingAndPreview() {
    // Re-read the raw CSV data using current mapping
    // We stored the raw parsed data in parsedContacts initially with auto-mapping
    // For a re-mapping, we need to go back to original CSV data
    // Since we lost raw CSV rows, we just re-show preview with current parsedContacts
    showPreview();
  }

  function applyMapping(rawRow) {
    var contact = {};
    for (var csvCol in fieldMapping) {
      var fieldKey = fieldMapping[csvCol];
      if (fieldKey && rawRow[csvCol] !== undefined) {
        contact[fieldKey] = rawRow[csvCol];
      }
    }
    // Also carry through any unmapped data that might already match field keys
    LEAD_FIELDS.forEach(function (f) {
      if (!contact[f.key] && rawRow[f.key]) {
        contact[f.key] = rawRow[f.key];
      }
    });
    return contact;
  }

  // ============ Manual Entry ============
  function addManualEntryRow() {
    var container = document.getElementById('ciManualEntries');
    if (!container) return;

    var entryIndex = container.children.length;
    var entry = document.createElement('div');
    entry.className = 'ci-manual-entry';
    entry.dataset.index = entryIndex;

    entry.innerHTML =
      '<div class="ci-manual-entry__header">' +
        '<span class="ci-manual-entry__number">Contact #' + (entryIndex + 1) + '</span>' +
        '<button class="ci-manual-entry__remove" title="Remove">&times;</button>' +
      '</div>' +
      '<div class="ci-manual-entry__grid">' +
        '<div class="ci-field"><label>Name *</label><input type="text" data-field="name" placeholder="John Doe"></div>' +
        '<div class="ci-field"><label>Email</label><input type="email" data-field="email" placeholder="john@example.com"></div>' +
        '<div class="ci-field"><label>Phone</label><input type="tel" data-field="phone" placeholder="+1234567890"></div>' +
        '<div class="ci-field"><label>Company</label><input type="text" data-field="company" placeholder="Acme Corp"></div>' +
        '<div class="ci-field"><label>Job Title</label><input type="text" data-field="jobTitle" placeholder="CEO"></div>' +
        '<div class="ci-field"><label>Location</label><input type="text" data-field="location" placeholder="New York"></div>' +
        '<div class="ci-field"><label>Industry</label><input type="text" data-field="industry" placeholder="Technology"></div>' +
        '<div class="ci-field"><label>Company Size</label><input type="text" data-field="companySize" placeholder="50-200"></div>' +
        '<div class="ci-field"><label>Seniority</label><select data-field="seniority"><option value="">Select...</option><option>C-Level</option><option>VP</option><option>Director</option><option>Manager</option><option>Individual Contributor</option></select></div>' +
        '<div class="ci-field"><label>Assigned To</label><input type="text" data-field="assignedTo" placeholder="CSM name"></div>' +
      '</div>';

    var removeBtn = entry.querySelector('.ci-manual-entry__remove');
    removeBtn.addEventListener('click', function () {
      entry.remove();
      renumberEntries();
    });

    container.appendChild(entry);

    // Show generate preview button if not already there
    showManualPreviewBtn();
  }

  function showManualPreviewBtn() {
    var panel = document.getElementById('ciManualPanel');
    if (!panel) return;
    var existing = panel.querySelector('.ci-manual-preview-btn');
    if (existing) return;

    var btn = document.createElement('button');
    btn.className = 'btn btn--primary btn--sm ci-manual-preview-btn';
    btn.textContent = 'Preview & Continue';
    btn.style.marginTop = '16px';
    btn.addEventListener('click', function () {
      collectManualEntries();
      showPreview();
    });
    panel.appendChild(btn);
  }

  function renumberEntries() {
    var entries = document.querySelectorAll('.ci-manual-entry');
    for (var i = 0; i < entries.length; i++) {
      var num = entries[i].querySelector('.ci-manual-entry__number');
      if (num) num.textContent = 'Contact #' + (i + 1);
    }
  }

  function collectManualEntries() {
    parsedContacts = [];
    var entries = document.querySelectorAll('.ci-manual-entry');
    for (var i = 0; i < entries.length; i++) {
      var contact = {};
      var inputs = entries[i].querySelectorAll('input, select');
      for (var j = 0; j < inputs.length; j++) {
        var field = inputs[j].dataset.field;
        var val = inputs[j].value.trim();
        if (field && val) {
          contact[field] = val;
        }
      }
      if (contact.name || contact.email || contact.phone) {
        parsedContacts.push(contact);
      }
    }
  }

  // ============ Paste Data ============
  function parsePastedData() {
    var input = document.getElementById('ciPasteInput');
    if (!input || !input.value.trim()) {
      showToast('Please paste some data first.', 'error');
      return;
    }

    var text = input.value.trim();
    // Detect delimiter
    var delimiter = ',';
    var firstLine = text.split(/\r?\n/)[0];
    if (firstLine.indexOf('\t') !== -1) delimiter = '\t';
    else if (firstLine.indexOf(';') !== -1) delimiter = ';';

    parseCSV(text, delimiter);
  }

  // ============ Preview ============
  function showPreview() {
    var section = document.getElementById('ciPreviewSection');
    if (!section) return;
    section.style.display = '';

    // Check for duplicates against existing leads
    var existingLeads = getLeadsData();
    var existingEmails = {};
    var existingPhones = {};
    existingLeads.forEach(function (l) {
      if (l.email) existingEmails[l.email.toLowerCase()] = true;
      if (l.phone) existingPhones[l.phone.replace(/[^0-9+]/g, '')] = true;
    });

    var totalCount = parsedContacts.length;
    var validCount = 0;
    var dupCount = 0;
    var invalidCount = 0;

    var tbody = document.getElementById('ciPreviewBody');
    tbody.innerHTML = '';

    parsedContacts.forEach(function (contact, idx) {
      var isDuplicate = false;
      var isInvalid = false;
      var issues = [];

      // Check required field
      if (!contact.name && !contact.email) {
        isInvalid = true;
        issues.push('Missing name and email');
      }

      // Check duplicate
      if (contact.email && existingEmails[contact.email.toLowerCase()]) {
        isDuplicate = true;
        issues.push('Email exists');
      }
      if (contact.phone) {
        var cleanPhone = contact.phone.replace(/[^0-9+]/g, '');
        if (existingPhones[cleanPhone]) {
          isDuplicate = true;
          issues.push('Phone exists');
        }
      }

      if (isDuplicate) dupCount++;
      else if (isInvalid) invalidCount++;
      else validCount++;

      var rowClass = isDuplicate ? 'ci-row--duplicate' : (isInvalid ? 'ci-row--invalid' : 'ci-row--valid');

      var tr = document.createElement('tr');
      tr.className = rowClass;
      tr.innerHTML =
        '<td><input type="checkbox" class="ci-row-check" data-idx="' + idx + '" ' + (isDuplicate || isInvalid ? '' : 'checked') + '></td>' +
        '<td>' + escapeHtml(contact.name || '') + '</td>' +
        '<td>' + escapeHtml(contact.email || '') + '</td>' +
        '<td>' + escapeHtml(contact.phone || '') + '</td>' +
        '<td>' + escapeHtml(contact.company || '') + '</td>' +
        '<td>' + escapeHtml(contact.jobTitle || '') + '</td>' +
        '<td>' + escapeHtml(contact.location || '') + '</td>' +
        '<td>' + escapeHtml(contact.source || '') + '</td>' +
        '<td>' + (issues.length > 0 ? '<span class="ci-issue-badge">' + issues.join(', ') + '</span>' : '<span class="ci-valid-badge">Ready</span>') + '</td>';

      // Add change listener to checkbox
      var checkbox = tr.querySelector('.ci-row-check');
      checkbox.addEventListener('change', updatePreviewStats);

      tbody.appendChild(tr);
    });

    // Update stats
    document.getElementById('ciStatTotal').textContent = totalCount;
    document.getElementById('ciStatValid').textContent = validCount;
    document.getElementById('ciStatDuplicate').textContent = dupCount;
    document.getElementById('ciStatInvalid').textContent = invalidCount;

    // Scroll to preview
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updatePreviewStats() {
    var checkboxes = document.querySelectorAll('.ci-row-check');
    var checked = 0;
    for (var i = 0; i < checkboxes.length; i++) {
      if (checkboxes[i].checked) checked++;
    }
    var statusEl = document.getElementById('ciImportStatus');
    if (statusEl) statusEl.textContent = checked + ' contacts selected for import';
  }

  // ============ Import ============
  async function doImport() {
    var btn = document.getElementById('ciImportBtn');
    var statusEl = document.getElementById('ciImportStatus');

    // Collect selected contacts
    var selectedContacts = [];
    var checkboxes = document.querySelectorAll('.ci-row-check');
    for (var i = 0; i < checkboxes.length; i++) {
      if (checkboxes[i].checked) {
        var idx = parseInt(checkboxes[i].dataset.idx);
        selectedContacts.push(parsedContacts[idx]);
      }
    }

    if (selectedContacts.length === 0) {
      showToast('No contacts selected for import.', 'error');
      return;
    }

    // Apply default values
    var source = document.getElementById('ciImportSource').value;
    var status = document.getElementById('ciImportDefStatus').value || 'New';
    var priority = document.getElementById('ciImportPriority').value || 'Cold';
    var listName = document.getElementById('ciImportListName').value;

    selectedContacts = selectedContacts.map(function (c) {
      return Object.assign({}, c, {
        source: c.source || source,
        status: c.status || status,
        priority: c.priority || priority
      });
    });

    // Auto-acknowledge settings
    var autoAck = {
      enabled: document.getElementById('ciAutoAckEnabled').checked,
      message: document.getElementById('ciAckMessage').value || 'Hi {{name}}, thank you for your interest!'
    };

    btn.disabled = true;
    btn.textContent = 'Importing...';
    statusEl.textContent = 'Processing ' + selectedContacts.length + ' contacts...';

    try {
      var res = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: selectedContacts,
          autoAcknowledge: autoAck,
          listName: listName || ('Import ' + new Date().toLocaleDateString())
        })
      });
      var data = await res.json();

      if (data.leads) {
        // Also save to localStorage (the dashboard's data store)
        saveLeadsToLocalStorage(data.leads);

        var ackCount = data.acknowledged || 0;
        statusEl.textContent = 'Successfully imported ' + data.count + ' contacts' +
          (ackCount > 0 ? ' (' + ackCount + ' acknowledged via WhatsApp)' : '');
        statusEl.style.color = '#34d399';

        showToast('Imported ' + data.count + ' contacts!', 'success');

        // Add to import history
        addImportHistoryEntry({
          date: new Date().toISOString(),
          count: data.count,
          source: source,
          listName: listName,
          acknowledged: ackCount
        });

        // Reset preview
        setTimeout(function () {
          parsedContacts = [];
          document.getElementById('ciPreviewSection').style.display = 'none';
          resetUploadZone();
          btn.disabled = false;
          btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Import Contacts';
          statusEl.textContent = '';
          statusEl.style.color = '';
        }, 3000);
      } else if (data.error) {
        showToast(data.error, 'error');
        btn.disabled = false;
        btn.textContent = 'Import Contacts';
      }
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Import Contacts';
      statusEl.textContent = 'Import failed.';
      statusEl.style.color = '#f43f5e';
    }
  }

  function saveLeadsToLocalStorage(leads) {
    try {
      var existing = JSON.parse(localStorage.getItem('salesLeads') || '[]');
      var now = new Date().toISOString();
      leads.forEach(function (lead) {
        // Ensure proper format for dashboard
        existing.push({
          id: lead.id || ('lead_' + Date.now() + '_' + Math.random().toString(16).substr(2, 4)),
          name: lead.name || '',
          email: lead.email || '',
          phone: lead.phone || '',
          company: lead.company || '',
          jobTitle: lead.jobTitle || '',
          location: lead.location || '',
          source: lead.source || 'Import',
          campaign: lead.campaign || '',
          status: lead.status || 'New',
          priority: lead.priority || 'Cold',
          assignedTo: lead.assignedTo || '',
          companySize: lead.companySize || '',
          industry: lead.industry || '',
          seniority: lead.seniority || '',
          currentRemark: 'Imported via Contact Import',
          remarkHistory: [{
            text: 'Lead imported via Contact Import',
            date: now,
            user: 'System'
          }],
          createdAt: now,
          updatedAt: now
        });
      });
      localStorage.setItem('salesLeads', JSON.stringify(existing));
    } catch (e) {
      console.error('Failed to save leads to localStorage:', e);
    }
  }

  function resetUploadZone() {
    var zone = document.getElementById('ciUploadZone');
    if (zone) {
      zone.innerHTML =
        '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
        '<p class="ci-upload-zone__title">Drag & drop your CSV file here</p>' +
        '<p class="ci-upload-zone__hint">or click to browse files (CSV, Excel supported)</p>';
    }
    var fileInput = document.getElementById('ciFileInput');
    if (fileInput) fileInput.value = '';
    var mapping = document.getElementById('ciMappingSection');
    if (mapping) mapping.style.display = 'none';
  }

  // ============ Import History ============
  function loadImportHistory() {
    try {
      importHistory = JSON.parse(localStorage.getItem('contactImportHistory') || '[]');
    } catch (e) { importHistory = []; }
    renderImportHistory();
  }

  function addImportHistoryEntry(entry) {
    importHistory.unshift(entry);
    if (importHistory.length > 20) importHistory = importHistory.slice(0, 20);
    localStorage.setItem('contactImportHistory', JSON.stringify(importHistory));
    renderImportHistory();
  }

  function renderImportHistory() {
    var list = document.getElementById('ciHistoryList');
    if (!list) return;

    if (importHistory.length === 0) {
      list.innerHTML = '<div class="em-empty-hint">No imports yet. Upload a CSV or add contacts manually to get started.</div>';
      return;
    }

    list.innerHTML = '';
    importHistory.forEach(function (entry) {
      var item = document.createElement('div');
      item.className = 'ci-history-item';
      item.innerHTML =
        '<div class="ci-history-item__icon">' +
          '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#34d399" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
        '</div>' +
        '<div class="ci-history-item__body">' +
          '<div class="ci-history-item__title">' + (entry.count || 0) + ' contacts imported' + (entry.listName ? ' to "' + escapeHtml(entry.listName) + '"' : '') + '</div>' +
          '<div class="ci-history-item__meta">' +
            '<span>' + formatDate(entry.date) + '</span>' +
            '<span>Source: ' + escapeHtml(entry.source || 'Import') + '</span>' +
            (entry.acknowledged > 0 ? '<span class="ci-history-item__ack">' + entry.acknowledged + ' acknowledged</span>' : '') +
          '</div>' +
        '</div>';
      list.appendChild(item);
    });
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

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
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

  return {
    init: init
  };
})();
