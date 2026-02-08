const express = require('express');
const campaignsStore = require('../store/campaigns-store');
const contactListsStore = require('../store/contact-lists-store');
const templatesStore = require('../store/templates-store');
const emailEventsStore = require('../store/email-events-store');
const emailSender = require('../services/email-sender');
const { resolveCsmForLead } = require('../data/csm-data');

const router = express.Router();

// List all campaigns
router.get('/', (req, res) => {
  const campaigns = campaignsStore.getAll();
  res.json({ campaigns });
});

// Get a single campaign
router.get('/:id', (req, res) => {
  const campaign = campaignsStore.getById(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  res.json({ campaign });
});

// Create a new campaign
router.post('/', (req, res) => {
  const { name, subject, templateId, contactListId } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const campaign = campaignsStore.save({
    name,
    subject: subject || '',
    templateId: templateId || null,
    contactListId: contactListId || null,
    status: 'draft',
    scheduledAt: null,
    sentAt: null,
    stats: { total: 0, sent: 0, opened: 0, clicked: 0, bounced: 0 }
  });
  res.status(201).json({ campaign });
});

// Update a campaign
router.put('/:id', (req, res) => {
  const existing = campaignsStore.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Campaign not found' });

  const updated = { ...existing, ...req.body, id: existing.id };
  campaignsStore.save(updated);
  res.json({ campaign: updated });
});

// Delete a campaign
router.delete('/:id', (req, res) => {
  const removed = campaignsStore.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Campaign not found' });
  emailEventsStore.removeByCampaign(req.params.id);
  res.json({ success: true });
});

/**
 * Send a campaign — resolves CSM email for each lead and sends REAL emails via SMTP.
 * Each email is sent FROM the CSM assigned to that lead.
 * When EMAIL_ENABLED=false, runs in dry-run mode (no real emails sent).
 */
router.post('/:id/send', async (req, res) => {
  const campaign = campaignsStore.getById(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status === 'sent' || campaign.status === 'sending') {
    return res.status(400).json({ error: 'Campaign already sent or in progress' });
  }

  // Get contact list
  const contactList = contactListsStore.getById(campaign.contactListId);
  if (!contactList || !contactList.contacts || contactList.contacts.length === 0) {
    return res.status(400).json({ error: 'No contacts in the selected contact list' });
  }

  // Get template
  const template = campaign.templateId ? templatesStore.getById(campaign.templateId) : null;
  const html = template ? template.htmlContent : '<p>No template selected</p>';
  const subject = campaign.subject || (template ? template.subject : 'No Subject');

  // Mark as sending
  campaign.status = 'sending';
  campaignsStore.save(campaign);

  // Resolve CSM for each contact
  const recipients = contactList.contacts.map(contact => {
    const csm = resolveCsmForLead(contact.email, contact.assignedTo);
    return {
      email: contact.email,
      name: contact.name || '',
      company: contact.company || '',
      csmName: csm ? csm.csmName : 'Unassigned',
      csmEmail: csm ? csm.csmEmail : null
    };
  });

  // Send emails via SMTP (real or dry-run)
  const results = await emailSender.sendBatch(recipients, subject, html);

  // Store real send/bounce events (no fake open/click simulation)
  const events = [];
  const now = new Date();

  results.forEach((result, i) => {
    events.push({
      campaignId: campaign.id,
      email: result.email,
      type: result.success ? 'sent' : 'bounced',
      metadata: {
        messageId: result.messageId,
        from: result.csmEmail || result.from,
        csmName: result.csmName,
        mode: result.mode,
        error: result.error
      },
      timestamp: new Date(now.getTime() + i * 100).toISOString()
    });
  });

  emailEventsStore.addEvents(events);

  // Update campaign stats
  const sentCount = results.filter(r => r.success).length;
  const bouncedCount = results.filter(r => !r.success).length;
  const mode = results.length > 0 ? results[0].mode : 'unknown';

  campaign.status = 'sent';
  campaign.sentAt = now.toISOString();
  campaign.stats = {
    total: results.length,
    sent: sentCount,
    opened: 0,
    clicked: 0,
    bounced: bouncedCount
  };
  campaignsStore.save(campaign);

  // Build send log grouped by CSM
  const csmSendLog = {};
  results.forEach(r => {
    const key = r.csmName || 'Unassigned';
    if (!csmSendLog[key]) {
      csmSendLog[key] = { csmName: key, csmEmail: r.csmEmail || r.from, sent: 0, bounced: 0, leads: [] };
    }
    if (r.success) csmSendLog[key].sent++;
    else csmSendLog[key].bounced++;
    csmSendLog[key].leads.push({ email: r.email, name: r.name, success: r.success, error: r.error });
  });

  res.json({
    campaign,
    resultCount: results.length,
    sentCount,
    bouncedCount,
    mode,
    csmSendLog: Object.values(csmSendLog)
  });
});

module.exports = router;
