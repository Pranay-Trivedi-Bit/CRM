const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const whatsappApi = require('../services/whatsapp-api');
const conversationsStore = require('../store/conversations-store');

const router = express.Router();

// Strip everything except digits from a phone number (WhatsApp needs plain digits)
function sanitizePhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
  return cleaned;
}

// Send a text message
router.post('/send', async (req, res) => {
  try {
    const { phone, text, leadId, leadName } = req.body;
    if (!phone || !text) {
      return res.status(400).json({ error: 'phone and text are required' });
    }
    const cleanPhone = sanitizePhone(phone);

    const result = await whatsappApi.sendTextMessage(cleanPhone, text);
    const messageId = result.messages && result.messages[0] ? result.messages[0].id : null;

    // Store outgoing message
    conversationsStore.createOrGet(cleanPhone, leadId, leadName);
    conversationsStore.addMessage(cleanPhone, {
      direction: 'outgoing',
      type: 'text',
      text,
      status: 'sent',
      waMessageId: messageId
    });

    res.json({ success: true, messageId });
  } catch (err) {
    console.error('Send message error:', err.response ? err.response.data : err.message);
    res.status(500).json({ error: err.message });
  }
});

// Send a template message
router.post('/send-template', async (req, res) => {
  try {
    const { phone, templateName, templateParams, leadId, leadName } = req.body;
    if (!phone || !templateName) {
      return res.status(400).json({ error: 'phone and templateName are required' });
    }

    const result = await whatsappApi.sendTemplateMessage(phone, templateName, templateParams || []);
    const messageId = result.messages && result.messages[0] ? result.messages[0].id : null;

    conversationsStore.createOrGet(phone, leadId, leadName);
    conversationsStore.addMessage(phone, {
      direction: 'outgoing',
      type: 'template',
      text: `[Template: ${templateName}]`,
      status: 'sent',
      waMessageId: messageId
    });

    res.json({ success: true, messageId });
  } catch (err) {
    console.error('Send template error:', err.response ? err.response.data : err.message);
    res.status(500).json({ error: err.message });
  }
});

// Send interactive buttons
router.post('/send-interactive', async (req, res) => {
  try {
    const { phone, body, buttons, sections, leadId, leadName } = req.body;
    if (!phone || !body) {
      return res.status(400).json({ error: 'phone and body are required' });
    }

    let result;
    if (buttons) {
      result = await whatsappApi.sendInteractiveButtons(phone, body, buttons);
    } else if (sections) {
      result = await whatsappApi.sendInteractiveList(phone, body, 'Select', sections);
    } else {
      return res.status(400).json({ error: 'buttons or sections are required' });
    }

    const messageId = result.messages && result.messages[0] ? result.messages[0].id : null;

    conversationsStore.createOrGet(phone, leadId, leadName);
    conversationsStore.addMessage(phone, {
      direction: 'outgoing',
      type: 'interactive',
      text: body,
      status: 'sent',
      waMessageId: messageId
    });

    res.json({ success: true, messageId });
  } catch (err) {
    console.error('Send interactive error:', err.response ? err.response.data : err.message);
    res.status(500).json({ error: err.message });
  }
});

// Send a media message (image, video, or document)
router.post('/send-media', async (req, res) => {
  try {
    const { phone, mediaType, mediaUrl, mediaId, caption, filename, leadId, leadName } = req.body;
    if (!phone || (!mediaUrl && !mediaId)) {
      return res.status(400).json({ error: 'phone and mediaUrl (or mediaId) are required' });
    }
    const cleanPhone = sanitizePhone(phone);

    let result;
    switch (mediaType) {
      case 'image':
        result = await whatsappApi.sendImage(cleanPhone, mediaUrl, caption, mediaId);
        break;
      case 'video':
        result = await whatsappApi.sendVideo(cleanPhone, mediaUrl, caption, mediaId);
        break;
      case 'document':
        result = await whatsappApi.sendDocument(cleanPhone, mediaUrl, filename || 'document', mediaId);
        break;
      default:
        return res.status(400).json({ error: 'Invalid mediaType. Use image, video, or document.' });
    }

    const messageId = result.messages && result.messages[0] ? result.messages[0].id : null;

    conversationsStore.createOrGet(cleanPhone, leadId, leadName);
    conversationsStore.addMessage(cleanPhone, {
      direction: 'outgoing',
      type: mediaType,
      text: caption || `[${mediaType}]`,
      status: 'sent',
      waMessageId: messageId
    });

    res.json({ success: true, messageId });
  } catch (err) {
    console.error('Send media error:', err.response ? err.response.data : err.message);
    res.status(500).json({ error: err.message });
  }
});

// Upload media file — accepts base64-encoded data, uploads to WhatsApp Media API.
// Falls back to local file storage when WhatsApp API is not configured (dev mode).
router.post('/upload-media', async (req, res) => {
  try {
    const { data, mimeType, filename } = req.body;
    if (!data || !mimeType) {
      return res.status(400).json({ success: false, error: 'data and mimeType are required' });
    }

    const buffer = Buffer.from(data, 'base64');
    const wa = config.whatsapp;

    if (wa.accessToken && wa.phoneNumberId) {
      // Upload directly to WhatsApp Media API — returns a reusable media ID
      const result = await whatsappApi.uploadMedia(buffer, mimeType, filename || 'upload');
      return res.json({ success: true, mediaId: result.id });
    }

    // Dev fallback: save to data/uploads/ and return a local URL
    const uploadsDir = path.join(__dirname, '..', '..', 'data', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const ext = (filename || 'file').split('.').pop() || mimeType.split('/')[1] || 'bin';
    const safeName = `${Date.now()}_${(filename || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    fs.writeFileSync(path.join(uploadsDir, safeName), buffer);
    res.json({ success: true, url: `/uploads/${safeName}` });
  } catch (err) {
    console.error('Upload media error:', err.response ? err.response.data : err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
