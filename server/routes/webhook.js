const express = require('express');
const config = require('../config');
const flowEngine = require('../services/flow-engine');
const conversationsStore = require('../store/conversations-store');

const router = express.Router();

// GET - WhatsApp webhook verification
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// POST - Receive incoming messages from WhatsApp
router.post('/', async (req, res) => {
  try {
    const body = req.body;

    if (body.object !== 'whatsapp_business_account') {
      return res.sendStatus(404);
    }

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;

        // Handle incoming messages
        if (value.messages) {
          for (const message of value.messages) {
            const phone = message.from;
            const contact = (value.contacts && value.contacts[0]) || {};
            const contactName = contact.profile ? contact.profile.name : '';

            // Store incoming message
            conversationsStore.addMessage(phone, {
              direction: 'incoming',
              type: message.type,
              text: extractMessageText(message),
              waMessageId: message.id,
              contactName
            });

            // Process through flow engine
            await flowEngine.processIncoming(phone, message, contactName);
          }
        }

        // Handle status updates (sent, delivered, read)
        if (value.statuses) {
          for (const status of value.statuses) {
            conversationsStore.updateMessageStatus(
              status.recipient_id,
              status.id,
              status.status
            );
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err);
    res.sendStatus(200); // Always return 200 to avoid retries
  }
});

function extractMessageText(message) {
  switch (message.type) {
    case 'text': return message.text.body;
    case 'button': return message.button.text;
    case 'interactive':
      if (message.interactive.type === 'button_reply') return message.interactive.button_reply.title;
      if (message.interactive.type === 'list_reply') return message.interactive.list_reply.title;
      return '[interactive]';
    case 'image': return '[image]';
    case 'document': return '[document]';
    default: return '[' + message.type + ']';
  }
}

module.exports = router;
