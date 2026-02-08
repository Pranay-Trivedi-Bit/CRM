const axios = require('axios');
const config = require('../config');

const wa = config.whatsapp;

function getHeaders() {
  return {
    'Authorization': `Bearer ${wa.accessToken}`,
    'Content-Type': 'application/json'
  };
}

async function sendTextMessage(phone, text) {
  const url = `${wa.baseUrl}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'text',
    text: { body: text }
  };
  const res = await axios.post(url, body, { headers: getHeaders() });
  return res.data;
}

async function sendTemplateMessage(phone, templateName, params) {
  const url = `${wa.baseUrl}/messages`;
  const components = [];
  if (params && params.length > 0) {
    components.push({
      type: 'body',
      parameters: params.map(p => ({ type: 'text', text: p }))
    });
  }
  const body = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' },
      components
    }
  };
  const res = await axios.post(url, body, { headers: getHeaders() });
  return res.data;
}

async function sendInteractiveButtons(phone, bodyText, buttons) {
  const url = `${wa.baseUrl}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map((btn, i) => ({
          type: 'reply',
          reply: { id: btn.id || `btn_${i}`, title: btn.text.substring(0, 20) }
        }))
      }
    }
  };
  const res = await axios.post(url, body, { headers: getHeaders() });
  return res.data;
}

async function sendInteractiveList(phone, bodyText, buttonLabel, sections) {
  const url = `${wa.baseUrl}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonLabel,
        sections: sections.map(section => ({
          title: section.title,
          rows: section.rows.map(row => ({
            id: row.id,
            title: row.title.substring(0, 24),
            description: (row.description || '').substring(0, 72)
          }))
        }))
      }
    }
  };
  const res = await axios.post(url, body, { headers: getHeaders() });
  return res.data;
}

async function sendImage(phone, imageUrl, caption) {
  const url = `${wa.baseUrl}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'image',
    image: { link: imageUrl, caption: caption || '' }
  };
  const res = await axios.post(url, body, { headers: getHeaders() });
  return res.data;
}

async function sendDocument(phone, documentUrl, filename) {
  const url = `${wa.baseUrl}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'document',
    document: { link: documentUrl, filename: filename || 'document' }
  };
  const res = await axios.post(url, body, { headers: getHeaders() });
  return res.data;
}

module.exports = {
  sendTextMessage,
  sendTemplateMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  sendImage,
  sendDocument
};
