/**
 * WhatsApp Chat Widget - Chat conversation display for lead modal
 */
var WhatsAppChat = (function () {
  'use strict';

  var currentPhone = null;
  var currentLeadId = null;
  var pollInterval = null;

  function loadConversation(leadId, phone) {
    currentLeadId = leadId;
    currentPhone = phone;

    var section = document.getElementById('waChatSection');
    var messagesEl = document.getElementById('waChatMessages');
    if (!section || !messagesEl) return;

    section.style.display = '';
    messagesEl.innerHTML = '<div class="wa-empty-hint">Loading...</div>';

    fetchMessages(phone);

    // Poll for new messages every 5 seconds
    stopPolling();
    pollInterval = setInterval(function () {
      fetchMessages(phone);
    }, 5000);
  }

  async function fetchMessages(phone) {
    var messagesEl = document.getElementById('waChatMessages');
    if (!messagesEl) return;

    try {
      var cleanPhone = phone.replace(/[^0-9+]/g, '');
      var res = await fetch('/api/conversations/phone/' + encodeURIComponent(cleanPhone));
      if (res.status === 404) {
        messagesEl.innerHTML = '<div class="wa-empty-hint">No WhatsApp messages yet. Send one below.</div>';
        return;
      }
      var data = await res.json();
      renderMessages(data.conversation.messages || []);
    } catch (err) {
      messagesEl.innerHTML = '<div class="wa-empty-hint">Could not load messages.</div>';
    }
  }

  function renderMessages(messages) {
    var messagesEl = document.getElementById('waChatMessages');
    if (!messagesEl) return;

    if (messages.length === 0) {
      messagesEl.innerHTML = '<div class="wa-empty-hint">No WhatsApp messages yet. Send one below.</div>';
      return;
    }

    messagesEl.innerHTML = '';
    messages.forEach(function (msg) {
      var bubble = document.createElement('div');
      bubble.className = 'wa-chat-bubble wa-chat-bubble--' + (msg.direction === 'outgoing' ? 'sent' : 'received');

      var text = document.createElement('div');
      text.className = 'wa-chat-bubble__text';
      text.textContent = msg.text || '[media]';
      bubble.appendChild(text);

      var meta = document.createElement('div');
      meta.className = 'wa-chat-bubble__meta';

      var time = document.createElement('span');
      time.className = 'wa-chat-bubble__time';
      time.textContent = formatTime(msg.timestamp);
      meta.appendChild(time);

      if (msg.direction === 'outgoing' && msg.status) {
        var status = document.createElement('span');
        status.className = 'wa-chat-bubble__status wa-chat-bubble__status--' + msg.status;
        status.innerHTML = getStatusIcon(msg.status);
        meta.appendChild(status);
      }

      bubble.appendChild(meta);
      messagesEl.appendChild(bubble);
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function getStatusIcon(status) {
    if (status === 'read') return '<svg viewBox="0 0 16 12" width="16" height="12"><path d="M1 6l3 3 7-7" fill="none" stroke="#53bdeb" stroke-width="1.5"/><path d="M4 6l3 3 7-7" fill="none" stroke="#53bdeb" stroke-width="1.5"/></svg>';
    if (status === 'delivered') return '<svg viewBox="0 0 16 12" width="16" height="12"><path d="M1 6l3 3 7-7" fill="none" stroke="#8696a0" stroke-width="1.5"/><path d="M4 6l3 3 7-7" fill="none" stroke="#8696a0" stroke-width="1.5"/></svg>';
    return '<svg viewBox="0 0 12 12" width="12" height="12"><path d="M1 6l3 3 5-5" fill="none" stroke="#8696a0" stroke-width="1.5"/></svg>';
  }

  function formatTime(isoString) {
    if (!isoString) return '';
    try {
      var d = new Date(isoString);
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  async function sendMessage() {
    var input = document.getElementById('waChatInput');
    if (!input) return;

    var text = input.value.trim();
    if (!text || !currentPhone) return;

    input.value = '';
    input.disabled = true;

    try {
      await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: currentPhone,
          text: text,
          leadId: currentLeadId
        })
      });
      fetchMessages(currentPhone);
    } catch (err) {
      console.error('Send failed:', err);
    }

    input.disabled = false;
    input.focus();
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  function hide() {
    stopPolling();
    currentPhone = null;
    currentLeadId = null;
    var section = document.getElementById('waChatSection');
    if (section) section.style.display = 'none';
  }

  // Bind send button
  document.addEventListener('DOMContentLoaded', function () {
    var sendBtn = document.getElementById('btnWaSend');
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);

    var chatInput = document.getElementById('waChatInput');
    if (chatInput) chatInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') sendMessage();
    });
  });

  return {
    loadConversation: loadConversation,
    hide: hide,
    stopPolling: stopPolling
  };
})();
