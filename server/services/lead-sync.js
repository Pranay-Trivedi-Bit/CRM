const fs = require('fs');
const path = require('path');
const config = require('../config');

const leadsFile = path.join(config.dataDir, 'leads.json');

function getLeads() {
  if (!fs.existsSync(leadsFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(leadsFile, 'utf8'));
  } catch {
    return [];
  }
}

function saveLeads(leads) {
  fs.writeFileSync(leadsFile, JSON.stringify(leads, null, 2));
}

function findByPhone(phone) {
  const leads = getLeads();
  const cleaned = phone.replace(/[^0-9]/g, '');
  return leads.find(l => {
    const leadPhone = (l.phone || '').replace(/[^0-9]/g, '');
    return leadPhone && (leadPhone === cleaned || leadPhone.endsWith(cleaned) || cleaned.endsWith(leadPhone));
  });
}

async function updateFromWhatsApp(phone, actionType, params) {
  const leads = getLeads();
  const cleaned = phone.replace(/[^0-9]/g, '');
  const leadIndex = leads.findIndex(l => {
    const leadPhone = (l.phone || '').replace(/[^0-9]/g, '');
    return leadPhone && (leadPhone === cleaned || leadPhone.endsWith(cleaned) || cleaned.endsWith(leadPhone));
  });

  if (leadIndex === -1) return null;

  const lead = leads[leadIndex];
  const now = new Date().toISOString();

  switch (actionType) {
    case 'updateTemp':
      if (params.temperature) lead.temperature = params.temperature;
      if (params.remarkText) {
        if (!lead.remarkHistory) lead.remarkHistory = [];
        if (lead.currentRemark) {
          lead.remarkHistory.push({ text: lead.currentRemark, timestamp: lead.updatedAt || now });
        }
        lead.currentRemark = params.remarkText;
      }
      break;
    case 'updateStatus':
      if (params.status) lead.status = params.status;
      break;
    case 'addRemark':
      if (params.remarkText) {
        if (!lead.remarkHistory) lead.remarkHistory = [];
        if (lead.currentRemark) {
          lead.remarkHistory.push({ text: lead.currentRemark, timestamp: lead.updatedAt || now });
        }
        lead.currentRemark = params.remarkText;
      }
      break;
    case 'assignCSM':
      if (params.csmName && params.csmName !== 'auto') {
        lead.assignedTo = params.csmName;
      }
      break;
  }

  lead.updatedAt = now;
  leads[leadIndex] = lead;
  saveLeads(leads);
  return lead;
}

// Sync leads from client
function syncFromClient(clientLeads) {
  saveLeads(clientLeads);
  return { success: true, count: clientLeads.length };
}

module.exports = { findByPhone, updateFromWhatsApp, syncFromClient, getLeads };
