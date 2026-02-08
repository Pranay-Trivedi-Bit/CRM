/**
 * Direct Email Send API — /api/email
 *
 * Provides real-time email sending endpoints used by the Email Marketing frontend.
 * Bypasses the campaign/contact-list abstraction for direct, immediate sending.
 *
 * POST /api/email/send        — Send a single email (auto-acknowledge)
 * POST /api/email/send-batch  — Send multiple emails (bulk send)
 * GET  /api/email/status      — Get SMTP connection status
 * POST /api/email/test        — Send a test email to verify SMTP works
 */

const express = require('express');
const emailSender = require('../services/email-sender');
const emailEventsStore = require('../store/email-events-store');
const { resolveCsmForLead } = require('../data/csm-data');

const router = express.Router();

/**
 * GET /api/email/status — Check if email is configured & connected
 */
router.get('/status', (req, res) => {
  const status = emailSender.getStatus();
  res.json(status);
});

/**
 * POST /api/email/test — Send a test email to verify SMTP is working
 * Body: { to: "test@example.com" }
 */
router.post('/test', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'to is required' });

  const result = await emailSender.send({
    to,
    subject: 'Koenig Solutions — Email Test',
    html: `<div style="font-family:Arial,sans-serif;padding:30px;background:#f4f4f7;">
      <div style="max-width:500px;margin:0 auto;background:#fff;border-radius:8px;padding:30px;text-align:center;">
        <h2 style="color:#6366f1;">Email Configuration Verified</h2>
        <p style="color:#555;">This test email confirms that the Sales Dashboard email integration is working correctly.</p>
        <p style="color:#999;font-size:12px;">Sent at ${new Date().toISOString()}</p>
      </div>
    </div>`
  });

  res.json(result);
});

/**
 * POST /api/email/send — Send a single personalized email
 * Used by auto-acknowledge feature.
 *
 * Body: {
 *   to:         "lead@example.com",
 *   name:       "John Doe",            // lead name (for personalization)
 *   company:    "Acme Corp",           // lead company
 *   assignedTo: "Rimpy Srivastava",   // CSM name (to resolve sender email)
 *   subject:    "Thank you, {{name}}!",
 *   html:       "<p>Hi {{name}}...</p>",
 *   templateId: "tmpl_..."             // optional — if provided, fetch html from template
 * }
 */
router.post('/send', async (req, res) => {
  const { to, name, company, assignedTo, subject, html, templateId } = req.body;

  if (!to) return res.status(400).json({ error: 'to (recipient email) is required' });
  if (!subject) return res.status(400).json({ error: 'subject is required' });

  // Resolve CSM
  const csm = resolveCsmForLead(to, assignedTo);
  const csmName = csm ? csm.csmName : (assignedTo || 'Koenig Solutions');
  const csmEmail = csm ? csm.csmEmail : null;

  // Get template HTML if templateId provided
  let emailHtml = html || '<p>Thank you for your interest in Koenig Solutions.</p>';
  if (templateId) {
    try {
      const templatesStore = require('../store/templates-store');
      const template = templatesStore.getById(templateId);
      if (template && template.htmlContent) {
        emailHtml = template.htmlContent;
      }
    } catch (e) { /* use provided html */ }
  }

  // Personalize subject + body
  const personalizedSubject = subject
    .replace(/\{\{name\}\}/g, name || '')
    .replace(/\{\{company\}\}/g, company || '')
    .replace(/\{\{csm_name\}\}/g, csmName);

  const personalizedHtml = emailHtml
    .replace(/\{\{name\}\}/g, name || '')
    .replace(/\{\{email\}\}/g, to || '')
    .replace(/\{\{company\}\}/g, company || '')
    .replace(/\{\{csm_name\}\}/g, csmName)
    .replace(/\{\{csm_email\}\}/g, csmEmail || '');

  // Send the email
  const result = await emailSender.send({
    from: csmEmail || undefined,
    fromName: csmName || undefined,
    to,
    subject: personalizedSubject,
    html: personalizedHtml
  });

  // Store event
  try {
    emailEventsStore.addEvent({
      campaignId: 'direct_' + Date.now(),
      email: to,
      type: result.success ? 'sent' : 'bounced',
      metadata: {
        messageId: result.messageId,
        from: result.from,
        csmName: csmName,
        subject: personalizedSubject,
        mode: result.mode,
        error: result.error
      }
    });
  } catch (e) { /* don't fail if event store has issues */ }

  res.json({
    success: result.success,
    messageId: result.messageId,
    from: result.from,
    to: result.to,
    csmName: csmName,
    csmEmail: csmEmail || result.from,
    mode: result.mode,
    error: result.error
  });
});

/**
 * POST /api/email/send-batch — Send personalized emails to multiple recipients
 * Used by bulk send feature. Each email is sent from the assigned CSM.
 *
 * Body: {
 *   contacts: [
 *     { email: "...", name: "...", company: "...", assignedTo: "CSM Name" }
 *   ],
 *   subject:    "...",
 *   html:       "...",
 *   templateId: "tmpl_..."   // optional
 * }
 */
router.post('/send-batch', async (req, res) => {
  const { contacts, subject, html, templateId } = req.body;

  if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: 'contacts array is required' });
  }
  if (!subject) return res.status(400).json({ error: 'subject is required' });

  // Get template HTML if templateId provided
  let emailHtml = html || '<p>Thank you for your interest in Koenig Solutions.</p>';
  if (templateId && !html) {
    try {
      const templatesStore = require('../store/templates-store');
      const template = templatesStore.getById(templateId);
      if (template && template.htmlContent) {
        emailHtml = template.htmlContent;
      }
    } catch (e) { /* use provided html */ }
  }

  // Resolve CSM for each contact and build recipients
  const recipients = contacts.map(contact => {
    const csm = resolveCsmForLead(contact.email, contact.assignedTo);
    return {
      email: contact.email,
      name: contact.name || '',
      company: contact.company || '',
      csmName: csm ? csm.csmName : (contact.assignedTo || 'Unassigned'),
      csmEmail: csm ? csm.csmEmail : null
    };
  });

  // Send batch
  const results = await emailSender.sendBatch(recipients, subject, emailHtml);

  // Store events
  const campaignId = 'batch_' + Date.now();
  const events = results.map(r => ({
    campaignId,
    email: r.email,
    type: r.success ? 'sent' : 'bounced',
    metadata: {
      messageId: r.messageId,
      from: r.from || r.csmEmail,
      csmName: r.csmName,
      mode: r.mode,
      error: r.error
    }
  }));

  try {
    emailEventsStore.addEvents(events);
  } catch (e) { /* don't fail if event store has issues */ }

  // Build CSM send log
  const csmSendLog = {};
  results.forEach(r => {
    const key = r.csmName || 'Unassigned';
    if (!csmSendLog[key]) {
      csmSendLog[key] = { csmName: key, csmEmail: r.csmEmail || r.from, sent: 0, failed: 0, leads: [] };
    }
    if (r.success) csmSendLog[key].sent++;
    else csmSendLog[key].failed++;
    csmSendLog[key].leads.push({
      email: r.email,
      name: r.name,
      success: r.success,
      error: r.error
    });
  });

  const totalSent = results.filter(r => r.success).length;
  const totalFailed = results.filter(r => !r.success).length;
  const mode = results.length > 0 ? results[0].mode : 'unknown';

  res.json({
    total: results.length,
    sent: totalSent,
    failed: totalFailed,
    mode: mode,
    csmSendLog: Object.values(csmSendLog),
    results: results
  });
});

module.exports = router;
