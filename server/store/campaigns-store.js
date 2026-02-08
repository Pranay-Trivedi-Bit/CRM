const fs = require('fs');
const path = require('path');
const config = require('../config');

const campaignsDir = path.join(config.dataDir, 'campaigns');

function ensureDir() {
  if (!fs.existsSync(campaignsDir)) {
    fs.mkdirSync(campaignsDir, { recursive: true });
  }
}

function generateId() {
  return 'camp_' + Date.now() + '_' + Math.random().toString(16).substring(2, 6);
}

function getAll() {
  ensureDir();
  const files = fs.readdirSync(campaignsDir).filter(f => f.endsWith('.json'));
  return files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(campaignsDir, f), 'utf8'));
    return {
      id: data.id,
      name: data.name,
      subject: data.subject,
      status: data.status,
      stats: data.stats,
      scheduledAt: data.scheduledAt,
      sentAt: data.sentAt,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  });
}

function getById(id) {
  ensureDir();
  const filePath = path.join(campaignsDir, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function save(campaign) {
  ensureDir();
  const now = new Date().toISOString();
  if (!campaign.id) {
    campaign.id = generateId();
    campaign.createdAt = now;
  }
  campaign.updatedAt = now;
  fs.writeFileSync(path.join(campaignsDir, `${campaign.id}.json`), JSON.stringify(campaign, null, 2));
  return campaign;
}

function remove(id) {
  const filePath = path.join(campaignsDir, `${id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

module.exports = { getAll, getById, save, remove };
