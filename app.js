(function () {
  'use strict';

  // ============================================================
  // LinkedIn Profile URL Map (fetched from external API)
  // Maps email (lowercase) → LinkedIn profile URL
  // ============================================================
  var LinkedInProfiles = {
    map: {},  // email/name -> profileUrl
    loaded: false,

    fetch: function() {
      var self = this;
      // Load pre-fetched LinkedIn profile map from local JSON
      fetch('linkedin-profiles.json')
        .then(function(resp) { return resp.json(); })
        .then(function(data) {
          self.map = data;
          self.loaded = true;
          console.log('LinkedIn profiles loaded:', Object.keys(data).length, 'entries');
          // Re-render table to update LinkedIn links
          if (typeof App !== 'undefined' && App.refresh) {
            App.refresh();
          }
        })
        .catch(function(err) {
          console.warn('LinkedIn profiles fetch failed:', err);
          self.loaded = true;
        });
    },

    getUrl: function(email, name) {
      if (email) {
        var url = this.map[email.toLowerCase().trim()];
        if (url) return url;
      }
      if (name) {
        var url2 = this.map[name.toLowerCase().trim()];
        if (url2) return url2;
      }
      return null;
    }
  };

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
  // MODULE: Auth
  // Handles CSM login/logout and role-based data filtering
  // ============================================================
  const Auth = {
    SESSION_KEY: 'salesDashboard_session',

    // CSM credentials: username (lowercase first name) → { password, fullName, role }
    // Auto-generated from CSM_EMAIL_MAP keys
    getCredentials() {
      const creds = {
        admin: { password: 'admin123', fullName: 'Admin', role: 'admin', email: 'admin@koenig-solutions.com' },
        pranay: { password: 'pranay123', fullName: 'Pranay Trivedi', role: 'admin', email: 'pranay.trivedi@koenig-solutions.com' },
      };

      // Generate CSM credentials from CSM_EMAIL_MAP
      if (typeof CSM_EMAIL_MAP !== 'undefined') {
        for (const csmNameLower of Object.keys(CSM_EMAIL_MAP)) {
          const parts = csmNameLower.split(' ');
          const firstName = parts[0];
          const fullName = parts.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          const email = CSM_EMAIL_MAP[csmNameLower];
          if (!creds[firstName]) {
            creds[firstName] = { password: firstName + '123', fullName: fullName, role: 'csm', email: email };
          }
        }
      }

      // Also add CSMs who appear in seed data salesTeam
      const extraCSMs = ['Rohit Sharma', 'Sneha Kapoor', 'Arjun Patel', 'Meera Joshi', 'Vikram Das',
        'Shikha Mishra', 'Manish Chaturvedi', 'Gurpreet Kaur'];
      for (const name of extraCSMs) {
        const firstName = name.split(' ')[0].toLowerCase();
        if (!creds[firstName]) {
          creds[firstName] = { password: firstName + '123', fullName: name, role: 'csm', email: '' };
        }
      }

      return creds;
    },

    login(username, password) {
      const creds = this.getCredentials();
      const inputLower = username.toLowerCase().trim();

      // Try direct username match first
      let user = creds[inputLower];

      // If not found, try email-based login (CSM types their email as username)
      if (!user && inputLower.includes('@')) {
        for (const [key, cred] of Object.entries(creds)) {
          if ((cred.email || '').toLowerCase() === inputLower) {
            user = cred;
            break;
          }
        }
      }

      if (!user) return { success: false, error: 'Invalid username or email' };
      if (user.password !== password) return { success: false, error: 'Incorrect password' };

      const session = { username: inputLower, fullName: user.fullName, role: user.role, email: (user.email || '').toLowerCase() };
      localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
      return { success: true, session };
    },

    logout() {
      localStorage.removeItem(this.SESSION_KEY);
    },

    getSession() {
      try {
        const data = localStorage.getItem(this.SESSION_KEY);
        return data ? JSON.parse(data) : null;
      } catch {
        return null;
      }
    },

    isLoggedIn() {
      return this.getSession() !== null;
    },

    isAdmin() {
      const session = this.getSession();
      return session && session.role === 'admin';
    },

    // Build reverse lookup: CSM full name (lowercase) → email (lowercase)
    _csmNameToEmail: null,
    getCsmNameToEmail() {
      if (this._csmNameToEmail) return this._csmNameToEmail;
      this._csmNameToEmail = {};
      if (typeof CSM_EMAIL_MAP !== 'undefined') {
        for (const [nameLower, email] of Object.entries(CSM_EMAIL_MAP)) {
          // Store with title-cased name as key (matches assignedTo format)
          const titleName = nameLower.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          this._csmNameToEmail[titleName.toLowerCase()] = email.toLowerCase();
          // Also store the raw lowercase key
          this._csmNameToEmail[nameLower] = email.toLowerCase();
        }
      }
      return this._csmNameToEmail;
    },

    // Filter leads to only show those assigned to the current CSM (by email match)
    filterLeadsForUser(leads) {
      const session = this.getSession();
      if (!session) return leads;
      if (session.role === 'admin') return leads; // Admin sees all

      const sessionEmail = (session.email || '').toLowerCase();
      if (!sessionEmail) {
        // Fallback to name match if no email in session
        return leads.filter(lead =>
          (lead.assignedTo || '').toLowerCase() === session.fullName.toLowerCase()
        );
      }

      // CSM only sees leads where assignedTo CSM's email matches logged-in email
      const nameToEmail = this.getCsmNameToEmail();
      return leads.filter(lead => {
        const assignedName = (lead.assignedTo || '').toLowerCase();
        const assignedEmail = nameToEmail[assignedName] || '';
        return assignedEmail === sessionEmail;
      });
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
        summaryCards: document.getElementById('summaryCards'),
        metricTotal: document.getElementById('metricTotal'),
        metricHot: document.getElementById('metricHot'),
        metricWarm: document.getElementById('metricWarm'),
        metricCold: document.getElementById('metricCold'),
        metricDead: document.getElementById('metricDead'),
        searchInput: document.getElementById('searchInput'),
        filterLeadTemp: document.getElementById('filterLeadTemp'),
        filterCampaign: document.getElementById('filterCampaign'),
        filterDatePreset: document.getElementById('filterDatePreset'),
        dateCustomRange: document.getElementById('dateCustomRange'),
        filterDateFrom: document.getElementById('filterDateFrom'),
        filterDateTo: document.getElementById('filterDateTo'),
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
        // Connected/Not Connected in Total card
        metricConnected: document.getElementById('metricConnected'),
        metricNotConnected: document.getElementById('metricNotConnected'),
        metricConnectedPct: document.getElementById('metricConnectedPct'),
        metricNotConnectedPct: document.getElementById('metricNotConnectedPct'),
        // Donut chart elements
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
        // Pagination & export
        rowCount: document.getElementById('rowCount'),
        btnPrevPage: document.getElementById('btnPrevPage'),
        btnNextPage: document.getElementById('btnNextPage'),
        pageInfo: document.getElementById('pageInfo'),
        pageSize: document.getElementById('pageSize'),
        btnExportCSV: document.getElementById('btnExportCSV'),
        headerUserInfo: document.getElementById('headerUserInfo'),
        // Analytics widgets
        csmLeaderboard: document.getElementById('csmLeaderboard'),
        dispositionBars: document.getElementById('dispositionBars'),
        locationList: document.getElementById('locationList'),
        companyList: document.getElementById('companyList'),
        seniorityList: document.getElementById('seniorityList'),
        industryList: document.getElementById('industryList'),
        companySizeList: document.getElementById('companySizeList'),
        jobFunctionList: document.getElementById('jobFunctionList'),
        // Insight fields in edit modal
        formInsights: document.getElementById('formInsights'),
        insightCompany: document.getElementById('insightCompany'),
        insightCompanySize: document.getElementById('insightCompanySize'),
        insightIndustry: document.getElementById('insightIndustry'),
        insightLocation: document.getElementById('insightLocation'),
        insightSeniority: document.getElementById('insightSeniority'),
        insightFunction: document.getElementById('insightFunction'),
        insightSecondaryEmail: document.getElementById('insightSecondaryEmail'),
      };
    },

    renderPipeline(leadsData) {
      const leads = leadsData || DataStore.getAll();
      const tempCounts = { Hot: 0, Warm: 0, Cold: 0, Dead: 0 };

      for (const lead of leads) {
        const c = Disposition.classify(lead.currentRemark);
        if (tempCounts[c.leadTemp] !== undefined) {
          tempCounts[c.leadTemp]++;
        }
      }

      const total = leads.length;
      const notConnected = tempCounts.Dead;
      const connected = total - notConnected;
      const pctOf = (n, base) => base > 0 ? ((n / base) * 100).toFixed(1) : '0.0';

      // Update donut chart center
      this.elements.chartCenterCount.textContent = total;

      // Update legend counts
      this.elements.legendHot.textContent = tempCounts.Hot;
      this.elements.legendWarm.textContent = tempCounts.Warm;
      this.elements.legendCold.textContent = tempCounts.Cold;
      this.elements.legendDead.textContent = tempCounts.Dead;

      // % of total leads
      this.elements.legendHotPct.textContent = pctOf(tempCounts.Hot, total) + '%';
      this.elements.legendWarmPct.textContent = pctOf(tempCounts.Warm, total) + '%';
      this.elements.legendColdPct.textContent = pctOf(tempCounts.Cold, total) + '%';
      this.elements.legendDeadPct.textContent = pctOf(tempCounts.Dead, total) + '%';

      // Set progress bar widths
      this.elements.legendBarHot.style.width = pctOf(tempCounts.Hot, total) + '%';
      this.elements.legendBarWarm.style.width = pctOf(tempCounts.Warm, total) + '%';
      this.elements.legendBarCold.style.width = pctOf(tempCounts.Cold, total) + '%';
      this.elements.legendBarDead.style.width = pctOf(tempCounts.Dead, total) + '%';

      // Draw the donut chart
      this.drawDonutChart(tempCounts, total);
    },

    drawDonutChart(counts, total) {
      const canvas = this.elements.statusChart;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const size = canvas.width;
      const cx = size / 2;
      const cy = size / 2;
      const outerR = size / 2 - 4;
      const innerR = outerR * 0.62;

      ctx.clearRect(0, 0, size, size);

      const segments = [
        { key: 'Hot', color: '#ff4757', glow: 'rgba(255, 71, 87, 0.6)' },
        { key: 'Warm', color: '#ffa502', glow: 'rgba(255, 165, 2, 0.6)' },
        { key: 'Cold', color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.6)' },
        { key: 'Dead', color: '#8b95a5', glow: 'rgba(139, 149, 165, 0.35)' },
      ];

      if (total === 0) {
        // Draw empty ring
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
        ctx.arc(cx, cy, innerR, Math.PI * 2, 0, true);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.fill();
        return;
      }

      let startAngle = -Math.PI / 2;
      const gap = 0.03; // small gap between segments

      for (const seg of segments) {
        const val = counts[seg.key] || 0;
        if (val === 0) continue;
        const sweep = (val / total) * Math.PI * 2 - gap;
        if (sweep <= 0) continue;

        // Glow effect
        ctx.save();
        ctx.shadowColor = seg.glow;
        ctx.shadowBlur = 18;

        ctx.beginPath();
        ctx.arc(cx, cy, outerR, startAngle, startAngle + sweep);
        ctx.arc(cx, cy, innerR, startAngle + sweep, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = seg.color;
        ctx.fill();
        ctx.restore();

        startAngle += sweep + gap;
      }
    },

    renderAnalytics(leadsData) {
      const leads = leadsData || DataStore.getAll();
      const total = leads.length;
      if (total === 0) return;

      // ── 1. Company Size ──
      const sizeOrder = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10000+'];
      // Map known companies to approximate sizes
      const knownSizes = {
        'deloitte': '10000+', 'tata consultancy services': '10000+',
        'infosys': '10000+', 'wipro': '10000+', 'hcltech': '10000+',
        'cognizant': '10000+', 'accenture': '10000+', 'ibm': '10000+',
        'microsoft': '10000+', 'google': '10000+', 'amazon': '10000+',
        'capgemini': '10000+', 'tech mahindra': '10000+',
        'genpact': '10000+', 'mindtree': '5001-10000',
        'l&t infotech': '10000+', 'mphasis': '5001-10000',
        'hexaware': '5001-10000', 'niit': '1001-5000',
        'cyient': '5001-10000', 'persistent systems': '5001-10000',
        'zensar': '1001-5000', 'sonata software': '1001-5000',
        'birlasoft': '1001-5000', 'ltimindtree': '10000+',
        'reliance': '10000+', 'airtel': '10000+',
        'bajaj': '10000+', 'hdfc': '10000+',
        'eaton': '10000+', 'adani': '10000+',
        'tata': '10000+', 'mahindra': '10000+',
        'larsen': '10000+', 'siemens': '10000+',
        'bosch': '10000+', 'honeywell': '10000+',
      };

      const sizeCounts = {};
      for (const lead of leads) {
        const comp = (lead.company || '').toLowerCase().trim();
        let size = 'Unknown';
        for (const [key, sizeLabel] of Object.entries(knownSizes)) {
          if (comp.includes(key)) { size = sizeLabel; break; }
        }
        if (size === 'Unknown' && comp) {
          // Estimate by company name heuristics
          if (comp.includes('inc') || comp.includes('ltd') || comp.includes('limited') || comp.includes('corp') || comp.includes('group')) {
            size = '201-500';
          } else if (comp.includes('solutions') || comp.includes('technologies') || comp.includes('services') || comp.includes('systems')) {
            size = '51-200';
          } else {
            size = '51-200';
          }
        }
        if (size !== 'Unknown') {
          sizeCounts[size] = (sizeCounts[size] || 0) + 1;
        }
      }

      // Sort by count descending
      const sizeSorted = sizeOrder
        .filter(s => sizeCounts[s])
        .map(s => [s, sizeCounts[s]])
        .sort((a, b) => b[1] - a[1]);
      const maxSize = sizeSorted.length > 0 ? Math.max(...sizeSorted.map(s => s[1])) : 1;

      const sizeContainer = this.elements.companySizeList;
      sizeContainer.innerHTML = '';
      for (const [name, count] of sizeSorted) {
        const item = document.createElement('div');
        item.className = 'csize-item';

        const nameEl = document.createElement('span');
        nameEl.className = 'csize-item__name';
        nameEl.textContent = name;
        item.appendChild(nameEl);

        const countWrap = document.createElement('div');
        countWrap.className = 'csize-item__count';
        const spark = document.createElement('div');
        spark.className = 'csize-item__spark';
        const sparkFill = document.createElement('div');
        sparkFill.className = 'csize-item__spark-fill';
        sparkFill.style.width = ((count / maxSize) * 100) + '%';
        spark.appendChild(sparkFill);
        countWrap.appendChild(spark);
        const badge = document.createElement('span');
        badge.className = 'csize-item__badge';
        badge.textContent = count;
        countWrap.appendChild(badge);
        const pctEl = document.createElement('span');
        pctEl.className = 'item__pct';
        pctEl.textContent = ((count / total) * 100).toFixed(1) + '%';
        countWrap.appendChild(pctEl);
        item.appendChild(countWrap);

        sizeContainer.appendChild(item);
      }

      // ── 2. Top CSM Assignments ──
      const csmCounts = {};
      for (const lead of leads) {
        const csm = lead.assignedTo || 'Unassigned';
        csmCounts[csm] = (csmCounts[csm] || 0) + 1;
      }
      const csmSorted = Object.entries(csmCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
      const maxCSM = csmSorted.length > 0 ? csmSorted[0][1] : 1;

      const csmContainer = this.elements.csmLeaderboard;
      csmContainer.innerHTML = '';
      for (let i = 0; i < csmSorted.length; i++) {
        const [name, count] = csmSorted[i];
        const item = document.createElement('div');
        item.className = 'csm-item';

        const rank = document.createElement('span');
        rank.className = 'csm-item__rank';
        rank.textContent = i + 1;
        item.appendChild(rank);

        const info = document.createElement('div');
        info.className = 'csm-item__info';
        const nameEl = document.createElement('span');
        nameEl.className = 'csm-item__name';
        nameEl.textContent = name;
        info.appendChild(nameEl);
        const barWrap = document.createElement('div');
        barWrap.className = 'csm-item__bar-wrap';
        const bar = document.createElement('div');
        bar.className = 'csm-item__bar';
        bar.style.width = ((count / maxCSM) * 100) + '%';
        barWrap.appendChild(bar);
        info.appendChild(barWrap);
        item.appendChild(info);

        const countEl = document.createElement('span');
        countEl.className = 'csm-item__count';
        countEl.textContent = count;
        item.appendChild(countEl);

        const pctEl = document.createElement('span');
        pctEl.className = 'item__pct';
        pctEl.textContent = ((count / total) * 100).toFixed(1) + '%';
        item.appendChild(pctEl);

        csmContainer.appendChild(item);
      }

      // ── 3. Disposition Breakdown ──
      const dispCounts = {};
      const dispColors = {
        'Prospect': '#ef4444',
        'Converted': '#10b981',
        'Follow up': '#f59e0b',
        'Call Back': '#fbbf24',
        'Other Agent Callback': '#f59e0b',
        'Other Agent FollowUp': '#fbbf24',
        'Next Batch': '#06b6d4',
        'Fallout': '#3b82f6',
        'New Lead': '#818cf8',
        'Not interested': '#94a3b8',
        'DNC': '#ef4444',
        'Not Eligible': '#6b7280',
        'Wrong Number': '#6b7280',
        'Not Enquired': '#6b7280',
        'Remark Not Clear': '#64748b',
      };

      for (const lead of leads) {
        const c = Disposition.classify(lead.currentRemark);
        dispCounts[c.disposition] = (dispCounts[c.disposition] || 0) + 1;
      }
      const dispSorted = Object.entries(dispCounts)
        .sort((a, b) => b[1] - a[1]);
      const maxDisp = dispSorted.length > 0 ? dispSorted[0][1] : 1;

      const dispContainer = this.elements.dispositionBars;
      dispContainer.innerHTML = '';
      for (const [name, count] of dispSorted) {
        const item = document.createElement('div');
        item.className = 'disp-item';

        const nameEl = document.createElement('span');
        nameEl.className = 'disp-item__name';
        nameEl.textContent = name;
        item.appendChild(nameEl);

        const barWrap = document.createElement('div');
        barWrap.className = 'disp-item__bar-wrap';
        const bar = document.createElement('div');
        bar.className = 'disp-item__bar';
        bar.style.width = ((count / maxDisp) * 100) + '%';
        bar.style.background = dispColors[name] || '#818cf8';
        barWrap.appendChild(bar);
        item.appendChild(barWrap);

        const countEl = document.createElement('span');
        countEl.className = 'disp-item__count';
        countEl.textContent = count;
        item.appendChild(countEl);

        const pctEl = document.createElement('span');
        pctEl.className = 'item__pct';
        pctEl.textContent = ((count / total) * 100).toFixed(1) + '%';
        item.appendChild(pctEl);

        dispContainer.appendChild(item);
      }

      // ── 4. Top Locations ──
      const locCounts = {};
      for (const lead of leads) {
        const loc = lead.location || 'Unknown';
        if (loc && loc !== '-') {
          locCounts[loc] = (locCounts[loc] || 0) + 1;
        }
      }
      const locSorted = Object.entries(locCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      const maxLoc = locSorted.length > 0 ? locSorted[0][1] : 1;

      const locContainer = this.elements.locationList;
      locContainer.innerHTML = '';
      for (const [name, count] of locSorted) {
        const item = document.createElement('div');
        item.className = 'loc-item';

        const nameEl = document.createElement('span');
        nameEl.className = 'loc-item__name';
        nameEl.textContent = name;
        nameEl.title = name;
        item.appendChild(nameEl);

        const countWrap = document.createElement('div');
        countWrap.className = 'loc-item__count';
        const spark = document.createElement('div');
        spark.className = 'loc-item__spark';
        const sparkFill = document.createElement('div');
        sparkFill.className = 'loc-item__spark-fill';
        sparkFill.style.width = ((count / maxLoc) * 100) + '%';
        spark.appendChild(sparkFill);
        countWrap.appendChild(spark);
        const badge = document.createElement('span');
        badge.className = 'loc-item__badge';
        badge.textContent = count;
        countWrap.appendChild(badge);
        const pctEl = document.createElement('span');
        pctEl.className = 'item__pct';
        pctEl.textContent = ((count / total) * 100).toFixed(1) + '%';
        countWrap.appendChild(pctEl);
        item.appendChild(countWrap);

        locContainer.appendChild(item);
      }

      // ── 5. Top Companies ──
      const compCounts = {};
      for (const lead of leads) {
        const comp = lead.company || 'Unknown';
        if (comp && comp !== '-') {
          compCounts[comp] = (compCounts[comp] || 0) + 1;
        }
      }
      const compSorted = Object.entries(compCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      const maxComp = compSorted.length > 0 ? compSorted[0][1] : 1;

      const compContainer = this.elements.companyList;
      compContainer.innerHTML = '';
      for (const [name, count] of compSorted) {
        const item = document.createElement('div');
        item.className = 'comp-item';

        const nameEl = document.createElement('span');
        nameEl.className = 'comp-item__name';
        nameEl.textContent = name;
        nameEl.title = name;
        item.appendChild(nameEl);

        const countWrap = document.createElement('div');
        countWrap.className = 'comp-item__count';
        const spark = document.createElement('div');
        spark.className = 'comp-item__spark';
        const sparkFill = document.createElement('div');
        sparkFill.className = 'comp-item__spark-fill';
        sparkFill.style.width = ((count / maxComp) * 100) + '%';
        spark.appendChild(sparkFill);
        countWrap.appendChild(spark);
        const badge = document.createElement('span');
        badge.className = 'comp-item__badge';
        badge.textContent = count;
        countWrap.appendChild(badge);
        const pctEl = document.createElement('span');
        pctEl.className = 'item__pct';
        pctEl.textContent = ((count / total) * 100).toFixed(1) + '%';
        countWrap.appendChild(pctEl);
        item.appendChild(countWrap);

        compContainer.appendChild(item);
      }

      // ── 6. Job Seniority ──
      const seniorityMap = {
        'C-Suite': ['ceo', 'cto', 'cfo', 'coo', 'cio', 'cmo', 'chief', 'founder', 'co-founder', 'cofounder', 'owner', 'president'],
        'VP / Director': ['vice president', 'vp ', 'director', 'head of', 'head -'],
        'Senior Manager': ['senior manager', 'sr. manager', 'sr manager', 'senior mgr', 'general manager', 'gm '],
        'Manager': ['manager', 'mgr', 'team lead', 'team leader', 'supervisor'],
        'Senior IC': ['senior', 'sr.', 'sr ', 'lead ', 'principal', 'staff ', 'architect'],
        'Mid-Level': ['specialist', 'analyst', 'consultant', 'engineer', 'developer', 'designer', 'administrator', 'coordinator'],
        'Junior / Entry': ['associate', 'assistant', 'junior', 'jr.', 'jr ', 'intern', 'trainee', 'fresher', 'executive'],
      };

      const senCounts = {};
      for (const lead of leads) {
        const title = (lead.jobTitle || '').toLowerCase();
        let matched = false;
        for (const [level, keywords] of Object.entries(seniorityMap)) {
          for (const kw of keywords) {
            if (title.includes(kw)) {
              senCounts[level] = (senCounts[level] || 0) + 1;
              matched = true;
              break;
            }
          }
          if (matched) break;
        }
        if (!matched && lead.jobTitle) {
          senCounts['Other'] = (senCounts['Other'] || 0) + 1;
        }
      }

      const senSorted = Object.entries(senCounts).sort((a, b) => b[1] - a[1]);
      const maxSen = senSorted.length > 0 ? senSorted[0][1] : 1;

      const senContainer = this.elements.seniorityList;
      senContainer.innerHTML = '';
      for (const [name, count] of senSorted) {
        const item = document.createElement('div');
        item.className = 'sen-item';

        const nameEl = document.createElement('span');
        nameEl.className = 'sen-item__name';
        nameEl.textContent = name;
        item.appendChild(nameEl);

        const countWrap = document.createElement('div');
        countWrap.className = 'sen-item__count';
        const spark = document.createElement('div');
        spark.className = 'sen-item__spark';
        const sparkFill = document.createElement('div');
        sparkFill.className = 'sen-item__spark-fill';
        sparkFill.style.width = ((count / maxSen) * 100) + '%';
        spark.appendChild(sparkFill);
        countWrap.appendChild(spark);
        const badge = document.createElement('span');
        badge.className = 'sen-item__badge';
        badge.textContent = count;
        countWrap.appendChild(badge);
        const pctEl = document.createElement('span');
        pctEl.className = 'item__pct';
        pctEl.textContent = ((count / total) * 100).toFixed(1) + '%';
        countWrap.appendChild(pctEl);
        item.appendChild(countWrap);

        senContainer.appendChild(item);
      }

      // ── 7. Industry ──
      const industryMap = {
        'IT / Technology': ['technology', 'software', 'tech', 'it ', 'it services', 'information technology', 'saas', 'cloud', 'digital', 'computer', 'internet', 'ai ', 'artificial intelligence', 'data', 'cyber'],
        'Consulting': ['consult', 'advisory', 'deloitte', 'accenture', 'kpmg', 'pwc', 'ernst', 'mckinsey', 'bain', 'bcg'],
        'Financial Services': ['banking', 'bank', 'finance', 'financial', 'insurance', 'fintech', 'payment', 'capital', 'investment'],
        'Telecom': ['telecom', 'telecommunication', 'airtel', 'jio', 'vodafone', 'bharti'],
        'Manufacturing': ['manufacturing', 'industrial', 'automotive', 'auto', 'steel', 'metal', 'chemical', 'pharma', 'pharmaceutical'],
        'Healthcare': ['health', 'hospital', 'medical', 'pharma', 'biotech', 'life science', 'wellness'],
        'Retail / E-commerce': ['retail', 'ecommerce', 'e-commerce', 'shopping', 'consumer', 'fmcg', 'flipkart', 'amazon'],
        'Education': ['education', 'university', 'college', 'school', 'training', 'learning', 'edtech', 'academ'],
        'Energy / Utilities': ['energy', 'oil', 'gas', 'power', 'utility', 'renewable', 'solar', 'wind'],
        'Government / PSU': ['government', 'govt', 'public sector', 'psu', 'defense', 'defence', 'municipal'],
      };

      const indCounts = {};
      for (const lead of leads) {
        const comp = (lead.company || '').toLowerCase();
        let matched = false;
        for (const [industry, keywords] of Object.entries(industryMap)) {
          for (const kw of keywords) {
            if (comp.includes(kw)) {
              indCounts[industry] = (indCounts[industry] || 0) + 1;
              matched = true;
              break;
            }
          }
          if (matched) break;
        }
        if (!matched && lead.company) {
          indCounts['Other'] = (indCounts['Other'] || 0) + 1;
        }
      }

      const indSorted = Object.entries(indCounts).sort((a, b) => b[1] - a[1]);
      const maxInd = indSorted.length > 0 ? indSorted[0][1] : 1;

      const indContainer = this.elements.industryList;
      indContainer.innerHTML = '';
      for (const [name, count] of indSorted) {
        const item = document.createElement('div');
        item.className = 'ind-item';

        const nameEl = document.createElement('span');
        nameEl.className = 'ind-item__name';
        nameEl.textContent = name;
        item.appendChild(nameEl);

        const countWrap = document.createElement('div');
        countWrap.className = 'ind-item__count';
        const spark = document.createElement('div');
        spark.className = 'ind-item__spark';
        const sparkFill = document.createElement('div');
        sparkFill.className = 'ind-item__spark-fill';
        sparkFill.style.width = ((count / maxInd) * 100) + '%';
        spark.appendChild(sparkFill);
        countWrap.appendChild(spark);
        const badge = document.createElement('span');
        badge.className = 'ind-item__badge';
        badge.textContent = count;
        countWrap.appendChild(badge);
        const pctEl = document.createElement('span');
        pctEl.className = 'item__pct';
        pctEl.textContent = ((count / total) * 100).toFixed(1) + '%';
        countWrap.appendChild(pctEl);
        item.appendChild(countWrap);

        indContainer.appendChild(item);
      }

      // ── 8. Job Function ──
      const functionMap = {
        'Engineering': ['engineer', 'developer', 'software', 'devops', 'sre', 'qa ', 'tester', 'testing', 'full stack', 'frontend', 'backend', 'programmer', 'coding', 'technical lead'],
        'Sales': ['sales', 'business development', 'account executive', 'account manager', 'bdm', 'bde', 'revenue'],
        'Marketing': ['marketing', 'brand', 'content', 'seo', 'digital marketing', 'growth', 'social media', 'campaign', 'communications'],
        'Operations': ['operations', 'ops ', 'supply chain', 'logistics', 'procurement', 'process'],
        'Finance': ['finance', 'accounting', 'cfo', 'financial', 'controller', 'treasury', 'audit'],
        'Human Resources': ['hr ', 'human resource', 'talent', 'recruitment', 'recruiter', 'people', 'hrbp', 'l&d', 'learning & development'],
        'Product': ['product manager', 'product owner', 'product lead', 'product head', 'product director'],
        'Data & Analytics': ['data ', 'analytics', 'data science', 'data engineer', 'bi ', 'business intelligence', 'machine learning', 'ml ', 'ai '],
        'Design': ['design', 'ux', 'ui ', 'creative', 'graphic'],
        'IT / Infrastructure': ['it manager', 'it director', 'infrastructure', 'network', 'system admin', 'sysadmin', 'cloud', 'security', 'information security', 'ciso', 'cio'],
        'Consulting': ['consultant', 'advisor', 'advisory', 'consulting'],
        'Management': ['general manager', 'president', 'ceo', 'coo', 'founder', 'co-founder', 'managing director', 'chief'],
      };

      const funcCounts = {};
      for (const lead of leads) {
        const title = (lead.jobTitle || '').toLowerCase();
        let matched = false;
        for (const [func, keywords] of Object.entries(functionMap)) {
          for (const kw of keywords) {
            if (title.includes(kw)) {
              funcCounts[func] = (funcCounts[func] || 0) + 1;
              matched = true;
              break;
            }
          }
          if (matched) break;
        }
        if (!matched && lead.jobTitle) {
          funcCounts['Other'] = (funcCounts['Other'] || 0) + 1;
        }
      }

      const funcSorted = Object.entries(funcCounts).sort((a, b) => b[1] - a[1]);
      const maxFunc = funcSorted.length > 0 ? funcSorted[0][1] : 1;

      const funcContainer = this.elements.jobFunctionList;
      funcContainer.innerHTML = '';
      for (const [name, count] of funcSorted) {
        const item = document.createElement('div');
        item.className = 'func-item';

        const nameEl = document.createElement('span');
        nameEl.className = 'func-item__name';
        nameEl.textContent = name;
        item.appendChild(nameEl);

        const countWrap = document.createElement('div');
        countWrap.className = 'func-item__count';
        const spark = document.createElement('div');
        spark.className = 'func-item__spark';
        const sparkFill = document.createElement('div');
        sparkFill.className = 'func-item__spark-fill';
        sparkFill.style.width = ((count / maxFunc) * 100) + '%';
        spark.appendChild(sparkFill);
        countWrap.appendChild(spark);
        const badge = document.createElement('span');
        badge.className = 'func-item__badge';
        badge.textContent = count;
        countWrap.appendChild(badge);
        const pctEl = document.createElement('span');
        pctEl.className = 'item__pct';
        pctEl.textContent = ((count / total) * 100).toFixed(1) + '%';
        countWrap.appendChild(pctEl);
        item.appendChild(countWrap);

        funcContainer.appendChild(item);
      }
    },

    renderSummaryCards(leadsData) {
      const leads = leadsData || DataStore.getAll();
      const tempCounts = { Hot: 0, Warm: 0, Cold: 0, Dead: 0 };
      for (const lead of leads) {
        const c = Disposition.classify(lead.currentRemark);
        if (tempCounts[c.leadTemp] !== undefined) {
          tempCounts[c.leadTemp]++;
        }
      }
      const total = leads.length;
      const connected = total - tempCounts.Dead;
      const pctConn = (n) => connected > 0 ? ((n / connected) * 100).toFixed(1) : '0.0';
      const pctTotal = (n) => total > 0 ? ((n / total) * 100).toFixed(1) : '0.0';
      this.elements.metricTotal.textContent = total;
      // Connected / Not Connected inside Total card
      this.elements.metricConnected.textContent = connected;
      this.elements.metricNotConnected.textContent = tempCounts.Dead;
      this.elements.metricConnectedPct.textContent = connected + ' of ' + total + ' (' + pctTotal(connected) + '%)';
      this.elements.metricNotConnectedPct.textContent = tempCounts.Dead + ' of ' + total + ' (' + pctTotal(tempCounts.Dead) + '%)';
      // Status cards — show both % of total and % of connected as highlighted badges
      this.elements.metricHot.innerHTML = tempCounts.Hot;
      this.elements.metricWarm.innerHTML = tempCounts.Warm;
      this.elements.metricCold.innerHTML = tempCounts.Cold;
      this.elements.metricDead.innerHTML = tempCounts.Dead;
      this.elements.metricHotSub.innerHTML = '<span class="card__badge card__badge--total">' + tempCounts.Hot + ' of ' + total + ' total (' + pctTotal(tempCounts.Hot) + '%)</span><span class="card__badge card__badge--conn">' + tempCounts.Hot + ' of ' + connected + ' connected (' + pctConn(tempCounts.Hot) + '%)</span>';
      this.elements.metricWarmSub.innerHTML = '<span class="card__badge card__badge--total">' + tempCounts.Warm + ' of ' + total + ' total (' + pctTotal(tempCounts.Warm) + '%)</span><span class="card__badge card__badge--conn">' + tempCounts.Warm + ' of ' + connected + ' connected (' + pctConn(tempCounts.Warm) + '%)</span>';
      this.elements.metricColdSub.innerHTML = '<span class="card__badge card__badge--total">' + tempCounts.Cold + ' of ' + total + ' total (' + pctTotal(tempCounts.Cold) + '%)</span><span class="card__badge card__badge--conn">' + tempCounts.Cold + ' of ' + connected + ' connected (' + pctConn(tempCounts.Cold) + '%)</span>';
      this.elements.metricDeadSub.innerHTML = '<span class="card__badge card__badge--total">' + tempCounts.Dead + ' of ' + total + ' total (' + pctTotal(tempCounts.Dead) + '%)</span>';
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

      // 1. Name (with LinkedIn profile link) — STICKY
      const tdName = document.createElement('td');
      tdName.className = 'col-sticky col-sticky-0';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'lead-name';
      nameSpan.textContent = lead.name;
      tdName.appendChild(nameSpan);
      // LinkedIn profile link — only show if real profile URL exists
      if (lead.name) {
        const profileUrl = lead.linkedinUrl || LinkedInProfiles.getUrl(lead.email, lead.name);
        if (profileUrl) {
          const linkedInLink = document.createElement('a');
          linkedInLink.className = 'lead-linkedin';
          linkedInLink.href = profileUrl;
          linkedInLink.target = '_blank';
          linkedInLink.rel = 'noopener noreferrer';
          linkedInLink.innerHTML = '<svg class="lead-linkedin__icon" viewBox="0 0 24 24" width="15" height="15"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg> LinkedIn';
          tdName.appendChild(linkedInLink);
        }
      }
      tr.appendChild(tdName);

      // 2. Contact (email + phone combined) — STICKY
      const tdContact = document.createElement('td');
      tdContact.className = 'col-sticky col-sticky-1';
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

      // 4b. Seniority (derived from Job Title)
      const tdSeniority = document.createElement('td');
      tdSeniority.className = 'col-hide-tablet';
      const senLevel = Seniority.classify(lead.jobTitle);
      if (senLevel && senLevel !== '-') {
        const senBadge = document.createElement('span');
        senBadge.className = 'badge badge--seniority badge--sen-' + Seniority.getClass(senLevel);
        senBadge.textContent = senLevel;
        tdSeniority.appendChild(senBadge);
      } else {
        tdSeniority.textContent = '-';
      }
      tr.appendChild(tdSeniority);

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

      // Disposition classification
      const classification = Disposition.classify(lead.currentRemark);

      // 9. Disposition
      const tdDisposition = document.createElement('td');
      const dispBadge = document.createElement('span');
      dispBadge.className = 'badge badge--disposition badge--disp-' + Disposition.getDispositionClass(classification.disposition);
      dispBadge.textContent = classification.disposition;
      tdDisposition.appendChild(dispBadge);
      tr.appendChild(tdDisposition);

      // 10. Sub-Disposition
      const tdSubDisp = document.createElement('td');
      const subDispSpan = document.createElement('span');
      subDispSpan.className = 'badge badge--sub-disposition';
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
      this.elements.btnSave.textContent = 'Save Lead';
      this.elements.leadForm.reset();
      this.elements.fieldSource.value = 'LinkedIn';
      this.elements.remarkHistory.style.display = 'none';
      this.elements.formInsights.style.display = 'none';
      this.clearValidationErrors();
      this.updateAutoClassification('');

      // All fields editable for new lead
      this.setFieldsReadonly(false);

      this.elements.modalBackdrop.classList.add('active');
      this.elements.fieldName.focus();
    },

    openEditModal(leadId) {
      const lead = DataStore.getById(leadId);
      if (!lead) return;

      this.editingId = leadId;
      this.elements.modalTitle.textContent = 'Edit Lead';
      this.elements.btnSave.textContent = 'Save Remark';
      this.clearValidationErrors();

      // Fill form fields
      this.elements.fieldName.value = lead.name;
      this.elements.fieldEmail.value = lead.email;
      this.elements.fieldPhone.value = lead.phone;
      this.elements.fieldCompany.value = lead.company;
      this.elements.fieldSource.value = lead.source;
      this.elements.fieldAssignedTo.value = lead.assignedTo;
      this.elements.fieldRemark.value = lead.currentRemark;

      // Lock all fields except Remark in edit mode
      this.setFieldsReadonly(true);

      // Populate derived insight fields
      this.populateInsights(lead);

      // Update auto-classification based on current remark
      this.updateAutoClassification(lead.currentRemark);

      // Render remark history
      this.renderRemarkHistory(lead.remarkHistory, lead.currentRemark);

      // Load WhatsApp conversation if available
      if (typeof WhatsAppChat !== 'undefined' && lead.phone) {
        WhatsAppChat.loadConversation(lead.id, lead.phone);
      }

      this.elements.modalBackdrop.classList.add('active');
      this.elements.fieldRemark.focus();
    },

    populateInsights(lead) {
      // Show the insights section
      this.elements.formInsights.style.display = '';

      // Company (direct)
      this.elements.insightCompany.textContent = lead.company || '-';

      // Company Size (derived from company name)
      this.elements.insightCompanySize.textContent = CompanySize.classify(lead.company);

      // Industry (derived from company name)
      this.elements.insightIndustry.textContent = Industry.classify(lead.company);

      // Location (direct)
      this.elements.insightLocation.textContent = lead.location || '-';

      // Seniority (derived from job title)
      const senLevel = Seniority.classify(lead.jobTitle);
      this.elements.insightSeniority.textContent = senLevel;
      // Apply seniority badge color
      this.elements.insightSeniority.className = 'form__insight-value';
      if (senLevel && senLevel !== '-') {
        this.elements.insightSeniority.classList.add('form__insight-value--sen-' + Seniority.getClass(senLevel));
      }

      // Job Function (derived from job title)
      this.elements.insightFunction.textContent = JobFunction.classify(lead.jobTitle);

      // Secondary Email — check if lead has a secondary email (from API data)
      const secEmail = lead.secondaryEmail || lead.email2 || '';
      this.elements.insightSecondaryEmail.textContent = secEmail || '-';
    },

    closeModal() {
      this.elements.modalBackdrop.classList.remove('active');
      this.editingId = null;
      this.elements.leadForm.reset();
      this.clearValidationErrors();
      // Reset all fields back to editable
      this.setFieldsReadonly(false);
      // Hide insights section
      this.elements.formInsights.style.display = 'none';
      // Reset button text
      this.elements.btnSave.textContent = 'Save Lead';
      // Hide WhatsApp chat
      if (typeof WhatsAppChat !== 'undefined') WhatsAppChat.hide();
    },

    setFieldsReadonly(locked) {
      const fixedFields = [
        this.elements.fieldName,
        this.elements.fieldEmail,
        this.elements.fieldPhone,
        this.elements.fieldCompany,
        this.elements.fieldSource,
        this.elements.fieldAssignedTo,
      ];
      fixedFields.forEach(function(field) {
        field.readOnly = locked;
        if (locked) {
          field.style.background = 'var(--color-surface-elevated)';
          field.style.cursor = 'default';
          field.style.opacity = '0.7';
        } else {
          // Reset to default (except Source which is always readonly)
          if (field.id === 'fieldSource') {
            field.readOnly = true;
            field.style.background = 'var(--color-surface-elevated)';
            field.style.cursor = 'default';
            field.style.opacity = '0.7';
          } else {
            field.style.background = '';
            field.style.cursor = '';
            field.style.opacity = '';
          }
        }
      });
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
      datePreset: 'all',
      dateFrom: '',
      dateTo: '',
      currentPage: 1,
      pageSize: 50,
      columnFilters: {},  // { name: '', company: '', etc. }
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
      result = this.filterByColumn(result);
      result = this.sort(result, 'createdAt', 'desc');
      return result;
    },

    filterBySearch(leads, query) {
      if (!query.trim()) return leads;
      const q = query.toLowerCase().trim();
      return leads.filter(lead =>
        (lead.name || '').toLowerCase().includes(q) ||
        (lead.email || '').toLowerCase().includes(q) ||
        (lead.phone || '').toLowerCase().includes(q) ||
        (lead.company || '').toLowerCase().includes(q) ||
        (lead.jobTitle || '').toLowerCase().includes(q) ||
        (lead.location || '').toLowerCase().includes(q) ||
        (lead.assignedTo || '').toLowerCase().includes(q) ||
        (lead.campaign || '').toLowerCase().includes(q) ||
        (lead.currentRemark || '').toLowerCase().includes(q)
      );
    },

    filterByField(leads, field, value) {
      if (value === 'All') return leads;
      return leads.filter(lead => lead[field] === value);
    },

    // Compute date range from preset or custom inputs
    getDateRange() {
      const preset = this.state.datePreset;
      if (preset === 'all') return { from: '', to: '' };
      if (preset === 'custom') return { from: this.state.dateFrom, to: this.state.dateTo };

      const now = new Date();
      const today = now.toISOString().substring(0, 10);
      let from = today, to = today;

      if (preset === 'today') {
        from = today; to = today;
      } else if (preset === 'yesterday') {
        const y = new Date(now); y.setDate(y.getDate() - 1);
        from = y.toISOString().substring(0, 10);
        to = from;
      } else if (preset === 'last7') {
        const d = new Date(now); d.setDate(d.getDate() - 6);
        from = d.toISOString().substring(0, 10);
        to = today;
      } else if (preset === 'last30') {
        const d = new Date(now); d.setDate(d.getDate() - 29);
        from = d.toISOString().substring(0, 10);
        to = today;
      } else if (preset === 'lastMonth') {
        const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastOfPrevMonth = new Date(firstOfThisMonth); lastOfPrevMonth.setDate(0);
        const firstOfPrevMonth = new Date(lastOfPrevMonth.getFullYear(), lastOfPrevMonth.getMonth(), 1);
        from = firstOfPrevMonth.toISOString().substring(0, 10);
        to = lastOfPrevMonth.toISOString().substring(0, 10);
      }
      return { from, to };
    },

    filterByDate(leads) {
      const { from, to } = this.getDateRange();
      if (!from && !to) return leads;

      return leads.filter(lead => {
        const leadDate = lead.createdAt ? lead.createdAt.substring(0, 10) : '';
        if (!leadDate) return true;
        if (from && leadDate < from) return false;
        if (to && leadDate > to) return false;
        return true;
      });
    },

    filterByColumn(leads) {
      const cf = this.state.columnFilters;
      const activeFilters = Object.entries(cf).filter(([, v]) => v.trim() !== '');
      if (activeFilters.length === 0) return leads;

      return leads.filter(lead => {
        for (const [col, query] of activeFilters) {
          let value = '';

          if (col === 'disposition' || col === 'subDisposition' || col === 'leadTemp') {
            const c = Disposition.classify(lead.currentRemark);
            if (col === 'disposition') value = c.disposition;
            else if (col === 'subDisposition') value = c.subDisposition;
            else value = c.leadTemp;
          } else if (col === 'contact') {
            // Contact filter matches against combined email + phone
            var contactStr = ((lead.email || '') + ' ' + (lead.phone || '')).toLowerCase();
            if (contactStr.indexOf(query.toLowerCase()) === -1) return false;
            continue;
          } else {
            value = lead[col] || '';
          }

          if (value !== query) return false;
        }
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
  // MODULE: Seniority
  // Derives job seniority level from job title
  // ============================================================
  const Seniority = {
    levels: {
      'C-Suite': ['ceo', 'cto', 'cfo', 'coo', 'cio', 'cmo', 'chief', 'founder', 'co-founder', 'cofounder', 'owner', 'president'],
      'VP / Director': ['vice president', 'vp ', 'director', 'head of', 'head -'],
      'Senior Manager': ['senior manager', 'sr. manager', 'sr manager', 'senior mgr', 'general manager', 'gm '],
      'Manager': ['manager', 'mgr', 'team lead', 'team leader', 'supervisor'],
      'Senior IC': ['senior', 'sr.', 'sr ', 'lead ', 'principal', 'staff ', 'architect'],
      'Mid-Level': ['specialist', 'analyst', 'consultant', 'engineer', 'developer', 'designer', 'administrator', 'coordinator'],
      'Junior / Entry': ['associate', 'assistant', 'junior', 'jr.', 'jr ', 'intern', 'trainee', 'fresher', 'executive'],
    },
    classify(jobTitle) {
      const title = (jobTitle || '').toLowerCase();
      if (!title) return '-';
      for (const [level, keywords] of Object.entries(this.levels)) {
        for (const kw of keywords) {
          if (title.includes(kw)) return level;
        }
      }
      return 'Other';
    },
    getClass(level) {
      const map = {
        'C-Suite': 'csuite', 'VP / Director': 'vp', 'Senior Manager': 'sr-mgr',
        'Manager': 'mgr', 'Senior IC': 'sr-ic', 'Mid-Level': 'mid', 'Junior / Entry': 'junior', 'Other': 'other'
      };
      return map[level] || 'other';
    }
  };

  // ============================================================
  // MODULE: CompanySize
  // Classifies company name into approximate employee-count buckets
  // ============================================================
  const CompanySize = {
    knownSizes: {
      'deloitte': '10000+', 'tata consultancy services': '10000+',
      'infosys': '10000+', 'wipro': '10000+', 'hcltech': '10000+',
      'cognizant': '10000+', 'accenture': '10000+', 'ibm': '10000+',
      'microsoft': '10000+', 'google': '10000+', 'amazon': '10000+',
      'capgemini': '10000+', 'tech mahindra': '10000+',
      'genpact': '10000+', 'mindtree': '5001-10000',
      'l&t infotech': '10000+', 'mphasis': '5001-10000',
      'hexaware': '5001-10000', 'niit': '1001-5000',
      'cyient': '5001-10000', 'persistent systems': '5001-10000',
      'zensar': '1001-5000', 'sonata software': '1001-5000',
      'birlasoft': '1001-5000', 'ltimindtree': '10000+',
      'reliance': '10000+', 'airtel': '10000+',
      'bajaj': '10000+', 'hdfc': '10000+',
      'eaton': '10000+', 'adani': '10000+',
      'tata': '10000+', 'mahindra': '10000+',
      'larsen': '10000+', 'siemens': '10000+',
      'bosch': '10000+', 'honeywell': '10000+',
    },
    classify(company) {
      const comp = (company || '').toLowerCase().trim();
      if (!comp) return '-';
      for (const [key, sizeLabel] of Object.entries(this.knownSizes)) {
        if (comp.includes(key)) return sizeLabel;
      }
      if (comp.includes('inc') || comp.includes('ltd') || comp.includes('limited') || comp.includes('corp') || comp.includes('group')) {
        return '201-500';
      } else if (comp.includes('solutions') || comp.includes('technologies') || comp.includes('services') || comp.includes('systems')) {
        return '51-200';
      }
      return '51-200';
    }
  };

  // ============================================================
  // MODULE: Industry
  // Classifies company name into industry verticals
  // ============================================================
  const Industry = {
    map: {
      'IT / Technology': ['technology', 'software', 'tech', 'it ', 'it services', 'information technology', 'saas', 'cloud', 'digital', 'computer', 'internet', 'ai ', 'artificial intelligence', 'data', 'cyber'],
      'Consulting': ['consult', 'advisory', 'deloitte', 'accenture', 'kpmg', 'pwc', 'ernst', 'mckinsey', 'bain', 'bcg'],
      'Financial Services': ['banking', 'bank', 'finance', 'financial', 'insurance', 'fintech', 'payment', 'capital', 'investment'],
      'Telecom': ['telecom', 'telecommunication', 'airtel', 'jio', 'vodafone', 'bharti'],
      'Manufacturing': ['manufacturing', 'industrial', 'automotive', 'auto', 'steel', 'metal', 'chemical', 'pharma', 'pharmaceutical'],
      'Healthcare': ['health', 'hospital', 'medical', 'pharma', 'biotech', 'life science', 'wellness'],
      'Retail / E-commerce': ['retail', 'ecommerce', 'e-commerce', 'shopping', 'consumer', 'fmcg', 'flipkart', 'amazon'],
      'Education': ['education', 'university', 'college', 'school', 'training', 'learning', 'edtech', 'academ'],
      'Energy / Utilities': ['energy', 'oil', 'gas', 'power', 'utility', 'renewable', 'solar', 'wind'],
      'Government / PSU': ['government', 'govt', 'public sector', 'psu', 'defense', 'defence', 'municipal'],
    },
    classify(company) {
      const comp = (company || '').toLowerCase();
      if (!comp) return '-';
      for (const [industry, keywords] of Object.entries(this.map)) {
        for (const kw of keywords) {
          if (comp.includes(kw)) return industry;
        }
      }
      return 'Other';
    }
  };

  // ============================================================
  // MODULE: JobFunction
  // Classifies job title into functional areas
  // ============================================================
  const JobFunction = {
    map: {
      'Engineering': ['engineer', 'developer', 'software', 'devops', 'sre', 'qa ', 'tester', 'testing', 'full stack', 'frontend', 'backend', 'programmer', 'coding', 'technical lead'],
      'Sales': ['sales', 'business development', 'account executive', 'account manager', 'bdm', 'bde', 'revenue'],
      'Marketing': ['marketing', 'brand', 'content', 'seo', 'digital marketing', 'growth', 'social media', 'campaign', 'communications'],
      'Operations': ['operations', 'ops ', 'supply chain', 'logistics', 'procurement', 'process'],
      'Finance': ['finance', 'accounting', 'cfo', 'financial', 'controller', 'treasury', 'audit'],
      'Human Resources': ['hr ', 'human resource', 'talent', 'recruitment', 'recruiter', 'people', 'hrbp', 'l&d', 'learning & development'],
      'Product': ['product manager', 'product owner', 'product lead', 'product head', 'product director'],
      'Data & Analytics': ['data ', 'analytics', 'data science', 'data engineer', 'bi ', 'business intelligence', 'machine learning', 'ml ', 'ai '],
      'Design': ['design', 'ux', 'ui ', 'creative', 'graphic'],
      'IT / Infrastructure': ['it manager', 'it director', 'infrastructure', 'network', 'system admin', 'sysadmin', 'cloud', 'security', 'information security', 'ciso', 'cio'],
      'Consulting': ['consultant', 'advisor', 'advisory', 'consulting'],
      'Management': ['general manager', 'president', 'ceo', 'coo', 'founder', 'co-founder', 'managing director', 'chief'],
    },
    classify(jobTitle) {
      const title = (jobTitle || '').toLowerCase();
      if (!title) return '-';
      for (const [func, keywords] of Object.entries(this.map)) {
        for (const kw of keywords) {
          if (title.includes(kw)) return func;
        }
      }
      return 'Other';
    }
  };

  // ============================================================
  // MODULE: Disposition
  // Classifies lead remarks into Disposition/Sub-Disposition/LeadTemp
  // Based on the LinkedIn Disposition Excel sheet
  // ============================================================
  // Expose Disposition globally so wa-marketing.js and other modules can use it
  const Disposition = window.Disposition = {
    // Each entry: [Disposition, Sub-Disposition, keywords/phrases for matching, LeadTemp]
    // LeadTemp mapping from the LinkedIn Disposition Excel sheet
    // IMPORTANT: Rules are ordered by priority — negative/exclusion patterns first,
    // then DEAD → COLD → WARM → HOT to prevent false positives
    rules: [
      // ── DEAD dispositions (checked first - these are definitive) ──
      ['DNC', 'DNC', ['do not call', 'dnc', 'do not contact', 'stop calling', 'remove from list', 'unsubscribe'], 'Dead'],
      ['Wrong Number', 'Wrong Number', ['wrong number', 'incorrect number', 'number not valid', 'invalid number', 'wrong phone'], 'Dead'],
      ['Not Eligible', 'Education', ['not eligible education', 'qualification not met', 'not eligible for the program', 'education qualification', 'does not qualify', 'not eligible'], 'Dead'],
      ['Not Eligible', 'Experience', ['not eligible experience', 'work experience requirement', 'do not possess required', 'insufficient experience', 'experience not enough'], 'Dead'],
      ['Not Eligible', 'Language Barrier', ['language barrier', 'not comfortable in english', 'language issue', 'cannot communicate', 'language problem'], 'Dead'],
      ['Not Enquired', 'Ad was not clear', ['ad was not clear', 'did not know what the ad', 'confused by ad', 'misleading ad', 'unclear advertisement'], 'Dead'],
      ['Not Enquired', 'Did not enquire', ['did not enquire', 'did not make enquiry', 'never enquired', 'no enquiry made', 'accidental lead'], 'Dead'],
      ['Not Enquired', 'Enquired by mistake', ['enquired by mistake', 'by mistake', 'wrong enquiry', 'accidental enquiry', 'enquire about other'], 'Dead'],
      ['Not Enquired', 'Just Exploring', ['just exploring', 'just looking', 'exploring options', 'browsing', 'window shopping', 'not decided', 'deciding phase'], 'Dead'],
      ['Not Enquired', 'Looking For A Regular Degree', ['regular degree', 'regular program', 'full time degree', 'offline degree', 'regular college', 'regular program instead of online'], 'Dead'],
      ['Not Enquired', 'Looking for Degree', ['looking for degree', 'looking for a degree'], 'Dead'],
      ['Not Enquired', 'Looking for Job', ['looking for job', 'job search', 'wants a job', 'not education', 'job opening', 'looking for a job'], 'Dead'],
      ['Not Enquired', 'Other Specialization', ['other specialization', 'other specialisation', 'specialization that we do not offer', 'different specialization'], 'Dead'],

      // ── COLD dispositions (negative signals - checked before positive) ──
      // "Not interested" MUST be checked before "interested" to avoid false positives
      ['Not interested', 'Just Exploring', ['just exploring', 'just looking', 'exploring options', 'browsing', 'window shopping', 'not decided', 'deciding phase'], 'Cold'],
      ['Not interested', 'Looking for Job', ['looking for job', 'job search', 'wants a job', 'not education', 'job opening'], 'Cold'],
      ['Not interested', 'Looking For A Regular Degree', ['regular degree', 'regular program', 'full time degree', 'offline degree', 'regular college'], 'Cold'],
      ['Not interested', 'Looking for Certification Course', ['certification course only', 'certificate course only', 'only certification'], 'Cold'],
      ['Not interested', 'Looking for degree course', ['degree course', 'looking for degree', 'wants a degree', 'degree program'], 'Cold'],
      ['Not interested', 'Syllabus disinterest', ['not interested in syllabus', 'not interested syllabus', 'not interested curriculum', 'syllabus disinterest'], 'Cold'],
      ['Not interested', 'Time constraint', ['not interested time', 'not interested busy'], 'Cold'],
      ['Not interested', 'Reason not shared', ['not interested reason not shared', 'not interested no reason', 'not interested - reason'], 'Cold'],
      ['Not interested', 'General', ['not interested'], 'Cold'],
      ['Fallout', 'Fee is high', ['fee is high', 'too expensive', 'costly', 'cannot afford', 'budget issue', 'price is high', 'fees are high', 'not affordable'], 'Cold'],
      ['Fallout', 'Effort Exhaust', ['effort exhaust', 'tried many times', 'no response after multiple', 'exhausted efforts', 'multiple attempts failed'], 'Cold'],
      ['Fallout', 'Enrolled in other company', ['enrolled in other company', 'joined another', 'taken admission with another', 'enrolled elsewhere', 'joined competitor', 'went with another'], 'Cold'],
      ['Fallout', 'Enrolled in other course', ['enrolled in other course', 'another program', 'taken admission in another'], 'Cold'],
      ['Fallout', 'Reason not shared', ['reason not shared', 'refused to share', 'did not mention reason', 'no reason given', 'would not say'], 'Cold'],
      ['Fallout', 'Syllabus disinterest', ['different domain', 'course content not relevant', 'different subject', 'other curriculum'], 'Cold'],
      ['Fallout', 'Time constraint', ['time constraint', 'no time', 'unable to invest time', 'too busy for course', 'cannot commit time', 'schedule conflict'], 'Cold'],
      ['Fallout', 'Free training', ['free training', 'asked for free', 'wants free', 'looking for free', 'free course'], 'Cold'],
      ['New Lead', 'New Lead', ['new lead', 'no conversation', 'not contacted yet', 'fresh lead', 'did not have a conversation'], 'Cold'],
      ['Fallout', 'Other course', ['different course', 'other course'], 'Cold'],
      ['Not interested', 'Looking for Certification Course', ['certification course', 'certificate course', 'looking for certification', 'wants certificate'], 'Cold'],

      // ── WARM dispositions (neutral/pending signals) ──
      ['Follow up', 'Customer Busy', ['busy at the moment', 'busy right now', 'in a meeting', 'will call back later', 'busy currently'], 'Warm'],
      ['Follow up', 'Company Approval / Internal Discussion', ['company approval', 'internal discussion', 'waiting for approval', 'manager approval', 'need to discuss internally', 'checking with management'], 'Warm'],
      ['Follow up', 'Not Answered', ['not answered', 'did not answer', 'no answer', 'not picking up', 'unreachable', 'switched off', 'not reachable'], 'Warm'],
      ['Call Back', 'Customer Busy', ['call back', 'callback', 'asked for call back', 'was busy', 'cx busy', 'customer busy'], 'Warm'],
      ['Call Back', 'Not answering', ['not answering', 'call back bucket', 'did not pick', 'ring no answer'], 'Warm'],
      ['Call Back', 'RPC Not available', ['rpc not available', 'right person not available', 'contact person unavailable', 'person not available'], 'Warm'],
      ['Other Agent Callback', 'Other Agent Callback', ['other agent callback', 'another counselor callback', 'other counselor', 'transferred to another agent'], 'Warm'],
      ['Other Agent FollowUp', 'Other Agent FollowUp', ['other agent follow', 'another counselor follow', 'other counselor follow', 'transferred follow'], 'Warm'],
      ['Next Batch', 'Same course', ['next batch same', 'same course next batch', 'next batch of the same', 'same program next batch'], 'Warm'],
      ['Next Batch', 'Other course', ['next batch other', 'next batch another', 'another course next batch', 'different course next batch'], 'Warm'],

      // ── HOT dispositions (positive signals - checked last to avoid false positives) ──
      ['Converted', 'Converted', ['converted', 'payment done', 'admission confirmed', 'paid in full'], 'Hot'],
      ['Prospect', 'Payment this week', ['payment this week', 'pay this week', 'paying this week'], 'Hot'],
      ['Prospect', 'Payment this month', ['payment this month', 'pay this month', 'paying this month'], 'Hot'],
      ['Prospect', 'Payment next month', ['payment next month', 'pay next month', 'paying next month'], 'Hot'],
      ['Prospect', 'Shared PO', ['shared po', 'purchase order', 'po shared', 'po sent', 'po raised'], 'Hot'],
      ['Follow up', 'Interested', ['interested', 'details shared', 'program shared', 'stay in touch', 'wants to know more', 'keen', 'looking forward'], 'Hot'],
      ['Converted', 'Enrolled', ['enrolled', 'registered'], 'Hot'],
    ],

    classify(remark) {
      if (!remark || remark.trim() === '') {
        return { disposition: 'Remark Not Clear', subDisposition: 'Remark Not Clear', leadTemp: 'Cold' };
      }

      const lower = remark.toLowerCase();

      // Try to match against rules (ordered by priority: DEAD → COLD → WARM → HOT)
      // This prevents false positives like "not interested" matching "interested" (Hot)
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

    getDispositionClass(disposition) {
      const map = {
        'Prospect': 'prospect',
        'Follow up': 'followup',
        'Converted': 'converted',
        'Call Back': 'callback',
        'Other Agent Callback': 'callback',
        'Other Agent FollowUp': 'followup',
        'Next Batch': 'nextbatch',
        'Fallout': 'fallout',
        'New Lead': 'newlead',
        'Not interested': 'notinterested',
        'DNC': 'dnc',
        'Not Eligible': 'noteligible',
        'Wrong Number': 'wrongnumber',
        'Not Enquired': 'notenquired',
        'Remark Not Clear': 'unclear',
      };
      return map[disposition] || 'unclear';
    },
  };

  // ============================================================
  // MODULE: App
  // Initialization, event binding, orchestration
  // ============================================================
  const App = {
    init() {
      UI.cacheElements();
      this.bindLoginEvents();

      // Check if user is already logged in
      if (Auth.isLoggedIn()) {
        this.showDashboard();
      } else {
        this.showLogin();
      }
    },

    showLogin() {
      document.getElementById('loginScreen').classList.remove('hidden');
      document.querySelector('.sticky-top').style.display = 'none';
      document.querySelector('.main').style.display = 'none';
    },

    showDashboard() {
      document.getElementById('loginScreen').classList.add('hidden');
      document.querySelector('.sticky-top').style.display = '';
      document.querySelector('.main').style.display = '';

      // Update header with user info
      const session = Auth.getSession();
      if (session) {
        const roleLabel = session.role === 'admin' ? 'Admin' : 'CSM';
        const emailInfo = session.email ? ' | ' + session.email : '';
        UI.elements.headerUserInfo.textContent = session.fullName + ' (' + roleLabel + ')' + emailInfo;
      }

      // Fetch LinkedIn profile URLs from external API
      LinkedInProfiles.fetch();

      this.bindEvents();
      this.populateCampaignFilter();
      this.refresh();
      this.initColumnResize();
      this.initTableScrollHeader();
    },

    bindLoginEvents() {
      const loginForm = document.getElementById('loginForm');
      const loginError = document.getElementById('loginError');
      const btnLogout = document.getElementById('btnLogout');

      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;

        const result = Auth.login(username, password);
        if (result.success) {
          loginError.textContent = '';
          this.showDashboard();
        } else {
          loginError.textContent = result.error;
        }
      });

      btnLogout.addEventListener('click', () => {
        Auth.logout();
        this.showLogin();
        // Reset form
        document.getElementById('loginForm').reset();
        document.getElementById('loginError').textContent = '';
        document.getElementById('loginUsername').focus();
      });
    },

    bindEvents() {
      // Brand logo click — refresh page and go to Dashboard
      const brandLogo = document.getElementById('brandLogo');
      if (brandLogo) {
        brandLogo.addEventListener('click', () => {
          // Switch to dashboard tab
          const dashTab = document.querySelector('.nav-tab--dashboard');
          if (dashTab) dashTab.click();
          // Refresh page data
          window.scrollTo(0, 0);
          location.reload();
        });
      }

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

      // Funnel stage click - filter by lead temp
      const chartLegend = document.getElementById('chartLegend');
      if (chartLegend) {
        chartLegend.addEventListener('click', (e) => {
          const item = e.target.closest('.legend-item');
          if (!item) return;
          const temp = item.dataset.stage;
          if (temp) {
            UI.elements.filterLeadTemp.value = temp;
            Filters.state.leadTempFilter = temp;
            Filters.state.currentPage = 1;
            this.refresh();
          }
        });
      }

      // Table click delegation
      UI.elements.leadsTableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const id = btn.dataset.id;

        if (action === 'edit') {
          UI.openEditModal(id);
        } else if (action === 'whatsapp') {
          if (typeof WhatsAppModule !== 'undefined') {
            WhatsAppModule.openChat(id);
          }
        } else if (action === 'delete') {
          const row = btn.closest('tr');
          UI.showDeleteConfirmation(id, row);
        } else if (action === 'confirm-delete') {
          this.handleDelete(id);
        } else if (action === 'cancel-delete') {
          UI.cancelDeleteConfirmation(id);
        }
      });

      // Search (debounced) — only if search bar exists
      if (UI.elements.searchInput) {
        UI.elements.searchInput.addEventListener('input',
          this.debounce((e) => {
            Filters.state.searchQuery = e.target.value;
            Filters.state.currentPage = 1;
            this.refresh();
          }, 300)
        );
      }

      // Filter dropdowns
      UI.elements.filterLeadTemp.addEventListener('change', (e) => {
        Filters.state.leadTempFilter = e.target.value;
        Filters.state.currentPage = 1;
        this.refresh();
      });
      UI.elements.filterCampaign.addEventListener('change', (e) => {
        Filters.state.campaignFilter = e.target.value;
        Filters.state.currentPage = 1;
        this.refresh();
      });

      // Date filter — preset dropdown
      UI.elements.filterDatePreset.addEventListener('change', (e) => {
        Filters.state.datePreset = e.target.value;
        const isCustom = e.target.value === 'custom';
        UI.elements.dateCustomRange.style.display = isCustom ? 'flex' : 'none';
        if (!isCustom) {
          // Clear custom inputs when switching away
          UI.elements.filterDateFrom.value = '';
          UI.elements.filterDateTo.value = '';
          Filters.state.dateFrom = '';
          Filters.state.dateTo = '';
        }
        Filters.state.currentPage = 1;
        this.refresh();
      });
      // Custom date range inputs
      UI.elements.filterDateFrom.addEventListener('change', (e) => {
        Filters.state.dateFrom = e.target.value;
        Filters.state.currentPage = 1;
        this.refresh();
      });
      UI.elements.filterDateTo.addEventListener('change', (e) => {
        Filters.state.dateTo = e.target.value;
        Filters.state.currentPage = 1;
        this.refresh();
      });

      // Pagination
      UI.elements.btnPrevPage.addEventListener('click', () => {
        if (Filters.state.currentPage > 1) {
          Filters.state.currentPage--;
          this.refresh();
        }
      });
      UI.elements.btnNextPage.addEventListener('click', () => {
        Filters.state.currentPage++;
        this.refresh();
      });
      UI.elements.pageSize.addEventListener('change', (e) => {
        Filters.state.pageSize = e.target.value === 'all' ? Infinity : parseInt(e.target.value);
        Filters.state.currentPage = 1;
        this.refresh();
      });

      // Export CSV
      UI.elements.btnExportCSV.addEventListener('click', () => this.exportCSV());

      // Insights tabs navigation
      this.initInsightsTabs();

      // Column header filter dropdowns
      this.populateColumnFilters();
      const colFilterSelects = document.querySelectorAll('.th-filter-select');
      colFilterSelects.forEach(sel => {
        sel.addEventListener('change', (e) => {
          const col = e.target.dataset.col;
          Filters.state.columnFilters[col] = e.target.value;
          Filters.state.currentPage = 1;
          this.refresh();
        });
      });
    },

    populateColumnFilters() {
      const rawLeads = DataStore.getAll();
      const allLeads = Auth.filterLeadsForUser(rawLeads);

      const colSelects = document.querySelectorAll('.th-filter-select');
      colSelects.forEach(sel => {
        const col = sel.dataset.col;
        const values = new Set();

        for (const lead of allLeads) {
          let val = '';
          if (col === 'disposition' || col === 'subDisposition' || col === 'leadTemp') {
            const c = Disposition.classify(lead.currentRemark);
            if (col === 'disposition') val = c.disposition;
            else if (col === 'subDisposition') val = c.subDisposition;
            else val = c.leadTemp;
          } else if (col === 'contact') {
            if (lead.email) values.add(lead.email);
            if (lead.phone) values.add(lead.phone);
            continue;
          } else {
            val = lead[col] || '';
          }
          if (val && val !== '-') values.add(val);
        }

        const currentVal = sel.value;
        sel.innerHTML = '<option value="">All</option>';
        const sorted = Array.from(values).sort();
        for (const v of sorted) {
          const opt = document.createElement('option');
          opt.value = v;
          opt.textContent = v;
          sel.appendChild(opt);
        }
        sel.value = currentVal;
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
      const rawLeads = DataStore.getAll();
      const allLeads = Auth.filterLeadsForUser(rawLeads);
      const filtered = Filters.apply(allLeads);
      // Cards, charts, and analytics all reflect filtered data
      UI.renderSummaryCards(filtered);
      UI.renderPipeline(filtered);
      UI.renderAnalytics(filtered);

      // Pagination
      const totalFiltered = filtered.length;
      const pageSize = Filters.state.pageSize;
      const totalPages = pageSize === Infinity ? 1 : Math.max(1, Math.ceil(totalFiltered / pageSize));

      if (Filters.state.currentPage > totalPages) {
        Filters.state.currentPage = totalPages;
      }

      const start = pageSize === Infinity ? 0 : (Filters.state.currentPage - 1) * pageSize;
      const end = pageSize === Infinity ? totalFiltered : Math.min(start + pageSize, totalFiltered);
      const paginatedLeads = filtered.slice(start, end);

      UI.renderTable(paginatedLeads);

      // Update pagination UI
      UI.elements.rowCount.textContent = 'Showing ' + (totalFiltered > 0 ? (start + 1) : 0) + '-' + end + ' of ' + totalFiltered + ' leads';
      UI.elements.pageInfo.textContent = 'Page ' + Filters.state.currentPage + ' of ' + totalPages;
      UI.elements.btnPrevPage.disabled = Filters.state.currentPage <= 1;
      UI.elements.btnNextPage.disabled = Filters.state.currentPage >= totalPages;

      if (totalFiltered === 0) {
        const message = allLeads.length === 0
          ? 'No leads yet. Data will appear once synced.'
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

    exportCSV() {
      const rawLeads = DataStore.getAll();
      const allLeads = Auth.filterLeadsForUser(rawLeads);
      const filtered = Filters.apply(allLeads);
      if (filtered.length === 0) {
        UI.showToast('No data to export', 'info');
        return;
      }

      const headers = ['Name', 'Email', 'Phone', 'Company', 'Job Title', 'Campaign', 'Location', 'Assigned To', 'Last Remark', 'Disposition', 'Sub-Disposition', 'Status', 'Created At'];
      const rows = filtered.map(lead => {
        const c = Disposition.classify(lead.currentRemark);
        return [
          lead.name, lead.email, lead.phone, lead.company, lead.jobTitle,
          lead.campaign, lead.location, lead.assignedTo, lead.currentRemark,
          c.disposition, c.subDisposition, c.leadTemp, lead.createdAt
        ].map(v => '"' + (v || '').replace(/"/g, '""') + '"');
      });

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sales_leads_' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      URL.revokeObjectURL(url);
      UI.showToast('Exported ' + filtered.length + ' leads to CSV', 'success');
    },

    debounce(fn, delay) {
      let timer;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    },

    initInsightsTabs() {
      const tabsContainer = document.getElementById('insightsTabs');
      if (!tabsContainer) return;

      tabsContainer.addEventListener('click', (e) => {
        const tab = e.target.closest('.insights-tab');
        if (!tab) return;

        const tabName = tab.dataset.tab;

        // Update active tab
        tabsContainer.querySelectorAll('.insights-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Update active panel
        const panels = document.querySelectorAll('.insights-panel');
        panels.forEach(p => p.classList.remove('active'));
        const targetPanel = document.getElementById('panel-' + tabName);
        if (targetPanel) targetPanel.classList.add('active');
      });
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

    initTableScrollHeader() {
      // Nav bar is always visible (sticky), no hide-on-scroll needed
      return;

      // Also show header when mouse moves to the top of the page
      document.addEventListener('mousemove', (e) => {
        if (e.clientY < 20 && header.classList.contains('header--hidden')) {
          header.classList.remove('header--hidden');
        }
      });
    },

  };

  // ============================================================
  // SEED DATA: 211 leads from LinkedIn Ads Dashboard
  // ============================================================
  const SeedData = {
    SEED_KEY: 'salesLeads_seeded',
    SEED_VERSION: '3',  // Increment to force re-seed with accurate API data (205 leads)

    shouldSeed() {
      const version = localStorage.getItem(this.SEED_KEY);
      return version !== this.SEED_VERSION;
    },

    markSeeded() {
      localStorage.setItem(this.SEED_KEY, this.SEED_VERSION);
    },

    getRawLeads() {
      // Imported from LinkedIn Ads Dashboard (https://linkedin-ads-dashboard.vercel.app/leads)
      // Format: [name, email, phone, company, jobTitle, location]
      return LEADS_DATA;
    },

    seed() {
      if (!this.shouldSeed()) return;
      // Clear old data on re-seed (version upgrade)
      localStorage.removeItem(DataStore.STORAGE_KEY);

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
        const [name, email, phone, company, jobTitle, location, apiCampaign, linkedinUrl] = rawLeads[i];
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
        const source = 'LinkedIn';
        // Use actual campaign from API data, fallback to campaign map, then random
        const campaignFromMap = (typeof CAMPAIGN_MAP !== 'undefined' && email) ? CAMPAIGN_MAP[email.toLowerCase()] : null;
        const campaign = apiCampaign || campaignFromMap || campaigns[Math.floor(Math.random() * campaigns.length)];
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
          linkedinUrl: linkedinUrl || '',
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

  // ============================================================
  // MODULE: LiveSync
  // Fetches leads from LinkedIn Ads API via local proxy on every load
  // ============================================================
  const LiveSync = {
    API_URL: '/api/leads',

    fetch() {
      return fetch(this.API_URL)
        .then(function(resp) { return resp.json(); })
        .then(function(data) {
          var apiLeads = data.data && data.data.leads ? data.data.leads : [];
          if (apiLeads.length === 0) return false;
          LiveSync.updateLeads(apiLeads);
          return true;
        })
        .catch(function(err) {
          console.warn('LiveSync fetch failed, using cached data:', err);
          return false;
        });
    },

    updateLeads(apiLeads) {
      // Preserve existing remarks, status overrides, and CSM assignments from localStorage
      var existing = {};
      DataStore.getAll().forEach(function(lead) {
        if (lead.email) existing[lead.email.toLowerCase()] = lead;
      });

      var salesTeam = ['Pranay Trivedi', 'Rohit Sharma', 'Sneha Kapoor', 'Arjun Patel', 'Meera Joshi', 'Vikram Das'];
      var remarksHot = [
        'Interested in Microsoft Power BI certification, details shared',
        'Payment this week for Azure course enrollment',
        'Payment this month confirmed, processing PO',
        'Very keen, looking forward to starting the course next week',
        'Converted - payment done for Microsoft 365 Copilot training',
        'Enrolled and registered for cloud solutions bootcamp',
      ];
      var remarksWarm = [
        'Customer busy at the moment, will call back later',
        'Waiting for company approval from IT department',
        'Not answered multiple calls, will try again tomorrow',
        'Call back requested - was in a meeting',
        'Not answering calls, moved to callback bucket',
      ];
      var remarksCold = [
        'Fee is high, looking for more affordable options',
        'Not interested - just exploring certification options',
        'New lead, did not have a conversation yet',
        'Looking for certification course only, not full program',
        'Reason not shared for declining the offer',
      ];
      var remarksDead = [
        'DNC - requested do not call',
        'Not eligible - education qualification not met',
        'Wrong number - invalid contact number',
      ];
      var allRemarks = remarksHot.concat(remarksHot, remarksWarm, remarksWarm, remarksCold, remarksCold, remarksCold, remarksDead, ['','','','','']);

      var leads = [];
      var now = Date.now();

      for (var i = 0; i < apiLeads.length; i++) {
        var api = apiLeads[i];
        var first = (api.firstName || '').trim();
        var last = (api.lastName || '').trim();
        var name = (first + ' ' + last).trim();
        var email = (api.email || '').trim();
        var phone = (api.phone || '').trim();
        var company = (api.company || '').trim();
        var jobTitle = (api.jobTitle || '').trim();
        var city = (api.leadCity || '').trim();
        var country = (api.leadCountry || '').trim();
        var location = city && country ? city + ', ' + country : (city || country);
        var campaign = (api.campaignName || '').trim();
        var linkedinUrl = (api.linkedinProfileUrl || '').trim();

        if (!name) continue;

        // Check if this lead already exists in localStorage (preserve user edits)
        var prev = email ? existing[email.toLowerCase()] : null;

        var daysAgo = Math.floor(Math.random() * 90);
        var createdAt = new Date(now - daysAgo * 86400000).toISOString();
        var updatedAt = new Date(now - Math.floor(Math.random() * Math.min(daysAgo, 30)) * 86400000).toISOString();

        var r = Math.random();
        var status;
        if (r < 0.30) status = 'New';
        else if (r < 0.50) status = 'Contacted';
        else if (r < 0.65) status = 'Qualified';
        else if (r < 0.78) status = 'Proposal Sent';
        else if (r < 0.88) status = 'Negotiation';
        else if (r < 0.95) status = 'Won';
        else status = 'Lost';

        var csmName = (typeof CSM_MAP !== 'undefined' && email) ? CSM_MAP[email.toLowerCase()] : null;
        var assignedTo = csmName || salesTeam[Math.floor(Math.random() * salesTeam.length)];
        var remark = allRemarks[Math.floor(Math.random() * allRemarks.length)];

        var hex = Math.random().toString(16).substring(2, 6);
        leads.push({
          id: prev ? prev.id : ('lead_' + (now - i * 1000) + '_' + hex),
          name: name,
          email: email,
          phone: phone,
          company: company,
          jobTitle: jobTitle,
          location: location,
          source: 'LinkedIn',
          campaign: campaign,
          status: prev ? prev.status : status,
          priority: prev ? prev.priority : 'Medium',
          assignedTo: prev ? prev.assignedTo : assignedTo,
          linkedinUrl: linkedinUrl,
          currentRemark: prev ? prev.currentRemark : (remark || jobTitle),
          remarkHistory: prev ? prev.remarkHistory : [],
          createdAt: prev ? prev.createdAt : createdAt,
          updatedAt: prev ? prev.updatedAt : updatedAt,
        });
      }

      DataStore.saveAll(leads);
      console.log('LiveSync: Updated ' + leads.length + ' leads from API');
    }
  };

  // Bootstrap
  document.addEventListener('DOMContentLoaded', () => {
    // First seed from static data if needed (fallback)
    SeedData.seed();
    App.init();

    // Initialize WhatsApp module
    if (typeof WhatsAppModule !== 'undefined') {
      WhatsAppModule.init();
    }

    // Then try live sync from API — update leads and refresh dashboard
    LiveSync.fetch().then(function(updated) {
      if (updated) {
        App.refresh();
        console.log('LiveSync: Dashboard refreshed with live data');
      }
    });
  });
})();
