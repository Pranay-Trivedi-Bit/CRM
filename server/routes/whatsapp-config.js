/**
 * WhatsApp Configuration & Status API
 *
 * GET /api/whatsapp/config       — Check WhatsApp API configuration status
 * GET /api/whatsapp/message-log  — Get recent message send log
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
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

/**
 * GET /api/whatsapp/templates — Fetch approved message templates from Meta
 */
router.get('/templates', async (req, res) => {
  const wa = config.whatsapp;
  if (!wa.accessToken || !wa.businessAccountId) {
    return res.json({ templates: [] });
  }
  try {
    const url = `https://graph.facebook.com/${wa.apiVersion}/${wa.businessAccountId}/message_templates`;
    const response = await axios.get(url, {
      params: { fields: 'name,status,components,language', status: 'APPROVED', limit: 100 },
      headers: { 'Authorization': `Bearer ${wa.accessToken}` }
    });
    res.json({ templates: response.data.data || [] });
  } catch (err) {
    console.error('Fetch templates error:', err.response ? err.response.data : err.message);
    res.json({ templates: [], error: err.message });
  }
});

module.exports = router;
