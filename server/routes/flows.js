const express = require('express');
const flowsStore = require('../store/flows-store');
const flowEngine = require('../services/flow-engine');

const router = express.Router();

// List all flows
router.get('/', (req, res) => {
  const flows = flowsStore.getAll();
  res.json({ flows });
});

// Get a single flow
router.get('/:id', (req, res) => {
  const flow = flowsStore.getById(req.params.id);
  if (!flow) return res.status(404).json({ error: 'Flow not found' });
  res.json({ flow });
});

// Create a new flow
router.post('/', (req, res) => {
  const { name, nodes, connections } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const flow = flowsStore.save({
    name,
    description: req.body.description || '',
    isActive: false,
    nodes: nodes || [],
    connections: connections || []
  });
  res.status(201).json({ flow });
});

// Update a flow
router.put('/:id', (req, res) => {
  const existing = flowsStore.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Flow not found' });

  const updated = { ...existing, ...req.body, id: existing.id };
  flowsStore.save(updated);
  res.json({ flow: updated });
});

// Delete a flow
router.delete('/:id', (req, res) => {
  const removed = flowsStore.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Flow not found' });
  res.json({ success: true });
});

// Activate a flow
router.post('/:id/activate', (req, res) => {
  const flow = flowsStore.getById(req.params.id);
  if (!flow) return res.status(404).json({ error: 'Flow not found' });

  flowsStore.setActive(req.params.id);
  res.json({ success: true });
});

// Test a flow with a mock message
router.post('/:id/test', async (req, res) => {
  const flow = flowsStore.getById(req.params.id);
  if (!flow) return res.status(404).json({ error: 'Flow not found' });

  const { message } = req.body;
  const responses = flowEngine.simulateFlow(flow, message || 'hi');
  res.json({ responses });
});

module.exports = router;
