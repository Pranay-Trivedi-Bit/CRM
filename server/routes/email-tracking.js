const express = require('express');
const emailEventsStore = require('../store/email-events-store');

const router = express.Router();

// Get stats for a specific campaign
router.get('/:campaignId/stats', (req, res) => {
  const stats = emailEventsStore.getStats(req.params.campaignId);
  res.json({ stats });
});

// Get all events for a specific campaign
router.get('/:campaignId/events', (req, res) => {
  const events = emailEventsStore.getByCampaign(req.params.campaignId);
  res.json({ events });
});

// Get stats for all campaigns
router.get('/', (req, res) => {
  const allStats = emailEventsStore.getAllStats();
  res.json({ stats: allStats });
});

module.exports = router;
