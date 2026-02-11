const express = require('express');
const whatsappApi = require('../services/whatsapp-api');
const conversationsStore = require('../store/conversations-store');

const router = express.Router();

// Send a text message
router.post('/send', async (req, res) => {
  try {
    const { phone, text, leadId, leadName } = req.body;
    if (!phone || !text) {
      return res.status(400).json({ error: 'phone and text are required' });
    }

    const result = await whatsappApi.sendTextMessage(phone, text);
    const messageId = result.messages && result.messages[0] ? result.messages[0].id : null;

    // Store outgoing message
    conversationsStore.createOrGet(phone, leadId, leadName);
    conversationsStore.addMessage(phone, {
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
    const { phone, mediaType, mediaUrl, caption, filename, leadId, leadName } = req.body;
    if (!phone || !mediaUrl) {
      return res.status(400).json({ error: 'phone and mediaUrl are required' });
    }

    let result;
    switch (mediaType) {
      case 'image':
        result = await whatsappApi.sendImage(phone, mediaUrl, caption);
        break;
      case 'video':
        result = await whatsappApi.sendVideo(phone, mediaUrl, caption);
        break;
      case 'document':
        result = await whatsappApi.sendDocument(phone, mediaUrl, filename || 'document');
        break;
      default:
        return res.status(400).json({ error: 'Invalid mediaType. Use image, video, or document.' });
    }

    const messageId = result.messages && result.messages[0] ? result.messages[0].id : null;

    conversationsStore.createOrGet(phone, leadId, leadName);
    conversationsStore.addMessage(phone, {
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

module.exports = router;
