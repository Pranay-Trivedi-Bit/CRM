/**
 * Email Sender Service — Real SMTP via nodemailer
 *
 * Supports per-lead CSM sender (from field) — each email is sent FROM the CSM assigned to that lead.
 * Uses a single SMTP connection (authenticated as SMTP_USER) and sets the "From" header to the CSM email.
 *
 * NOTE: For Microsoft 365, the SMTP_USER account must have "Send As" permission for each CSM email.
 *       Alternatively, use a shared mailbox/service account with delegated send permissions.
 *       If "Send As" is not configured, emails will fall back to the default sender.
 *
 * Set EMAIL_ENABLED=true in .env to send real emails.
 * When EMAIL_ENABLED=false, emails are logged but not sent (dry-run mode).
 */

const nodemailer = require('nodemailer');
const config = require('../config');

// Create reusable transporter (connection pool)
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const emailConf = config.email;

  transporter = nodemailer.createTransport({
    host: emailConf.smtpHost,
    port: emailConf.smtpPort,
    secure: emailConf.smtpSecure,            // true for 465, false for STARTTLS (587)
    auth: {
      user: emailConf.smtpUser,
      pass: emailConf.smtpPass
    },
    tls: {
      // Do not fail on invalid certs in development
      rejectUnauthorized: process.env.NODE_ENV === 'production'
    },
    pool: true,                               // Use connection pooling for batch sends
    maxConnections: 5,
    maxMessages: 100,
    rateDelta: 1000,                          // 1 second between batches
    rateLimit: 10                             // Max 10 messages per second
  });

  return transporter;
}

/**
 * Verify SMTP connection is working.
 * Call this at server startup to check credentials.
 */
async function verifyConnection() {
  if (!config.email.enabled) {
    console.log('  Email:         DISABLED (dry-run mode). Set EMAIL_ENABLED=true in .env');
    return { success: true, mode: 'dry-run' };
  }

  if (!config.email.smtpUser || !config.email.smtpPass) {
    console.log('  Email:         NOT CONFIGURED (missing SMTP_USER / SMTP_PASS in .env)');
    return { success: false, error: 'Missing SMTP credentials' };
  }

  try {
    const t = getTransporter();
    await t.verify();
    console.log('  Email:         CONNECTED (' + config.email.smtpHost + ':' + config.email.smtpPort + ')');
    return { success: true, mode: 'live' };
  } catch (err) {
    console.error('  Email:         CONNECTION FAILED —', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send a single email.
 * @param {{ from: string, fromName: string, to: string, subject: string, html: string, replyTo?: string }} opts
 * @returns {{ success: boolean, messageId?: string, from: string, to: string, error?: string, mode: string }}
 */
async function send({ from, fromName, to, subject, html, replyTo }) {
  const emailConf = config.email;
  const senderEmail = from || emailConf.defaultFrom;
  const senderName = fromName || emailConf.defaultFromName || '';
  const fromField = senderName ? `"${senderName}" <${senderEmail}>` : senderEmail;

  // --- DRY-RUN MODE ---
  if (!emailConf.enabled) {
    const fakeId = 'dryrun_' + Date.now() + '_' + Math.random().toString(16).substring(2, 6);
    console.log(`[EMAIL DRY-RUN] To: ${to} | From: ${fromField} | Subject: ${subject}`);
    return {
      success: true,
      messageId: fakeId,
      from: senderEmail,
      to,
      error: null,
      mode: 'dry-run'
    };
  }

  // --- REAL SEND ---
  try {
    const t = getTransporter();
    const mailOptions = {
      from: fromField,
      to: to,
      subject: subject,
      html: html,
    };

    // Add reply-to if provided (CSM email or global config)
    if (replyTo) {
      mailOptions.replyTo = replyTo;
    } else if (emailConf.replyTo) {
      mailOptions.replyTo = emailConf.replyTo;
    } else if (from && from !== emailConf.defaultFrom) {
      // If sending "from" a CSM, set reply-to as the CSM email
      mailOptions.replyTo = from;
    }

    const info = await t.sendMail(mailOptions);

    console.log(`[EMAIL SENT] To: ${to} | From: ${fromField} | MsgId: ${info.messageId}`);
    return {
      success: true,
      messageId: info.messageId,
      from: senderEmail,
      to,
      error: null,
      mode: 'live'
    };
  } catch (err) {
    console.error(`[EMAIL FAILED] To: ${to} | From: ${fromField} | Error: ${err.message}`);
    return {
      success: false,
      messageId: null,
      from: senderEmail,
      to,
      error: err.message,
      mode: 'live'
    };
  }
}

/**
 * Send a batch of personalized emails, each potentially from a different CSM.
 * @param {Array<{ email, name, company, csmEmail, csmName }>} recipients
 * @param {string} subject - Can contain {{name}}, {{company}}, {{csm_name}} placeholders
 * @param {string} html   - Can contain {{name}}, {{company}}, {{csm_name}}, {{csm_email}} placeholders
 * @returns {Array<{ email, name, csmName, csmEmail, success, messageId, error, mode }>}
 */
async function sendBatch(recipients, subject, html) {
  const results = [];

  for (const recipient of recipients) {
    // Personalize per recipient
    const personalizedHtml = html
      .replace(/\{\{name\}\}/g, recipient.name || '')
      .replace(/\{\{email\}\}/g, recipient.email || '')
      .replace(/\{\{company\}\}/g, recipient.company || '')
      .replace(/\{\{csm_name\}\}/g, recipient.csmName || '')
      .replace(/\{\{csm_email\}\}/g, recipient.csmEmail || '');

    const personalizedSubject = subject
      .replace(/\{\{name\}\}/g, recipient.name || '')
      .replace(/\{\{company\}\}/g, recipient.company || '')
      .replace(/\{\{csm_name\}\}/g, recipient.csmName || '');

    const result = await send({
      from: recipient.csmEmail || config.email.defaultFrom,
      fromName: recipient.csmName || config.email.defaultFromName,
      to: recipient.email,
      subject: personalizedSubject,
      html: personalizedHtml
    });

    results.push({
      email: recipient.email,
      name: recipient.name,
      csmName: recipient.csmName || 'Unassigned',
      csmEmail: recipient.csmEmail || config.email.defaultFrom,
      ...result
    });
  }

  return results;
}

/**
 * Get current email configuration status (for the frontend status indicator)
 */
function getStatus() {
  const emailConf = config.email;
  return {
    enabled: emailConf.enabled,
    configured: !!(emailConf.smtpUser && emailConf.smtpPass),
    host: emailConf.smtpHost,
    port: emailConf.smtpPort,
    defaultFrom: emailConf.defaultFrom,
    mode: emailConf.enabled ? 'live' : 'dry-run'
  };
}

module.exports = { send, sendBatch, verifyConnection, getStatus };
