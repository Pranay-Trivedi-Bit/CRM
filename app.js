(function () {
  'use strict';

  // ============================================================
  // MODULE: DataStore
  // Handles all localStorage CRUD and remark history logic
  // ============================================================
  const DataStore = {
    STORAGE_KEY: 'salesLeads',

    generateId() {
      const hex = Math.random().toString(16).substring(2, 6);
      return 'lead_' + Date.now() + '_' + hex;
    },

    getAll() {
      try {
        const data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : [];
      } catch {
        return [];
      }
    },

    saveAll(leads) {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(leads));
        return true;
      } catch (e) {
        if (e.name === 'QuotaExceededError') {
          UI.showToast('Storage is full. Please delete some leads to continue.', 'error');
        }
        return false;
      }
    },

    getById(id) {
      return this.getAll().find(l => l.id === id) || null;
    },

    create(leadData) {
      const leads = this.getAll();
      const now = new Date().toISOString();
      const lead = {
        id: this.generateId(),
        name: leadData.name || '',
        email: leadData.email || '',
        phone: leadData.phone || '',
        company: leadData.company || '',
        jobTitle: leadData.jobTitle || '',
        location: leadData.location || '',
        source: leadData.source || 'Website',
        campaign: leadData.campaign || '',
        status: leadData.status || 'New',
        priority: leadData.priority || 'Medium',
        assignedTo: leadData.assignedTo || '',
        currentRemark: leadData.currentRemark || '',
        remarkHistory: [],
        createdAt: now,
        updatedAt: now,
      };
      leads.push(lead);
      this.saveAll(leads);
      return lead;
    },

    update(id, changes) {
      const leads = this.getAll();
      const index = leads.findIndex(l => l.id === id);
      if (index === -1) return null;

      const existing = leads[index];

      // Handle remark history: save old remark before overwriting
      if (
        changes.currentRemark !== undefined &&
        changes.currentRemark !== existing.currentRemark &&
        existing.currentRemark.trim() !== ''
      ) {
        existing.remarkHistory.push({
          text: existing.currentRemark,
          timestamp: new Date().toISOString(),
        });
      }

      Object.assign(existing, changes, { updatedAt: new Date().toISOString() });
      leads[index] = existing;
      this.saveAll(leads);
      return existing;
    },

    delete(id) {
      const leads = this.getAll();
      const filtered = leads.filter(l => l.id !== id);
      if (filtered.length === leads.length) return false;
      this.saveAll(filtered);
      return true;
    },

    getSummary() {
      const leads = this.getAll();
      const summary = {
        total: leads.length,
        new: 0,
        contacted: 0,
        qualified: 0,
        proposalSent: 0,
        negotiation: 0,
        won: 0,
        lost: 0,
      };
      for (const lead of leads) {
        switch (lead.status) {
          case 'New': summary.new++; break;
          case 'Contacted': summary.contacted++; break;
          case 'Qualified': summary.qualified++; break;
          case 'Proposal Sent': summary.proposalSent++; break;
          case 'Negotiation': summary.negotiation++; break;
          case 'Won': summary.won++; break;
          case 'Lost': summary.lost++; break;
        }
      }
      return summary;
    },
  };

  // ============================================================
  // MODULE: UI
  // Handles all DOM rendering, modal, toasts, etc.
  // ============================================================
  const UI = {
    elements: {},
    editingId: null,
    deleteTimers: {},

    cacheElements() {
      this.elements = {
        btnNewLead: document.getElementById('btnNewLead'),
        summaryCards: document.getElementById('summaryCards'),
        metricTotal: document.getElementById('metricTotal'),
        metricHot: document.getElementById('metricHot'),
        metricWarm: document.getElementById('metricWarm'),
        metricCold: document.getElementById('metricCold'),
        metricDead: document.getElementById('metricDead'),
        searchInput: document.getElementById('searchInput'),
        filterLeadTemp: document.getElementById('filterLeadTemp'),
        filterCampaign: document.getElementById('filterCampaign'),
        filterDateFrom: document.getElementById('filterDateFrom'),
        filterDateTo: document.getElementById('filterDateTo'),
        clearDateFilter: document.getElementById('clearDateFilter'),
        leadsTableBody: document.getElementById('leadsTableBody'),
        emptyState: document.getElementById('emptyState'),
        emptyStateText: document.getElementById('emptyStateText'),
        modalBackdrop: document.getElementById('modalBackdrop'),
        modal: document.getElementById('modal'),
        modalTitle: document.getElementById('modalTitle'),
        modalClose: document.getElementById('modalClose'),
        leadForm: document.getElementById('leadForm'),
        btnCancel: document.getElementById('btnCancel'),
        btnSave: document.getElementById('btnSave'),
        remarkHistory: document.getElementById('remarkHistory'),
        remarkTimeline: document.getElementById('remarkTimeline'),
        // Form fields
        fieldName: document.getElementById('fieldName'),
        fieldEmail: document.getElementById('fieldEmail'),
        fieldPhone: document.getElementById('fieldPhone'),
        fieldCompany: document.getElementById('fieldCompany'),
        fieldSource: document.getElementById('fieldSource'),
        fieldAssignedTo: document.getElementById('fieldAssignedTo'),
        fieldRemark: document.getElementById('fieldRemark'),
        // Auto-classification fields
        autoDisposition: document.getElementById('autoDisposition'),
        autoSubDisposition: document.getElementById('autoSubDisposition'),
        autoStatus: document.getElementById('autoStatus'),
        autoClassification: document.getElementById('autoClassification'),
        // Error spans
        errorName: document.getElementById('errorName'),
        errorEmail: document.getElementById('errorEmail'),
        toastContainer: document.getElementById('toastContainer'),
        // Chart elements
        statusChart: document.getElementById('statusChart'),
        chartCenterCount: document.getElementById('chartCenterCount'),
        legendHot: document.getElementById('legendHot'),
        legendWarm: document.getElementById('legendWarm'),
        legendCold: document.getElementById('legendCold'),
        legendDead: document.getElementById('legendDead'),
        legendHotPct: document.getElementById('legendHotPct'),
        legendWarmPct: document.getElementById('legendWarmPct'),
        legendColdPct: document.getElementById('legendColdPct'),
        legendDeadPct: document.getElementById('legendDeadPct'),
        legendBarHot: document.getElementById('legendBarHot'),
        legendBarWarm: document.getElementById('legendBarWarm'),
        legendBarCold: document.getElementById('legendBarCold'),
        legendBarDead: document.getElementById('legendBarDead'),
        metricHotSub: document.getElementById('metricHotSub'),
        metricWarmSub: document.getElementById('metricWarmSub'),
        metricColdSub: document.getElementById('metricColdSub'),
        metricDeadSub: document.getElementById('metricDeadSub'),
      };
    },

    renderPipeline() {
      const leads = DataStore.getAll();
      const tempCounts = { Hot: 0, Warm: 0, Cold: 0, Dead: 0 };

      for (const lead of leads) {
        const c = Disposition.classify(lead.currentRemark);
        if (tempCounts[c.leadTemp] !== undefined) {
          tempCounts[c.leadTemp]++;
        }
      }

      const total = leads.length;
      const pct = (n) => total > 0 ? ((n / total) * 100).toFixed(1) : '0.0';
      const maxCount = Math.max(tempCounts.Hot, tempCounts.Warm, tempCounts.Cold, tempCounts.Dead, 1);

      // Update center count
      this.elements.chartCenterCount.textContent = total;

      // Update legend counts, percentages, bars
      this.elements.legendHot.textContent = tempCounts.Hot;
      this.elements.legendWarm.textContent = tempCounts.Warm;
      this.elements.legendCold.textContent = tempCounts.Cold;
      this.elements.legendDead.textContent = tempCounts.Dead;

      this.elements.legendHotPct.textContent = pct(tempCounts.Hot) + '%';
      this.elements.legendWarmPct.textContent = pct(tempCounts.Warm) + '%';
      this.elements.legendColdPct.textContent = pct(tempCounts.Cold) + '%';
      this.elements.legendDeadPct.textContent = pct(tempCounts.Dead) + '%';

      this.elements.legendBarHot.style.width = ((tempCounts.Hot / maxCount) * 100) + '%';
      this.elements.legendBarWarm.style.width = ((tempCounts.Warm / maxCount) * 100) + '%';
      this.elements.legendBarCold.style.width = ((tempCounts.Cold / maxCount) * 100) + '%';
      this.elements.legendBarDead.style.width = ((tempCounts.Dead / maxCount) * 100) + '%';

      // Draw donut chart
      this.drawDonutChart(tempCounts, total);

    },

    drawDonutChart(counts, total) {
      const canvas = this.elements.statusChart;
      if (!canvas) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const size = rect.width || 280;

      canvas.width = size * dpr;
      canvas.height = size * dpr;

      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      const cx = size / 2;
      const cy = size / 2;
      const outerR = (size / 2) - 8;
      const innerR = outerR * 0.62;
      const gap = 0.03; // radians gap between segments

      const segments = [
        { key: 'Hot',  count: counts.Hot,  colors: ['#dc2626', '#f97316'] },
        { key: 'Warm', count: counts.Warm, colors: ['#f59e0b', '#fbbf24'] },
        { key: 'Cold', count: counts.Cold, colors: ['#3b82f6', '#60a5fa'] },
        { key: 'Dead', count: counts.Dead, colors: ['#4b5563', '#6b7280'] },
      ];

      ctx.clearRect(0, 0, size, size);

      if (total === 0) {
        // Draw empty ring
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
        ctx.arc(cx, cy, innerR, Math.PI * 2, 0, true);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fill();
        return;
      }

      const nonZero = segments.filter(s => s.count > 0);
      const totalGap = nonZero.length > 1 ? gap * nonZero.length : 0;
      const available = (Math.PI * 2) - totalGap;
      let angle = -Math.PI / 2; // start at top

      for (const seg of segments) {
        if (seg.count === 0) continue;

        const sweep = (seg.count / total) * available;

        // Create gradient along the arc
        const midAngle = angle + sweep / 2;
        const gx1 = cx + Math.cos(midAngle - 0.5) * outerR;
        const gy1 = cy + Math.sin(midAngle - 0.5) * outerR;
        const gx2 = cx + Math.cos(midAngle + 0.5) * outerR;
        const gy2 = cy + Math.sin(midAngle + 0.5) * outerR;

        const grad = ctx.createLinearGradient(gx1, gy1, gx2, gy2);
        grad.addColorStop(0, seg.colors[0]);
        grad.addColorStop(1, seg.colors[1]);

        ctx.beginPath();
        ctx.arc(cx, cy, outerR, angle, angle + sweep);
        ctx.arc(cx, cy, innerR, angle + sweep, angle, true);
        ctx.closePath();

        ctx.fillStyle = grad;
        ctx.fill();

        // Subtle shadow
        ctx.shadowColor = seg.colors[0];
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        angle += sweep + (nonZero.length > 1 ? gap : 0);
      }
    },

    renderSummaryCards() {
      const leads = DataStore.getAll();
      const tempCounts = { Hot: 0, Warm: 0, Cold: 0, Dead: 0 };
      for (const lead of leads) {
        const c = Disposition.classify(lead.currentRemark);
        if (tempCounts[c.leadTemp] !== undefined) {
          tempCounts[c.leadTemp]++;
        }
      }
      const total = leads.length;
      const pct = (n) => total > 0 ? ((n / total) * 100).toFixed(1) : '0.0';
      this.elements.metricTotal.textContent = total;
      this.elements.metricHot.innerHTML = tempCounts.Hot + '<span class="card__pct">' + pct(tempCounts.Hot) + '%</span>';
      this.elements.metricWarm.innerHTML = tempCounts.Warm + '<span class="card__pct">' + pct(tempCounts.Warm) + '%</span>';
      this.elements.metricCold.innerHTML = tempCounts.Cold + '<span class="card__pct">' + pct(tempCounts.Cold) + '%</span>';
      this.elements.metricDead.innerHTML = tempCounts.Dead + '<span class="card__pct">' + pct(tempCounts.Dead) + '%</span>';
      this.elements.metricHotSub.textContent = tempCounts.Hot + ' hot out of ' + total + ' total leads';
      this.elements.metricWarmSub.textContent = tempCounts.Warm + ' warm out of ' + total + ' total leads';
      this.elements.metricColdSub.textContent = tempCounts.Cold + ' cold out of ' + total + ' total leads';
      this.elements.metricDeadSub.textContent = tempCounts.Dead + ' dead out of ' + total + ' total leads';
    },

    renderTable(leads) {
      const tbody = this.elements.leadsTableBody;
      tbody.innerHTML = '';

      if (leads.length === 0) {
        this.elements.emptyState.style.display = 'flex';
        return;
      }

      this.elements.emptyState.style.display = 'none';

      for (const lead of leads) {
        tbody.appendChild(this.createTableRow(lead));
      }
    },

    createTableRow(lead) {
      const tr = document.createElement('tr');
      tr.dataset.id = lead.id;

      // 1. Name (with LinkedIn profile link)
      const tdName = document.createElement('td');
      const nameSpan = document.createElement('span');
      nameSpan.className = 'lead-name';
      nameSpan.textContent = lead.name;
      tdName.appendChild(nameSpan);
      // LinkedIn profile link
      if (lead.name) {
        const linkedInLink = document.createElement('a');
        linkedInLink.className = 'lead-linkedin';
        linkedInLink.href = 'https://www.linkedin.com/search/results/all/?keywords=' + encodeURIComponent(lead.name);
        linkedInLink.target = '_blank';
        linkedInLink.rel = 'noopener noreferrer';
        linkedInLink.textContent = 'LinkedIn';
        tdName.appendChild(linkedInLink);
      }
      tr.appendChild(tdName);

      // 2. Contact (email + phone combined)
      const tdContact = document.createElement('td');
      if (lead.email) {
        const emailLink = document.createElement('a');
        emailLink.className = 'lead-email';
        emailLink.href = 'mailto:' + lead.email;
        emailLink.textContent = lead.email;
        tdContact.appendChild(emailLink);
      }
      if (lead.phone) {
        const phoneSpan = document.createElement('span');
        phoneSpan.className = 'lead-phone';
        phoneSpan.textContent = lead.phone;
        tdContact.appendChild(phoneSpan);
      }
      if (!lead.email && !lead.phone) {
        tdContact.textContent = '-';
      }
      tr.appendChild(tdContact);

      // 3. Company
      const tdCompany = document.createElement('td');
      tdCompany.textContent = lead.company || '-';
      tr.appendChild(tdCompany);

      // 4. Job Title (hidden on tablet)
      const tdJobTitle = document.createElement('td');
      tdJobTitle.className = 'col-hide-tablet';
      tdJobTitle.textContent = lead.jobTitle || '-';
      tr.appendChild(tdJobTitle);

      // 5. Campaign
      const tdCampaign = document.createElement('td');
      if (lead.campaign) {
        const campaignBadge = document.createElement('span');
        campaignBadge.className = 'badge badge--campaign';
        campaignBadge.textContent = lead.campaign;
        tdCampaign.appendChild(campaignBadge);
      } else {
        tdCampaign.textContent = '-';
      }
      tr.appendChild(tdCampaign);

      // 6. Location (hidden on tablet)
      const tdLocation = document.createElement('td');
      tdLocation.className = 'col-hide-tablet';
      tdLocation.textContent = lead.location || '-';
      tr.appendChild(tdLocation);

      // 7. Assigned To (with CSM email from SharePoint sheet)
      const tdAssigned = document.createElement('td');
      const assignedName = lead.assignedTo || '-';
      const csmEmail = (typeof CSM_EMAIL_MAP !== 'undefined' && assignedName !== '-')
        ? CSM_EMAIL_MAP[assignedName.toLowerCase()] || ''
        : '';
      if (csmEmail) {
        const csmNameSpan = document.createElement('span');
        csmNameSpan.className = 'csm-name';
        csmNameSpan.textContent = assignedName;
        tdAssigned.appendChild(csmNameSpan);
        const emailLink = document.createElement('a');
        emailLink.className = 'csm-email';
        emailLink.href = 'mailto:' + csmEmail;
        emailLink.textContent = csmEmail;
        tdAssigned.appendChild(emailLink);
      } else {
        tdAssigned.textContent = assignedName;
      }
      tr.appendChild(tdAssigned);

      // 8. Last Remark (truncated)
      const tdRemark = document.createElement('td');
      const remarkSpan = document.createElement('span');
      remarkSpan.className = 'lead-remark';
      const remarkText = lead.currentRemark || '-';
      remarkSpan.textContent = this.truncateText(remarkText, 60);
      if (lead.currentRemark && lead.currentRemark.length > 60) {
        remarkSpan.title = lead.currentRemark;
      }
      tdRemark.appendChild(remarkSpan);
      tr.appendChild(tdRemark);

      // Disposition columns
      const classification = Disposition.classify(lead.currentRemark);

      // 9. Disposition
      const tdDisposition = document.createElement('td');
      const dispBadge = document.createElement('span');
      dispBadge.className = 'badge badge--disposition';
      dispBadge.textContent = classification.disposition;
      tdDisposition.appendChild(dispBadge);
      tr.appendChild(tdDisposition);

      // 10. Sub-Disposition
      const tdSubDisp = document.createElement('td');
      const subDispSpan = document.createElement('span');
      subDispSpan.className = 'lead-subdisposition';
      subDispSpan.textContent = classification.subDisposition;
      tdSubDisp.appendChild(subDispSpan);
      tr.appendChild(tdSubDisp);

      // 11. Status (Hot/Warm/Cold/Dead)
      const tdLeadTemp = document.createElement('td');
      const tempBadge = document.createElement('span');
      tempBadge.className = 'badge badge--temp badge--temp-' + Disposition.getLeadTempClass(classification.leadTemp);
      tempBadge.textContent = classification.leadTemp;
      tdLeadTemp.appendChild(tempBadge);
      tr.appendChild(tdLeadTemp);

      // 12. Actions
      const tdActions = document.createElement('td');
      tdActions.className = 'col-actions';
      const actionDiv = document.createElement('div');
      actionDiv.className = 'action-btns';

      // Edit button (highlighted)
      const editBtn = document.createElement('button');
      editBtn.className = 'action-btn action-btn--edit';
      editBtn.title = 'Edit lead';
      editBtn.dataset.action = 'edit';
      editBtn.dataset.id = lead.id;
      editBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg> Edit';
      actionDiv.appendChild(editBtn);

      tdActions.appendChild(actionDiv);
      tr.appendChild(tdActions);

      return tr;
    },

    getStatusClass(status) {
      const map = {
        'New': 'new',
        'Contacted': 'contacted',
        'Qualified': 'qualified',
        'Proposal Sent': 'proposal',
        'Negotiation': 'negotiation',
        'Won': 'won',
        'Lost': 'lost',
      };
      return map[status] || 'new';
    },

    truncateText(text, maxLen) {
      if (!text || text.length <= maxLen) return text;
      return text.substring(0, maxLen) + '...';
    },

    formatDate(isoString) {
      if (!isoString) return '';
      try {
        return new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }).format(new Date(isoString));
      } catch {
        return isoString;
      }
    },

    openAddModal() {
      this.editingId = null;
      this.elements.modalTitle.textContent = 'Add New Lead';
      this.elements.leadForm.reset();
      this.elements.fieldSource.value = 'LinkedIn';
      this.elements.remarkHistory.style.display = 'none';
      this.clearValidationErrors();
      this.updateAutoClassification('');
      this.elements.modalBackdrop.classList.add('active');
      this.elements.fieldName.focus();
    },

    openEditModal(leadId) {
      const lead = DataStore.getById(leadId);
      if (!lead) return;

      this.editingId = leadId;
      this.elements.modalTitle.textContent = 'Edit Lead';
      this.clearValidationErrors();

      // Fill form fields
      this.elements.fieldName.value = lead.name;
      this.elements.fieldEmail.value = lead.email;
      this.elements.fieldPhone.value = lead.phone;
      this.elements.fieldCompany.value = lead.company;
      this.elements.fieldSource.value = lead.source;
      this.elements.fieldAssignedTo.value = lead.assignedTo;
      this.elements.fieldRemark.value = lead.currentRemark;

      // Update auto-classification based on current remark
      this.updateAutoClassification(lead.currentRemark);

      // Render remark history
      this.renderRemarkHistory(lead.remarkHistory, lead.currentRemark);

      this.elements.modalBackdrop.classList.add('active');
      this.elements.fieldName.focus();
    },

    closeModal() {
      this.elements.modalBackdrop.classList.remove('active');
      this.editingId = null;
      this.elements.leadForm.reset();
      this.clearValidationErrors();
    },

    renderRemarkHistory(remarkHistory, currentRemark) {
      const timeline = this.elements.remarkTimeline;
      timeline.innerHTML = '';

      const hasHistory = remarkHistory && remarkHistory.length > 0;
      const hasCurrentRemark = currentRemark && currentRemark.trim() !== '';

      if (!hasHistory && !hasCurrentRemark) {
        this.elements.remarkHistory.style.display = 'none';
        return;
      }

      this.elements.remarkHistory.style.display = 'block';

      // Past remarks
      if (hasHistory) {
        for (const entry of remarkHistory) {
          const div = document.createElement('div');
          div.className = 'remark-entry';

          const tsSpan = document.createElement('span');
          tsSpan.className = 'remark-entry__timestamp';
          tsSpan.textContent = this.formatDate(entry.timestamp);
          div.appendChild(tsSpan);

          const textP = document.createElement('p');
          textP.className = 'remark-entry__text';
          textP.textContent = entry.text;
          div.appendChild(textP);

          timeline.appendChild(div);
        }
      }

      // Current remark
      if (hasCurrentRemark) {
        const div = document.createElement('div');
        div.className = 'remark-entry remark-entry--current';

        const badge = document.createElement('span');
        badge.className = 'remark-entry__badge';
        badge.textContent = 'Current';
        div.appendChild(badge);

        const textP = document.createElement('p');
        textP.className = 'remark-entry__text';
        textP.textContent = currentRemark;
        div.appendChild(textP);

        timeline.appendChild(div);
      }
    },

    getFormData() {
      return {
        name: this.elements.fieldName.value.trim(),
        email: this.elements.fieldEmail.value.trim(),
        phone: this.elements.fieldPhone.value.trim(),
        company: this.elements.fieldCompany.value.trim(),
        source: this.elements.fieldSource.value,
        status: 'New',
        priority: 'Medium',
        assignedTo: this.elements.fieldAssignedTo.value.trim(),
        currentRemark: this.elements.fieldRemark.value.trim(),
      };
    },

    validateForm(data) {
      const errors = {};
      if (!data.name) {
        errors.name = 'Name is required';
      }
      if (data.email && !this.isValidEmail(data.email)) {
        errors.email = 'Please enter a valid email';
      }
      return { valid: Object.keys(errors).length === 0, errors };
    },

    isValidEmail(email) {
      const atIdx = email.indexOf('@');
      if (atIdx < 1) return false;
      const domain = email.substring(atIdx + 1);
      return domain.includes('.');
    },

    showValidationErrors(errors) {
      if (errors.name) {
        this.elements.errorName.textContent = errors.name;
        this.elements.fieldName.classList.add('has-error');
      }
      if (errors.email) {
        this.elements.errorEmail.textContent = errors.email;
        this.elements.fieldEmail.classList.add('has-error');
      }
    },

    clearValidationErrors() {
      this.elements.errorName.textContent = '';
      this.elements.errorEmail.textContent = '';
      this.elements.fieldName.classList.remove('has-error');
      this.elements.fieldEmail.classList.remove('has-error');
    },

    showToast(message, type) {
      const container = this.elements.toastContainer;
      const toast = document.createElement('div');
      toast.className = 'toast toast--' + (type || 'info');
      toast.textContent = message;
      container.appendChild(toast);

      setTimeout(() => {
        toast.classList.add('removing');
        toast.addEventListener('animationend', () => toast.remove());
      }, 3000);
    },

    showDeleteConfirmation(leadId, rowElement) {
      // Cancel any existing delete confirmation on this row
      this.cancelDeleteConfirmation(leadId);

      rowElement.classList.add('row--deleting');
      const actionsCell = rowElement.querySelector('.col-actions');
      const originalContent = actionsCell.innerHTML;
      actionsCell.dataset.originalHtml = originalContent;

      const confirmDiv = document.createElement('div');
      confirmDiv.className = 'delete-confirm';

      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'btn btn--danger';
      confirmBtn.textContent = 'Confirm';
      confirmBtn.dataset.action = 'confirm-delete';
      confirmBtn.dataset.id = leadId;

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn--ghost';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.dataset.action = 'cancel-delete';
      cancelBtn.dataset.id = leadId;

      confirmDiv.appendChild(confirmBtn);
      confirmDiv.appendChild(cancelBtn);

      actionsCell.innerHTML = '';
      actionsCell.appendChild(confirmDiv);

      // Auto-dismiss after 5 seconds
      this.deleteTimers[leadId] = setTimeout(() => {
        this.cancelDeleteConfirmation(leadId);
      }, 5000);
    },

    cancelDeleteConfirmation(leadId) {
      if (this.deleteTimers[leadId]) {
        clearTimeout(this.deleteTimers[leadId]);
        delete this.deleteTimers[leadId];
      }

      const row = this.elements.leadsTableBody.querySelector('tr[data-id="' + leadId + '"]');
      if (!row) return;

      row.classList.remove('row--deleting');
      const actionsCell = row.querySelector('.col-actions');
      if (actionsCell && actionsCell.dataset.originalHtml) {
        actionsCell.innerHTML = actionsCell.dataset.originalHtml;
        delete actionsCell.dataset.originalHtml;
      }
    },

    updateAutoClassification(remarkText) {
      const c = Disposition.classify(remarkText);
      this.elements.autoDisposition.textContent = c.disposition;
      this.elements.autoSubDisposition.textContent = c.subDisposition;
      this.elements.autoStatus.textContent = c.leadTemp;
      this.elements.autoStatus.className = 'form__auto-value form__auto-status form__auto-status--' + Disposition.getLeadTempClass(c.leadTemp);
    },

    toggleEmptyState(show, message) {
      this.elements.emptyState.style.display = show ? 'flex' : 'none';
      if (message) {
        this.elements.emptyStateText.textContent = message;
      }
    },
  };

  // ============================================================
  // MODULE: Filters
  // Handles search, filter, and sort state and logic
  // ============================================================
  const Filters = {
    state: {
      searchQuery: '',
      leadTempFilter: 'All',
      campaignFilter: 'All',
      dateFrom: '',
      dateTo: '',
    },

    apply(leads) {
      let result = leads.slice(); // work on a copy
      result = this.filterBySearch(result, this.state.searchQuery);
      result = this.filterByField(result, 'campaign', this.state.campaignFilter);
      if (this.state.leadTempFilter !== 'All') {
        result = result.filter(lead => {
          const c = Disposition.classify(lead.currentRemark);
          return c.leadTemp === this.state.leadTempFilter;
        });
      }
      result = this.filterByDate(result);
      result = this.sort(result, 'updatedAt', 'desc');
      return result;
    },

    filterBySearch(leads, query) {
      if (!query.trim()) return leads;
      const q = query.toLowerCase().trim();
      return leads.filter(lead =>
        (lead.name || '').toLowerCase().includes(q) ||
        (lead.email || '').toLowerCase().includes(q) ||
        (lead.company || '').toLowerCase().includes(q) ||
        (lead.assignedTo || '').toLowerCase().includes(q) ||
        (lead.currentRemark || '').toLowerCase().includes(q)
      );
    },

    filterByField(leads, field, value) {
      if (value === 'All') return leads;
      return leads.filter(lead => lead[field] === value);
    },

    filterByDate(leads) {
      const from = this.state.dateFrom;
      const to = this.state.dateTo;
      if (!from && !to) return leads;

      return leads.filter(lead => {
        const leadDate = lead.createdAt ? lead.createdAt.substring(0, 10) : '';
        if (!leadDate) return true;
        if (from && leadDate < from) return false;
        if (to && leadDate > to) return false;
        return true;
      });
    },

    sort(leads, field, direction) {
      const statusOrder = {
        'New': 1,
        'Contacted': 2,
        'Qualified': 3,
        'Proposal Sent': 4,
        'Negotiation': 5,
        'Won': 6,
        'Lost': 7,
      };
      const dir = direction === 'asc' ? 1 : -1;

      return leads.sort((a, b) => {
        let valA, valB;

        if (field === 'status') {
          valA = statusOrder[a.status] || 0;
          valB = statusOrder[b.status] || 0;
          return (valA - valB) * dir;
        }

        if (field === 'createdAt' || field === 'updatedAt') {
          valA = new Date(a[field]).getTime();
          valB = new Date(b[field]).getTime();
          return (valA - valB) * dir;
        }

        // String fields
        valA = (a[field] || '').toLowerCase();
        valB = (b[field] || '').toLowerCase();
        return valA.localeCompare(valB) * dir;
      });
    },
  };

  // ============================================================
  // MODULE: Disposition
  // Classifies lead remarks into Disposition/Sub-Disposition/LeadTemp
  // Based on the LinkedIn Disposition Excel sheet
  // ============================================================
  const Disposition = {
    // Each entry: [Disposition, Sub-Disposition, keywords/phrases for matching, LeadTemp]
    // LeadTemp mapping from the Excel: Dead, Cold, Warm, Hot
    rules: [
      // HOT dispositions
      ['Prospect', 'Payment this week', ['payment this week', 'pay this week', 'paying this week'], 'Hot'],
      ['Prospect', 'Payment this month', ['payment this month', 'pay this month', 'paying this month'], 'Hot'],
      ['Prospect', 'Payment next month', ['payment next month', 'pay next month', 'paying next month'], 'Hot'],
      ['Prospect', 'Shared PO', ['shared po', 'purchase order', 'po shared', 'po sent', 'po raised'], 'Hot'],
      ['Follow up', 'Interested', ['interested', 'details shared', 'program shared', 'stay in touch', 'wants to know more', 'keen', 'looking forward'], 'Hot'],
      ['Converted', 'Converted', ['converted', 'payment done', 'enrolled', 'admission confirmed', 'registered', 'paid'], 'Hot'],

      // WARM dispositions
      ['Follow up', 'Customer Busy', ['busy at the moment', 'busy right now', 'in a meeting', 'will call back later', 'busy currently'], 'Warm'],
      ['Follow up', 'Company Approval / Internal Discussion', ['company approval', 'internal discussion', 'waiting for approval', 'manager approval', 'need to discuss internally', 'checking with management'], 'Warm'],
      ['Follow up', 'Not Answered', ['not answered', 'did not answer', 'no answer', 'not picking up', 'unreachable', 'switched off', 'not reachable'], 'Warm'],
      ['Call Back', 'Customer Busy', ['call back', 'callback', 'asked for call back', 'was busy', 'cx busy', 'customer busy'], 'Warm'],
      ['Call Back', 'Not answering', ['not answering', 'call back bucket', 'did not pick', 'ring no answer'], 'Warm'],
      ['Call Back', 'RPC Not available', ['rpc not available', 'right person not available', 'not contacted', 'person not available', 'contact person unavailable'], 'Warm'],
      ['Other Agent Callback', 'Other Agent Callback', ['other agent callback', 'another counselor callback', 'other counselor', 'transferred to another agent'], 'Warm'],
      ['Other Agent FollowUp', 'Other Agent FollowUp', ['other agent follow', 'another counselor follow', 'other counselor follow', 'transferred follow'], 'Warm'],
      ['Next Batch', 'Same course', ['next batch same', 'same course next batch', 'next batch of the same', 'same program next batch'], 'Warm'],
      ['Next Batch', 'Other course', ['next batch other', 'next batch another', 'another course next batch', 'different course next batch'], 'Warm'],

      // COLD dispositions
      ['Fallout', 'Fee is high', ['fee is high', 'too expensive', 'costly', 'cannot afford', 'budget issue', 'price is high', 'fees are high', 'not affordable'], 'Cold'],
      ['Fallout', 'Effort Exhaust', ['effort exhaust', 'tried many times', 'no response after multiple', 'exhausted', 'multiple attempts'], 'Cold'],
      ['Fallout', 'Enrolled in other company', ['enrolled in other company', 'joined another', 'taken admission with another', 'enrolled elsewhere', 'joined competitor', 'went with another ed-tech'], 'Cold'],
      ['Fallout', 'Enrolled in other course', ['enrolled in other course', 'another program', 'taken admission in another', 'different course', 'other course'], 'Cold'],
      ['Fallout', 'Reason not shared', ['reason not shared', 'refused to share', 'did not mention reason', 'no reason given', 'would not say'], 'Cold'],
      ['Fallout', 'Syllabus disinterest', ['syllabus disinterest', 'other curriculum', 'different domain', 'not interested in syllabus', 'course content not relevant', 'different subject'], 'Cold'],
      ['Fallout', 'Time constraint', ['time constraint', 'no time', 'unable to invest time', 'too busy for course', 'cannot commit time', 'schedule conflict'], 'Cold'],
      ['Fallout', 'Free training', ['free training', 'asked for free', 'wants free', 'looking for free', 'free course'], 'Cold'],
      ['New Lead', 'New Lead', ['new lead', 'no conversation', 'not contacted yet', 'fresh lead', 'did not have a conversation'], 'Cold'],
      ['Not interested', 'Looking For A Regular Degree', ['regular degree', 'regular program', 'full time degree', 'offline degree', 'regular college'], 'Cold'],
      ['Not interested', 'Looking for Certification Course', ['certification course', 'certificate course', 'looking for certification', 'wants certificate'], 'Cold'],
      ['Not interested', 'Looking for degree course', ['degree course', 'looking for degree', 'wants a degree', 'degree program'], 'Cold'],
      ['Not interested', 'Looking for Job', ['looking for job', 'job search', 'wants a job', 'not education', 'employment', 'job opening'], 'Cold'],
      ['Not interested', 'Reason not shared', ['not interested reason not shared', 'not interested no reason'], 'Cold'],
      ['Not interested', 'Syllabus disinterest', ['not interested syllabus', 'not interested curriculum'], 'Cold'],
      ['Not interested', 'Time constraint', ['not interested time', 'not interested busy'], 'Cold'],
      ['Not interested', 'Just Exploring', ['just exploring', 'just looking', 'exploring options', 'browsing', 'window shopping', 'not decided', 'deciding phase'], 'Cold'],

      // DEAD dispositions
      ['DNC', 'DNC', ['do not call', 'dnc', 'do not contact', 'stop calling', 'remove from list', 'unsubscribe'], 'Dead'],
      ['Not Eligible', 'Education', ['not eligible education', 'qualification not met', 'not eligible for the program', 'education qualification', 'does not qualify'], 'Dead'],
      ['Not Eligible', 'Experience', ['not eligible experience', 'work experience requirement', 'do not possess required', 'insufficient experience', 'experience not enough'], 'Dead'],
      ['Not Eligible', 'Language Barrier', ['language barrier', 'not comfortable in english', 'language issue', 'cannot communicate', 'language problem'], 'Dead'],
      ['Not Eligible', 'Ad was not clear', ['ad was not clear', 'did not know what the ad', 'confused by ad', 'misleading ad', 'unclear advertisement'], 'Dead'],
      ['Not Eligible', 'Did not enquire', ['did not enquire', 'did not make enquiry', 'never enquired', 'no enquiry made', 'accidental lead'], 'Dead'],
      ['Not Eligible', 'Enquired by mistake', ['enquired by mistake', 'by mistake', 'wrong enquiry', 'accidental enquiry', 'enquire about other'], 'Dead'],
      ['Wrong Number', 'Wrong Number', ['wrong number', 'incorrect number', 'number not valid', 'invalid number', 'wrong phone'], 'Dead'],
      ['Not Enquired', 'Not Enquired', ['not enquired', 'never contacted us', 'no enquiry'], 'Dead'],
    ],

    classify(remark) {
      if (!remark || remark.trim() === '') {
        return { disposition: 'Remark Not Clear', subDisposition: 'Remark Not Clear', leadTemp: 'Cold' };
      }

      const lower = remark.toLowerCase();

      // Try to match against rules (ordered by specificity)
      for (const [disposition, subDisposition, keywords, leadTemp] of this.rules) {
        for (const keyword of keywords) {
          if (lower.includes(keyword)) {
            return { disposition, subDisposition, leadTemp };
          }
        }
      }

      // No match found
      return { disposition: 'Remark Not Clear', subDisposition: 'Remark Not Clear', leadTemp: 'Cold' };
    },

    getLeadTempClass(temp) {
      const map = { 'Hot': 'hot', 'Warm': 'warm', 'Cold': 'cold', 'Dead': 'dead' };
      return map[temp] || 'cold';
    },
  };

  // ============================================================
  // MODULE: App
  // Initialization, event binding, orchestration
  // ============================================================
  const App = {
    init() {
      UI.cacheElements();
      this.bindEvents();
      this.populateCampaignFilter();
      this.refresh();
      this.initColumnResize();
    },

    bindEvents() {
      // New Lead button
      UI.elements.btnNewLead.addEventListener('click', () => UI.openAddModal());

      // Modal controls
      UI.elements.modalClose.addEventListener('click', () => UI.closeModal());
      UI.elements.btnCancel.addEventListener('click', () => UI.closeModal());
      UI.elements.modalBackdrop.addEventListener('click', (e) => {
        if (e.target === UI.elements.modalBackdrop) UI.closeModal();
      });

      // Save button
      UI.elements.btnSave.addEventListener('click', () => this.handleSave());

      // Submit form on Enter in fields (except textarea)
      UI.elements.leadForm.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          this.handleSave();
        }
      });

      // Escape to close modal
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') UI.closeModal();
      });

      // Auto-classify remark as user types
      UI.elements.fieldRemark.addEventListener('input', (e) => {
        UI.updateAutoClassification(e.target.value);
      });

      // Chart legend click - filter by lead temp
      document.getElementById('chartLegend').addEventListener('click', (e) => {
        const item = e.target.closest('.chart-legend__item');
        if (!item) return;
        const temp = item.dataset.stage;
        if (temp) {
          UI.elements.filterLeadTemp.value = temp;
          Filters.state.leadTempFilter = temp;
          this.refresh();
        }
      });

      // Table click delegation
      UI.elements.leadsTableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const id = btn.dataset.id;

        if (action === 'edit') {
          UI.openEditModal(id);
        } else if (action === 'delete') {
          const row = btn.closest('tr');
          UI.showDeleteConfirmation(id, row);
        } else if (action === 'confirm-delete') {
          this.handleDelete(id);
        } else if (action === 'cancel-delete') {
          UI.cancelDeleteConfirmation(id);
        }
      });

      // Search (debounced)
      UI.elements.searchInput.addEventListener('input',
        this.debounce((e) => {
          Filters.state.searchQuery = e.target.value;
          this.refresh();
        }, 300)
      );

      // Filter dropdowns
      UI.elements.filterLeadTemp.addEventListener('change', (e) => {
        Filters.state.leadTempFilter = e.target.value;
        this.refresh();
      });
      UI.elements.filterCampaign.addEventListener('change', (e) => {
        Filters.state.campaignFilter = e.target.value;
        this.refresh();
      });

      // Date filter
      UI.elements.filterDateFrom.addEventListener('change', (e) => {
        Filters.state.dateFrom = e.target.value;
        this.refresh();
      });
      UI.elements.filterDateTo.addEventListener('change', (e) => {
        Filters.state.dateTo = e.target.value;
        this.refresh();
      });
      UI.elements.clearDateFilter.addEventListener('click', () => {
        UI.elements.filterDateFrom.value = '';
        UI.elements.filterDateTo.value = '';
        Filters.state.dateFrom = '';
        Filters.state.dateTo = '';
        this.refresh();
      });
    },

    populateCampaignFilter() {
      const leads = DataStore.getAll();
      const campaignSet = new Set();
      for (const lead of leads) {
        if (lead.campaign) campaignSet.add(lead.campaign);
      }
      const select = UI.elements.filterCampaign;
      const currentVal = select.value;
      select.innerHTML = '<option value="All">All Campaigns</option>';
      const sorted = Array.from(campaignSet).sort();
      for (const c of sorted) {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        select.appendChild(opt);
      }
      select.value = currentVal;
    },

    refresh() {
      const allLeads = DataStore.getAll();
      const filtered = Filters.apply(allLeads);
      UI.renderSummaryCards();
      UI.renderPipeline();
      UI.renderTable(filtered);

      if (filtered.length === 0) {
        const message = allLeads.length === 0
          ? 'No leads yet. Click "New Lead" to get started.'
          : 'No leads match your current filters.';
        UI.toggleEmptyState(true, message);
      } else {
        UI.toggleEmptyState(false);
      }
    },

    handleSave() {
      const data = UI.getFormData();
      const validation = UI.validateForm(data);

      if (!validation.valid) {
        UI.showValidationErrors(validation.errors);
        return;
      }
      UI.clearValidationErrors();

      if (UI.editingId) {
        DataStore.update(UI.editingId, data);
        UI.showToast('Lead updated successfully', 'success');
      } else {
        DataStore.create(data);
        UI.showToast('Lead created successfully', 'success');
      }

      UI.closeModal();
      this.refresh();
    },

    handleDelete(leadId) {
      if (UI.deleteTimers[leadId]) {
        clearTimeout(UI.deleteTimers[leadId]);
        delete UI.deleteTimers[leadId];
      }
      DataStore.delete(leadId);
      UI.showToast('Lead deleted', 'info');
      this.refresh();
    },

    debounce(fn, delay) {
      let timer;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    },

    initColumnResize() {
      const table = document.getElementById('leadsTable');
      if (!table) return;

      const ths = table.querySelectorAll('thead th');

      // Create resize handles
      ths.forEach(th => {
        const handle = document.createElement('div');
        handle.className = 'th-resize-handle';
        th.appendChild(handle);

        let startX, startWidth;

        const onMouseDown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          startX = e.pageX;
          startWidth = th.getBoundingClientRect().width;
          handle.classList.add('active');
          table.classList.add('resizing');

          const onMouseMove = (e) => {
            const diff = e.pageX - startX;
            const newWidth = Math.max(50, startWidth + diff);
            th.style.width = newWidth + 'px';
          };

          const onMouseUp = () => {
            handle.classList.remove('active');
            table.classList.remove('resizing');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
          };

          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        };

        handle.addEventListener('mousedown', onMouseDown);
      });
    },
  };

  // ============================================================
  // SEED DATA: 211 leads from LinkedIn Ads Dashboard
  // ============================================================
  const SeedData = {
    SEED_KEY: 'salesLeads_seeded',

    shouldSeed() {
      return !localStorage.getItem(this.SEED_KEY) && DataStore.getAll().length === 0;
    },

    markSeeded() {
      localStorage.setItem(this.SEED_KEY, 'true');
    },

    getRawLeads() {
      // Imported from LinkedIn Ads Dashboard (https://linkedin-ads-dashboard.vercel.app/leads)
      // Format: [name, email, phone, company, jobTitle, location]
      return LEADS_DATA;
    },

    seed() {
      if (!this.shouldSeed()) return;

      const statuses = ['New', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'];
      const salesTeam = ['Pranay Trivedi', 'Rohit Sharma', 'Sneha Kapoor', 'Arjun Patel', 'Meera Joshi', 'Vikram Das'];
      const sources = ['LinkedIn', 'Website', 'Referral', 'Cold Call', 'Social Media', 'Event'];
      const campaigns = [
        'LinkedIn - Power BI Feb 2026',
        'LinkedIn - Azure Certification Q1',
        'LinkedIn - Microsoft 365 Copilot',
        'LinkedIn - Cloud Solutions India',
        'LinkedIn - Data Analytics Bootcamp',
        'LinkedIn - SAP Training Drive',
        'LinkedIn - Cybersecurity Awareness',
        'LinkedIn - AI & ML Upskill',
      ];
      // Remarks mapped to disposition keywords for balanced Hot/Warm/Cold/Dead distribution
      const remarksHot = [
        'Interested in Microsoft Power BI certification, details shared',
        'Payment this week for Azure course enrollment',
        'Payment this month confirmed, processing PO',
        'Shared PO for data analytics training program',
        'Very keen, looking forward to starting the course next week',
        'Converted - payment done for Microsoft 365 Copilot training',
        'Enrolled and registered for cloud solutions bootcamp',
        'Payment next month after budget cycle, highly interested',
      ];
      const remarksWarm = [
        'Customer busy at the moment, will call back later',
        'Waiting for company approval from IT department',
        'Not answered multiple calls, will try again tomorrow',
        'Call back requested - was in a meeting',
        'Internal discussion ongoing with management about training budget',
        'Not answering calls, moved to callback bucket',
        'RPC not available, contact person unavailable this week',
        'Next batch same course - wants to join April batch',
        'Other agent callback requested for specialized course info',
      ];
      const remarksCold = [
        'Fee is high, looking for more affordable options',
        'Enrolled in other company for similar training',
        'Not interested - just exploring certification options',
        'Time constraint - cannot commit to full-time training',
        'Syllabus disinterest - looking for different domain',
        'New lead, did not have a conversation yet',
        'Looking for certification course only, not full program',
        'Effort exhaust - tried many times with no response',
        'Reason not shared for declining the offer',
        'Looking for job opportunities, not training',
      ];
      const remarksDead = [
        'DNC - requested do not call',
        'Not eligible - education qualification not met',
        'Language barrier - not comfortable in english',
        'Wrong number - invalid contact number',
        'Enquired by mistake, was looking for something else',
        'Did not enquire - accidental lead from ad click',
        'Ad was not clear about course details',
        'Not eligible - insufficient work experience',
      ];
      const allRemarks = [
        ...remarksHot, ...remarksHot,       // ~20% Hot
        ...remarksWarm, ...remarksWarm,      // ~22% Warm
        ...remarksCold, ...remarksCold, ...remarksCold, // ~37% Cold
        ...remarksDead,                      // ~10% Dead
        '', '', '', '', '', '', '', '', '', '',  // ~12% Remark Not Clear (Cold)
      ];

      const rawLeads = this.getRawLeads();
      const leads = [];
      const now = Date.now();

      for (let i = 0; i < rawLeads.length; i++) {
        const [name, email, phone, company, jobTitle, location] = rawLeads[i];
        if (!name) continue;

        const daysAgo = Math.floor(Math.random() * 90);
        const createdAt = new Date(now - daysAgo * 86400000).toISOString();
        const updatedDaysAgo = Math.floor(Math.random() * Math.min(daysAgo, 30));
        const updatedAt = new Date(now - updatedDaysAgo * 86400000).toISOString();

        // Distribute statuses: weight towards New/Contacted
        let status;
        const r = Math.random();
        if (r < 0.30) status = 'New';
        else if (r < 0.50) status = 'Contacted';
        else if (r < 0.65) status = 'Qualified';
        else if (r < 0.78) status = 'Proposal Sent';
        else if (r < 0.88) status = 'Negotiation';
        else if (r < 0.95) status = 'Won';
        else status = 'Lost';

        const priority = 'Medium';
        // Look up CSM from leadallocation emails, fallback to random sales team member
        const csmName = (typeof CSM_MAP !== 'undefined' && email) ? CSM_MAP[email.toLowerCase()] : null;
        const assignedTo = csmName || salesTeam[Math.floor(Math.random() * salesTeam.length)];
        const source = i < 180 ? 'LinkedIn' : sources[Math.floor(Math.random() * sources.length)];
        // Look up actual campaign from LinkedIn Ads Dashboard, fallback to random
        const campaignFromMap = (typeof CAMPAIGN_MAP !== 'undefined' && email) ? CAMPAIGN_MAP[email.toLowerCase()] : null;
        const campaign = campaignFromMap || campaigns[Math.floor(Math.random() * campaigns.length)];
        const remark = allRemarks[Math.floor(Math.random() * allRemarks.length)];

        const hex = Math.random().toString(16).substring(2, 6);
        leads.push({
          id: 'lead_' + (now - i * 1000) + '_' + hex,
          name,
          email: email || '',
          phone: phone || '',
          company: company || '',
          jobTitle: jobTitle || '',
          location: location || '',
          source,
          campaign,
          status,
          priority,
          assignedTo,
          currentRemark: remark || (jobTitle + (location ? ' | ' + location : '')),
          remarkHistory: [],
          createdAt,
          updatedAt,
        });
      }

      DataStore.saveAll(leads);
      this.markSeeded();
    },
  };

  // Bootstrap
  document.addEventListener('DOMContentLoaded', () => {
    SeedData.seed();
    App.init();
  });
})();
