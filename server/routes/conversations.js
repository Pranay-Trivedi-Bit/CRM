const express = require('express');
const conversationsStore = require('../store/conversations-store');

const router = express.Router();

// List all conversations
router.get('/', (req, res) => {
  const conversations = conversationsStore.listAll();
  res.json({ conversations });
});

// Get conversation by phone
router.get('/phone/:phone', (req, res) => {
  const conv = conversationsStore.getByPhone(req.params.phone);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  res.json({ conversation: conv });
});

// Get conversation by lead ID
router.get('/lead/:leadId', (req, res) => {
  const all = conversationsStore.listAll();
  const match = all.find(c => c.leadId === req.params.leadId);
  if (!match) return res.status(404).json({ error: 'No conversation for this lead' });

  const conv = conversationsStore.getByPhone(match.phone);
  res.json({ conversation: conv });
});

module.exports = router;
