// DealGod Shared Navigation & Mobile Menu
(function () {
  'use strict';

  /* ================================================================
     MOBILE MENU
  ================================================================ */
  function initMobileMenu() {
    var hamburger = document.getElementById('nav-hamburger');
    var overlay = document.getElementById('mobile-nav-overlay');
    if (!hamburger || !overlay) return;

    function closeMenu() {
      hamburger.classList.remove('active');
      overlay.classList.remove('open');
      document.body.classList.remove('nav-open');
    }

    function openMenu() {
      hamburger.classList.add('active');
      overlay.classList.add('open');
      document.body.classList.add('nav-open');
    }

    hamburger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (overlay.classList.contains('open')) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    // Close when clicking any mobile nav link
    overlay.querySelectorAll('.mobile-nav-link').forEach(function (link) {
      link.addEventListener('click', function () {
        closeMenu();
      });
    });

    // Close when clicking outside the overlay
    document.addEventListener('click', function (e) {
      if (overlay.classList.contains('open') && !e.target.closest('.mobile-nav-overlay') && !e.target.closest('.nav-hamburger')) {
        closeMenu();
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) {
        closeMenu();
      }
    });
  }

  /* ================================================================
     FLOATING DEALS BUTTON (for non-index pages)
  ================================================================ */
  function initFloatingDealsBtn() {
    var isIndex = document.body.classList.contains('page-index') ||
      document.querySelector('#products');
    if (isIndex) return; // index.html has its own top-deals-float-btn + script.js logic

    var existing = document.getElementById('deals-float-btn');
    if (existing) return;

    var btn = document.createElement('a');
    btn.id = 'deals-float-btn';
    btn.className = 'deals-float-btn';
    btn.href = 'index.html#products';
    btn.setAttribute('aria-label', 'View Deals');
    btn.innerHTML = '<span class="deals-float-icon">🔥</span><span class="deals-float-text">Deals</span>';
    document.body.appendChild(btn);
  }

  /* ================================================================
     BACK TO TOP
  ================================================================ */
  function initBackToTop() {
    var btn = document.getElementById('back-to-top');
    if (!btn) return;
    window.addEventListener('scroll', function () {
      btn.style.opacity = window.scrollY > 400 ? '1' : '0';
      btn.style.pointerEvents = window.scrollY > 400 ? 'auto' : 'none';
    });
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initMobileMenu();
      initFloatingDealsBtn();
      initBackToTop();
    });
  } else {
    initMobileMenu();
    initFloatingDealsBtn();
    initBackToTop();
  }
})();
