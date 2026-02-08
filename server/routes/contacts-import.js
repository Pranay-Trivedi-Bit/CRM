const express = require('express');
const contactListsStore = require('../store/contact-lists-store');

const router = express.Router();

// Import contacts
router.post('/', (req, res) => {
  const { contacts, autoAcknowledge, listName } = req.body;

  if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: 'No contacts provided' });
  }

  // Generate IDs for leads
  const now = new Date().toISOString();
  const leads = contacts.map((c, i) => ({
    id: 'lead_' + Date.now() + '_' + Math.random().toString(16).substring(2, 6) + '_' + i,
    name: c.name || '',
    email: c.email || '',
    phone: c.phone || '',
    company: c.company || '',
    jobTitle: c.jobTitle || '',
    location: c.location || '',
    source: c.source || 'Import',
    campaign: c.campaign || '',
    status: c.status || 'New',
    priority: c.priority || 'Cold',
    assignedTo: c.assignedTo || '',
    companySize: c.companySize || '',
    industry: c.industry || '',
    seniority: c.seniority || '',
    createdAt: now,
    updatedAt: now
  }));

  // Save as contact list
  if (listName) {
    const listContacts = leads.map(l => ({
      email: l.email,
      name: l.name,
      company: l.company
    }));

    contactListsStore.save({
      name: listName,
      description: 'Imported on ' + new Date().toLocaleDateString(),
      contacts: listContacts
    });
  }

  // Mock auto-acknowledgement
  let acknowledged = 0;
  if (autoAcknowledge && autoAcknowledge.enabled) {
    leads.forEach(l => {
      if (l.phone) acknowledged++;
    });
  }

  res.json({
    leads,
    count: leads.length,
    acknowledged,
    listName: listName || null
  });
});

module.exports = router;
