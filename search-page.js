// ============================================================
//  DEALGOD – SEARCH RESULTS PAGE LOGIC
//  Reads ?q= parameter and filters PRODUCTS from data.js
// ============================================================
(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    var queryDisplay = document.getElementById('search-query-display');
    var countDisplay = document.getElementById('search-count-display');
    var grid = document.getElementById('product-grid');
    var emptyState = document.getElementById('empty-state');
    var trendingGrid = document.getElementById('trending-grid');
    var searchInput = document.getElementById('search-input');

    if (!grid || typeof PRODUCTS === 'undefined') return;

    // Get query from URL
    var params = new URLSearchParams(window.location.search);
    var rawQuery = (params.get('q') || '').trim();
    var q = rawQuery.toLowerCase();

    if (queryDisplay) queryDisplay.textContent = rawQuery || '...';
    if (searchInput) searchInput.value = rawQuery;

    // Helpers
    var tag = (typeof SITE_CONFIG !== 'undefined' && SITE_CONFIG.affiliateTag) ? SITE_CONFIG.affiliateTag : 'dealgodteam-21';
    function isValidAffiliateTag(rawTag) {
      var t = String(rawTag || '').trim();
      if (!t) return false;
      if (/\s/.test(t)) return false;
      if (/your[-_ ]?tag/i.test(t)) return false;
      return /^[a-zA-Z0-9-]{3,64}$/.test(t);
    }

    function normalizeAsin(rawAsin) {
      return String(rawAsin || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    function isValidAsin(rawAsin) {
      var a = normalizeAsin(rawAsin);
      return /^[A-Z0-9]{10}$/.test(a) || /^[0-9]{10,13}$/.test(a);
    }

    function buildAffLink(asin, fallbackQuery) {
      var safeAsin = normalizeAsin(asin);
      var q = String(fallbackQuery || '').trim();
      var base = isValidAsin(safeAsin)
        ? ('https://www.amazon.in/dp/' + encodeURIComponent(safeAsin))
        : (q ? ('https://www.amazon.in/s?k=' + encodeURIComponent(q)) : 'https://www.amazon.in/');
      if (isValidAffiliateTag(tag)) {
        return base + '?tag=' + encodeURIComponent(String(tag).trim());
      }
      return base;
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function buildSearchCard(p) {
      var link = buildAffLink(p.asin, p.title);
      var card = document.createElement('div');
      card.className = 'product-card visible';
      card.setAttribute('role', 'listitem');

      // Stars
      var starsStr = '';
      if (p.rating) {
        var full = Math.floor(p.rating);
        for (var i = 0; i < full; i++) starsStr += '★';
        if (p.rating % 1 >= 0.3) starsStr += '★';
        for (var j = full + (p.rating % 1 >= 0.3 ? 1 : 0); j < 5; j++) starsStr += '☆';
      }

      var badgeHtml = p.badge ? '<span class="card-badge">' + escapeHtml(p.badge) + '</span>' : '';

      card.innerHTML =
        '<div class="card-image-wrap">' +
          '<img class="card-image" data-src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.title) + '" loading="lazy" referrerpolicy="no-referrer" />' +
          badgeHtml +
          '<span class="card-discount">-' + escapeHtml(p.discount) + '</span>' +
        '</div>' +
        '<div class="card-body">' +
          '<div class="card-meta">' +
            '<span class="card-category">' + escapeHtml(p.category) + '</span>' +
          '</div>' +
          '<h2 class="card-title">' + escapeHtml(p.title) + '</h2>' +
          '<p class="card-desc">' + escapeHtml(p.description) + '</p>' +
          '<div class="card-rating">' +
            '<div class="stars">' + starsStr + '</div> ' +
            '<span class="rating-score">' + (p.rating || '') + '</span>' +
            '<span class="rating-count">(' + (p.reviews ? p.reviews.toLocaleString('en-IN') : '0') + ' reviews)</span>' +
          '</div>' +
          '<div class="card-price">' +
            '<span class="price-current">' + escapeHtml(p.price) + '</span>' +
            (p.originalPrice ? '<span class="price-original">' + escapeHtml(p.originalPrice) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="card-footer">' +
          '<a href="' + escapeHtml(link) + '" target="_blank" rel="noopener noreferrer sponsored" class="btn-buy">' +
            '<span class="btn-buy-icon">🛒</span> View on Amazon' +
          '</a>' +
        '</div>';

      // Lazy-load image with fade-in
      var img = card.querySelector('.card-image');
      if (img) {
        var realSrc = img.getAttribute('data-src');
        var newImg = new Image();
        newImg.referrerPolicy = 'no-referrer';
        newImg.onload = function() {
          img.src = realSrc;
          img.classList.add('loaded');
        };
        newImg.onerror = function() {
          img.src = 'https://placehold.co/400x260/1e1e2a/555575?text=' + encodeURIComponent(String(p.title || 'Product').slice(0, 20));
          img.classList.add('loaded');
        };
        newImg.src = realSrc;
      }

      return card;
    }

    // Filter products
    function searchProducts(query) {
      if (!query) return [];
      var terms = query.split(/\s+/);
      return PRODUCTS.filter(function(p) {
        var haystack = (
          p.title + ' ' + p.description + ' ' + p.category + ' ' + (p.badge || '') + ' ' + (p.asin || '')
        ).toLowerCase();
        return terms.every(function(term) {
          return haystack.indexOf(term) !== -1;
        });
      });
    }

    var results = searchProducts(q);

    if (results.length > 0) {
      if (countDisplay) countDisplay.textContent = results.length + ' deal' + (results.length !== 1 ? 's' : '') + ' found for "' + rawQuery + '"';
      results.forEach(function(p) { grid.appendChild(buildSearchCard(p)); });
    } else {
      if (countDisplay) countDisplay.textContent = rawQuery ? 'No deals found for "' + rawQuery + '"' : 'Enter a search term above';
      if (emptyState) emptyState.style.display = 'block';
      if (trendingGrid) {
        var trending = PRODUCTS.slice().sort(function(a, b) { return (b.dealScore || 0) - (a.dealScore || 0); }).slice(0, 12);
        if (trending.length > 0) {
          trendingGrid.style.display = 'grid';
          trending.forEach(function(p) { trendingGrid.appendChild(buildSearchCard(p)); });
        }
      }
    }

    // Handle new search from this page
    var searchForm = document.getElementById('global-search-form');
    if (searchForm) {
      searchForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var newQ = searchInput.value.trim();
        if (newQ) window.location.href = 'search.html?q=' + encodeURIComponent(newQ);
      });
    }
  });
})();
