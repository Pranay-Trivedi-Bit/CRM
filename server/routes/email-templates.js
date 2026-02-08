const express = require('express');
const templatesStore = require('../store/templates-store');

const router = express.Router();

// List all templates (seeds defaults on first call)
router.get('/', (req, res) => {
  templatesStore.seedDefaults();
  const templates = templatesStore.getAll();
  res.json({ templates });
});

// Get a single template
router.get('/:id', (req, res) => {
  const template = templatesStore.getById(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  res.json({ template });
});

// Create a new template
router.post('/', (req, res) => {
  const { name, subject, htmlContent } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const template = templatesStore.save({
    name,
    subject: subject || '',
    htmlContent: htmlContent || '',
    isPrebuilt: false
  });
  res.status(201).json({ template });
});

// Update a template
router.put('/:id', (req, res) => {
  const existing = templatesStore.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Template not found' });

  const updated = { ...existing, ...req.body, id: existing.id };
  templatesStore.save(updated);
  res.json({ template: updated });
});

// Delete a template
router.delete('/:id', (req, res) => {
  const removed = templatesStore.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Template not found' });
  res.json({ success: true });
});

module.exports = router;
