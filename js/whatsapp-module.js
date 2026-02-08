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
    bindHamburgerMenu();
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
          closeHamburger();
          window.scrollTo(0, 0);
        };
      })(tabs[i]);
    }
  }

  function bindHamburgerMenu() {
    var hamburger = document.getElementById('navHamburger');
    var overlay = document.getElementById('navOverlay');
    if (!hamburger) return;

    hamburger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleHamburger();
    });

    if (overlay) {
      overlay.addEventListener('click', function () {
        closeHamburger();
      });
    }

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeHamburger();
    });

    // Move right-side items (user info, logout) into drawer on mobile
    setupMobileDrawerItems();
    window.addEventListener('resize', setupMobileDrawerItems);
  }

  var _drawerItemsMoved = false;
  var _origRightParent = null;
  var _origRightNextSibling = null;
  var _userInfoObserver = null;
  var _applyingFirstName = false;

  function applyFirstNameOnly() {
    var userInfo = document.getElementById('headerUserInfo');
    if (!userInfo || !_drawerItemsMoved) return;
    _applyingFirstName = true;
    var fullText = userInfo.textContent;
    if (fullText) {
      userInfo.setAttribute('data-full-text', fullText);
      var firstName = fullText.split(' ')[0] || fullText;
      userInfo.textContent = firstName;
    }
    _applyingFirstName = false;
  }

  function setupMobileDrawerItems() {
    var navLeft = document.querySelector('.nav-bar__left');
    var navRight = document.querySelector('.nav-bar__right');
    if (!navLeft || !navRight) return;

    var isMobile = window.innerWidth <= 768;

    if (isMobile && !_drawerItemsMoved) {
      // Remember original position
      _origRightParent = navRight.parentNode;
      _origRightNextSibling = navRight.nextSibling;
      // Move into drawer at the bottom
      navLeft.appendChild(navRight);
      navRight.classList.add('nav-bar__right--in-drawer');

      // Show only first name in mobile drawer
      applyFirstNameOnly();

      // Watch for text changes (login sets user info after drawer setup)
      var userInfo = document.getElementById('headerUserInfo');
      if (userInfo && !_userInfoObserver) {
        _userInfoObserver = new MutationObserver(function() {
          if (!_applyingFirstName) applyFirstNameOnly();
        });
        _userInfoObserver.observe(userInfo, { childList: true, characterData: true, subtree: true });
      }

      _drawerItemsMoved = true;
    } else if (!isMobile && _drawerItemsMoved) {
      // Move back to original position
      if (_origRightParent) {
        if (_origRightNextSibling) {
          _origRightParent.insertBefore(navRight, _origRightNextSibling);
        } else {
          _origRightParent.appendChild(navRight);
        }
      }
      navRight.classList.remove('nav-bar__right--in-drawer');

      // Stop observing and restore full user info text
      if (_userInfoObserver) {
        _userInfoObserver.disconnect();
        _userInfoObserver = null;
      }
      var userInfo = document.getElementById('headerUserInfo');
      if (userInfo && userInfo.getAttribute('data-full-text')) {
        userInfo.textContent = userInfo.getAttribute('data-full-text');
      }

      _drawerItemsMoved = false;
    }
  }

  function toggleHamburger() {
    var hamburger = document.getElementById('navHamburger');
    var navLeft = document.querySelector('.nav-bar__left');
    var overlay = document.getElementById('navOverlay');
    if (!hamburger || !navLeft) return;

    var isOpen = hamburger.classList.contains('open');
    if (isOpen) {
      closeHamburger();
    } else {
      hamburger.classList.add('open');
      hamburger.setAttribute('aria-expanded', 'true');
      navLeft.classList.add('open');
      if (overlay) overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeHamburger() {
    var hamburger = document.getElementById('navHamburger');
    var navLeft = document.querySelector('.nav-bar__left');
    var overlay = document.getElementById('navOverlay');

    if (hamburger) {
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    }
    if (navLeft) navLeft.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
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
