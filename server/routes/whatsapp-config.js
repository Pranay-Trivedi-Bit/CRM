/**
 * WhatsApp Configuration & Status API
 *
 * GET /api/whatsapp/config       — Check WhatsApp API configuration status
 * GET /api/whatsapp/message-log  — Get recent message send log
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const router = express.Router();

/**
 * GET /api/whatsapp/config — Returns WhatsApp API configuration status (no secrets exposed)
 */
router.get('/config', (req, res) => {
  const wa = config.whatsapp;
  res.json({
    configured: !!(wa.accessToken && wa.phoneNumberId),
    hasAccessToken: !!wa.accessToken,
    hasPhoneNumberId: !!wa.phoneNumberId,
    phoneNumberId: wa.phoneNumberId ? '...' + wa.phoneNumberId.slice(-4) : '',
    apiVersion: wa.apiVersion,
    brandName: wa.brandName || 'Koenig Solutions'
  });
});

/**
 * GET /api/whatsapp/message-log — Returns recent WhatsApp message send log
 */
router.get('/message-log', (req, res) => {
  try {
    const logFile = path.join(config.dataDir, 'wa-message-log.json');
    if (!fs.existsSync(logFile)) {
      return res.json({ logs: [] });
    }
    const logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    // Return last 50 entries
    res.json({ logs: logs.slice(-50) });
  } catch (err) {
    res.json({ logs: [] });
  }
});

module.exports = router;
