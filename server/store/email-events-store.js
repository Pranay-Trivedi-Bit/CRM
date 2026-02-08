const fs = require('fs');
const path = require('path');
const config = require('../config');

const eventsDir = path.join(config.dataDir, 'email-events');

function ensureDir() {
  if (!fs.existsSync(eventsDir)) {
    fs.mkdirSync(eventsDir, { recursive: true });
  }
}

function generateId() {
  return 'evt_' + Date.now() + '_' + Math.random().toString(16).substring(2, 6);
}

function addEvent(event) {
  ensureDir();
  if (!event.id) event.id = generateId();
  if (!event.timestamp) event.timestamp = new Date().toISOString();

  // Store events grouped by campaignId
  const campaignFile = path.join(eventsDir, `${event.campaignId}.json`);
  let events = [];
  if (fs.existsSync(campaignFile)) {
    events = JSON.parse(fs.readFileSync(campaignFile, 'utf8'));
  }
  events.push(event);
  fs.writeFileSync(campaignFile, JSON.stringify(events, null, 2));
  return event;
}

function addEvents(eventsList) {
  ensureDir();
  // Group by campaignId for efficient writing
  const grouped = {};
  eventsList.forEach(event => {
    if (!event.id) event.id = generateId();
    if (!event.timestamp) event.timestamp = new Date().toISOString();
    if (!grouped[event.campaignId]) grouped[event.campaignId] = [];
    grouped[event.campaignId].push(event);
  });

  Object.keys(grouped).forEach(campaignId => {
    const campaignFile = path.join(eventsDir, `${campaignId}.json`);
    let existing = [];
    if (fs.existsSync(campaignFile)) {
      existing = JSON.parse(fs.readFileSync(campaignFile, 'utf8'));
    }
    const merged = existing.concat(grouped[campaignId]);
    fs.writeFileSync(campaignFile, JSON.stringify(merged, null, 2));
  });
}

function getByCampaign(campaignId) {
  ensureDir();
  const campaignFile = path.join(eventsDir, `${campaignId}.json`);
  if (!fs.existsSync(campaignFile)) return [];
  return JSON.parse(fs.readFileSync(campaignFile, 'utf8'));
}

function getStats(campaignId) {
  const events = getByCampaign(campaignId);
  const stats = { total: 0, sent: 0, opened: 0, clicked: 0, bounced: 0 };
  const unique = { sent: new Set(), opened: new Set(), clicked: new Set(), bounced: new Set() };

  events.forEach(e => {
    if (unique[e.type]) {
      unique[e.type].add(e.email);
    }
  });

  stats.sent = unique.sent.size;
  stats.opened = unique.opened.size;
  stats.clicked = unique.clicked.size;
  stats.bounced = unique.bounced.size;
  stats.total = stats.sent;

  return stats;
}

function getAllStats() {
  ensureDir();
  const files = fs.readdirSync(eventsDir).filter(f => f.endsWith('.json'));
  const allStats = {};
  files.forEach(f => {
    const campaignId = f.replace('.json', '');
    allStats[campaignId] = getStats(campaignId);
  });
  return allStats;
}

function removeByCampaign(campaignId) {
  const campaignFile = path.join(eventsDir, `${campaignId}.json`);
  if (fs.existsSync(campaignFile)) {
    fs.unlinkSync(campaignFile);
    return true;
  }
  return false;
}

module.exports = { addEvent, addEvents, getByCampaign, getStats, getAllStats, removeByCampaign };
