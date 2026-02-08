const fs = require('fs');
const path = require('path');
const config = require('../config');

const flowsDir = path.join(config.dataDir, 'flows');

function ensureDir() {
  if (!fs.existsSync(flowsDir)) {
    fs.mkdirSync(flowsDir, { recursive: true });
  }
}

function generateId() {
  return 'flow_' + Date.now() + '_' + Math.random().toString(16).substring(2, 6);
}

function getAll() {
  ensureDir();
  const files = fs.readdirSync(flowsDir).filter(f => f.endsWith('.json'));
  return files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(flowsDir, f), 'utf8'));
    return { id: data.id, name: data.name, isActive: data.isActive || false, updatedAt: data.updatedAt };
  });
}

function getById(id) {
  ensureDir();
  const filePath = path.join(flowsDir, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function save(flow) {
  ensureDir();
  const now = new Date().toISOString();
  if (!flow.id) {
    flow.id = generateId();
    flow.createdAt = now;
  }
  flow.updatedAt = now;
  fs.writeFileSync(path.join(flowsDir, `${flow.id}.json`), JSON.stringify(flow, null, 2));
  return flow;
}

function remove(id) {
  const filePath = path.join(flowsDir, `${id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

function getActive() {
  ensureDir();
  const files = fs.readdirSync(flowsDir).filter(f => f.endsWith('.json'));
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(flowsDir, f), 'utf8'));
    if (data.isActive) return data;
  }
  return null;
}

function setActive(id) {
  ensureDir();
  const files = fs.readdirSync(flowsDir).filter(f => f.endsWith('.json'));
  for (const f of files) {
    const filePath = path.join(flowsDir, f);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    data.isActive = (data.id === id);
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }
}

module.exports = { getAll, getById, save, remove, getActive, setActive };
