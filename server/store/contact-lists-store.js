const fs = require('fs');
const path = require('path');
const config = require('../config');

const listsDir = path.join(config.dataDir, 'contact-lists');

function ensureDir() {
  if (!fs.existsSync(listsDir)) {
    fs.mkdirSync(listsDir, { recursive: true });
  }
}

function generateId() {
  return 'cl_' + Date.now() + '_' + Math.random().toString(16).substring(2, 6);
}

function getAll() {
  ensureDir();
  const files = fs.readdirSync(listsDir).filter(f => f.endsWith('.json'));
  return files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(listsDir, f), 'utf8'));
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      contactCount: (data.contacts || []).length,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  });
}

function getById(id) {
  ensureDir();
  const filePath = path.join(listsDir, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function save(list) {
  ensureDir();
  const now = new Date().toISOString();
  if (!list.id) {
    list.id = generateId();
    list.createdAt = now;
  }
  list.updatedAt = now;
  fs.writeFileSync(path.join(listsDir, `${list.id}.json`), JSON.stringify(list, null, 2));
  return list;
}

function remove(id) {
  const filePath = path.join(listsDir, `${id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

module.exports = { getAll, getById, save, remove };
