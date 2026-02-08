/**
 * WhatsApp Module - Main integration with the Sales Dashboard
 * Handles tab switching and WhatsApp Marketing initialization
 */
var WhatsAppModule = (function () {
  'use strict';

  var initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;

    bindTabNavigation();
  }

  function bindTabNavigation() {
    var tabs = document.querySelectorAll('.nav-tab');
    for (var i = 0; i < tabs.length; i++) {
      (function (tab) {
        tab.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          var view = tab.dataset.view;
          switchView(view);
          window.scrollTo(0, 0);
        };
      })(tabs[i]);
    }
  }

  function switchView(view) {
    var tabs = document.querySelectorAll('.nav-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('active', tabs[i].dataset.view === view);
    }

    var dashboard = document.getElementById('dashboardView');
    var whatsapp = document.getElementById('whatsappView');
    var emailMarketing = document.getElementById('emailMarketingView');

    dashboard.style.display = 'none';
    whatsapp.style.display = 'none';
    if (emailMarketing) emailMarketing.style.display = 'none';

    if (view === 'dashboard') {
      dashboard.style.display = '';
      if (typeof WhatsAppChat !== 'undefined') WhatsAppChat.stopPolling();
    } else if (view === 'whatsapp') {
      whatsapp.style.display = '';
      if (typeof WAMarketing !== 'undefined') WAMarketing.init();
    } else if (view === 'emailMarketing') {
      if (emailMarketing) emailMarketing.style.display = '';
      if (typeof EmailModule !== 'undefined') EmailModule.onTabActivated();
    }
  }

  // Load WhatsApp conversation in lead edit modal
  function loadConversationInModal(leadId, phone) {
    if (!phone) return;
    if (typeof WhatsAppChat !== 'undefined') {
      WhatsAppChat.loadConversation(leadId, phone);
    }
  }

  // Open chat for a lead (from table action button)
  function openChat(leadId) {
    switchView('whatsapp');
  }

  return {
    init: init,
    loadConversationInModal: loadConversationInModal,
    openChat: openChat,
    switchView: switchView
  };
})();
