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

async function sendImage(phone, imageUrl, caption, mediaId) {
  const url = `${wa.baseUrl}/messages`;
  const image = mediaId
    ? { id: mediaId, caption: caption || '' }
    : { link: imageUrl, caption: caption || '' };
  const body = { messaging_product: 'whatsapp', to: phone, type: 'image', image };
  const res = await axios.post(url, body, { headers: getHeaders() });
  return res.data;
}

async function sendVideo(phone, videoUrl, caption, mediaId) {
  const url = `${wa.baseUrl}/messages`;
  const video = mediaId
    ? { id: mediaId, caption: caption || '' }
    : { link: videoUrl, caption: caption || '' };
  const body = { messaging_product: 'whatsapp', to: phone, type: 'video', video };
  const res = await axios.post(url, body, { headers: getHeaders() });
  return res.data;
}

async function sendDocument(phone, documentUrl, filename, mediaId) {
  const url = `${wa.baseUrl}/messages`;
  const document = mediaId
    ? { id: mediaId, filename: filename || 'document' }
    : { link: documentUrl, filename: filename || 'document' };
  const body = { messaging_product: 'whatsapp', to: phone, type: 'document', document };
  const res = await axios.post(url, body, { headers: getHeaders() });
  return res.data;
}

// Upload media to WhatsApp Media API and return the media ID.
// Requires Node.js 18+ (uses built-in FormData & Blob).
async function uploadMedia(buffer, mimeType, filename) {
  const uploadUrl = `https://graph.facebook.com/${wa.apiVersion}/${wa.phoneNumberId}/media`;
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append('file', new Blob([buffer], { type: mimeType }), filename);
  const res = await axios.post(uploadUrl, form, {
    headers: { 'Authorization': `Bearer ${wa.accessToken}` }
  });
  return res.data; // { id: 'media-id' }
}

module.exports = {
  sendTextMessage,
  sendTemplateMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  sendImage,
  sendVideo,
  sendDocument,
  uploadMedia
};
