const express = require('express');
const contactListsStore = require('../store/contact-lists-store');

const router = express.Router();

// List all contact lists
router.get('/', (req, res) => {
  const lists = contactListsStore.getAll();
  res.json({ lists });
});

// Get a single contact list
router.get('/:id', (req, res) => {
  const list = contactListsStore.getById(req.params.id);
  if (!list) return res.status(404).json({ error: 'Contact list not found' });
  res.json({ list });
});

// Create a new contact list
router.post('/', (req, res) => {
  const { name, description, contacts } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const list = contactListsStore.save({
    name,
    description: description || '',
    contacts: contacts || []
  });
  res.status(201).json({ list });
});

// Update a contact list
router.put('/:id', (req, res) => {
  const existing = contactListsStore.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Contact list not found' });

  const updated = { ...existing, ...req.body, id: existing.id };
  contactListsStore.save(updated);
  res.json({ list: updated });
});

// Delete a contact list
router.delete('/:id', (req, res) => {
  const removed = contactListsStore.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Contact list not found' });
  res.json({ success: true });
});

module.exports = router;
