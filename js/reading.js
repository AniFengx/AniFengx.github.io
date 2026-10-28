(function () {
  'use strict';

  if (window.__aniReadingControls) return;
  window.__aniReadingControls = true;

  var previousSearchFocus = null;
  var searchWasOpen = false;

  function getSearchOverlay() {
    return document.querySelector('.search-pop-overlay');
  }

  function isSearchOpen() {
    return document.body.classList.contains('search-active');
  }

  function focusableElements(dialog) {
    return Array.prototype.slice.call(dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
    )).filter(function (element) {
      return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
    });
  }

  function enhanceControls() {
    Array.prototype.forEach.call(document.querySelectorAll('.copy-btn'), function (button) {
      button.setAttribute('tabindex', '0');
      button.setAttribute('role', 'button');
      button.setAttribute('aria-label', '复制代码');
    });
    var searchTriggers = document.querySelectorAll('.popup-trigger');
    Array.prototype.forEach.call(searchTriggers, function (trigger) {
      trigger.setAttribute('tabindex', '0');
      trigger.setAttribute('role', 'button');
      trigger.setAttribute('aria-label', '打开站内搜索');
      trigger.setAttribute('aria-controls', 'site-search-dialog');
      trigger.setAttribute('aria-expanded', String(isSearchOpen()));
    });

    var menuToggle = document.querySelector('.site-nav-toggle .toggle');
    if (menuToggle) {
      menuToggle.setAttribute('tabindex', '0');
      menuToggle.setAttribute('role', 'button');
      menuToggle.setAttribute('aria-label', document.body.classList.contains('site-nav-on') ? '关闭导航菜单' : '打开导航菜单');
      menuToggle.setAttribute('aria-expanded', String(document.body.classList.contains('site-nav-on')));
    }

    var closeButton = document.querySelector('.popup-btn-close');
    if (closeButton) {
      closeButton.setAttribute('tabindex', '0');
      closeButton.setAttribute('role', 'button');
      closeButton.setAttribute('aria-label', '关闭站内搜索');
    }

    var overlay = getSearchOverlay();
    if (overlay) {
      var dialog = overlay.querySelector('.search-popup');
      if (dialog) {
        dialog.id = 'site-search-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', '站内搜索');
      }
      var input = overlay.querySelector('.search-input');
      if (input) input.setAttribute('aria-label', '站内搜索关键词');
    }
  }

  function updateExpandedState() {
    var searchOpen = isSearchOpen();
    Array.prototype.forEach.call(document.querySelectorAll('.popup-trigger'), function (trigger) {
      trigger.setAttribute('aria-expanded', String(searchOpen));
    });

    var menuOpen = document.body.classList.contains('site-nav-on');
    var menuToggle = document.querySelector('.site-nav-toggle .toggle');
    if (menuToggle) {
      menuToggle.setAttribute('aria-expanded', String(menuOpen));
      menuToggle.setAttribute('aria-label', menuOpen ? '关闭导航菜单' : '打开导航菜单');
    }

    if (searchWasOpen && !searchOpen && previousSearchFocus && document.contains(previousSearchFocus)) {
      previousSearchFocus.focus();
      previousSearchFocus = null;
    }
    searchWasOpen = searchOpen;
  }

  document.addEventListener('keydown', function (event) {
    var control = event.target.closest && event.target.closest('.popup-trigger, .site-nav-toggle .toggle, .popup-btn-close, .copy-btn');
    if (control && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      control.click();
      return;
    }

    if (event.key !== 'Tab' || !isSearchOpen()) return;
    var overlay = getSearchOverlay();
    var dialog = overlay && overlay.querySelector('.search-popup');
    if (!dialog) return;
    var focusables = focusableElements(dialog);
    if (!focusables.length) {
      event.preventDefault();
      dialog.setAttribute('tabindex', '-1');
      dialog.focus();
      return;
    }
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  });

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest && event.target.closest('.popup-trigger');
    if (trigger) {
      previousSearchFocus = trigger;
      setTimeout(function () {
        enhanceControls();
        updateExpandedState();
        if (isSearchOpen()) {
          var input = document.querySelector('.search-pop-overlay .search-input');
          if (input) input.focus();
        }
      }, 0);
    }

    var close = event.target.closest && event.target.closest('.popup-btn-close');
    var backdrop = event.target.classList && event.target.classList.contains('search-pop-overlay');
    if (close || backdrop) setTimeout(updateExpandedState, 0);

    if (event.target.closest && event.target.closest('.site-nav-toggle .toggle')) {
      setTimeout(updateExpandedState, 0);
    }
  });

  document.addEventListener('pjax:success', function () {
    enhanceControls();
    updateExpandedState();
  });

  document.addEventListener('DOMContentLoaded', enhanceControls);
  if (document.readyState !== 'loading') enhanceControls();

  new MutationObserver(function () {
    updateExpandedState();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}());
