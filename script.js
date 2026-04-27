// ============================================================
//  DEALGOD – MAIN SCRIPT (Professional Edition)
//  Security · Validation · Features · Performance
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Prefer runtime-loaded catalog data if available.
  // Falls back to the globals defined in `data.js`.
  let PRODUCTS = window.PRODUCTS;
  let CATEGORIES = window.CATEGORIES;

  /* ================================================================
     SECURITY: Input Sanitization
  ================================================================ */
  function sanitize(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function safeText(value, fallback = '') {
    return typeof value === 'string' ? value : (value == null ? fallback : String(value));
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function isSafeHttpUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }

  /* ================================================================
     SECURITY: Safe localStorage wrapper
  ================================================================ */
  const safeStorage = {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        const parsed = JSON.parse(raw);
        return parsed;
      } catch {
        console.warn(`[DealGod] Failed to read localStorage key: ${key}`);
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        console.warn(`[DealGod] Failed to write localStorage key: ${key}`);
        return false;
      }
    }
  };

  const safeSession = {
    get(key, fallback = null) {
      try {
        const raw = sessionStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch {
        console.warn(`[DealGod] Failed to read sessionStorage key: ${key}`);
        return fallback;
      }
    },
    set(key, value) {
      try {
        sessionStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        console.warn(`[DealGod] Failed to write sessionStorage key: ${key}`);
        return false;
      }
    }
  };

  /* ================================================================
     DATA VALIDATION
  ================================================================ */
  function validateProducts(products) {
    const errors = [];
    const ids = new Set();

    if (!Array.isArray(products) || products.length === 0) {
      console.error('[DealGod] PRODUCTS array is empty or not defined.');
      return false;
    }

    products.forEach((p, i) => {
      const prefix = `Product #${i + 1} (${p.title || 'untitled'})`;

      // Required fields
      ['id', 'title', 'price', 'originalPrice', 'discount', 'category', 'rating', 'asin'].forEach(field => {
        if (p[field] === undefined || p[field] === null || p[field] === '') {
          errors.push(`${prefix}: Missing required field "${field}"`);
        }
      });

      // Duplicate IDs
      if (ids.has(p.id)) {
        errors.push(`${prefix}: Duplicate ID ${p.id}`);
      }
      ids.add(p.id);

      // Rating range
      if (typeof p.rating === 'number' && (p.rating < 0 || p.rating > 5)) {
        errors.push(`${prefix}: Rating ${p.rating} out of range (0-5)`);
      }

      // Price sanity check
      const sale = parsePrice(p.price);
      const orig = parsePrice(p.originalPrice);
      if (sale > 0 && orig > 0 && sale > orig) {
        errors.push(`${prefix}: Sale price ₹${sale} > original ₹${orig}`);
      }

      // ASIN format (10 alphanumeric chars)
      if (p.asin && !/^[A-Z0-9]{10}$/i.test(p.asin)) {
        // Some ASINs are ISBNs, allow those too
        if (!/^[0-9]{10,13}$/.test(p.asin)) {
          errors.push(`${prefix}: Suspicious ASIN format "${p.asin}"`);
        }
      }

      // Category exists
      if (typeof CATEGORIES !== 'undefined' && !CATEGORIES.includes(p.category)) {
        errors.push(`${prefix}: Category "${p.category}" not in CATEGORIES list`);
      }
    });

    // Affiliate tag check
    if (!isValidAffiliateTag(SITE_CONFIG?.affiliateTag)) {
      console.warn('[DealGod] Affiliate tag is missing/invalid. Update SITE_CONFIG.affiliateTag before going live.');
    }

    if (errors.length > 0) {
      console.warn(`[DealGod] Data validation found ${errors.length} issue(s):`);
      errors.forEach(e => console.warn(`  ⚠ ${e}`));
    } else {
      console.log(`[DealGod] ✅ All ${products.length} products validated successfully.`);
    }

    return errors.length === 0;
  }

  /* ================================================================
     DOM REFERENCES
  ================================================================ */
  const grid        = document.getElementById('product-grid');
  const emptyState  = document.getElementById('empty-state');
  const countEl     = document.getElementById('products-count');
  const searchInput = document.getElementById('search-input');
  const filterChips = document.querySelectorAll('.filter-chip');
  const sortSelect  = document.getElementById('sort-select');
  const backToTop   = document.getElementById('back-to-top');
  const toastCont   = document.getElementById('toast-container');
  const priceChips  = document.querySelectorAll('.price-chip');

  /* ================================================================
     STATE
  ================================================================ */
  let activeCategory = 'All';
  let searchQuery    = '';
  let sortMode       = 'default';
  let activePriceRange = 'all';
  let wishlist       = safeStorage.get('dealgod-wishlist', []);
  let recentlyViewed = safeStorage.get('dealgod-recent', []);
  let compareList    = safeSession.get('dealgod-compare-list', []);

  // Validate wishlist is array
  if (!Array.isArray(wishlist)) wishlist = [];
  if (!Array.isArray(recentlyViewed)) recentlyViewed = [];
  if (!Array.isArray(compareList)) compareList = [];

  /* ================================================================
     PRICE PARSER
  ================================================================ */
  function parsePrice(str) {
    return parseFloat(String(str).replace(/[^0-9.]/g, '')) || 0;
  }

  function parseDiscount(str) {
    return parseFloat(String(str).replace(/[^0-9.]/g, '')) || 0;
  }

  /* ================================================================
     PRICE RANGE FILTER
  ================================================================ */
  const PRICE_RANGES = {
    'all':        { min: 0,     max: Infinity, label: 'All Prices' },
    'under500':   { min: 0,     max: 500,      label: 'Under ₹500' },
    '500-2000':   { min: 500,   max: 2000,     label: '₹500 – ₹2,000' },
    '2000-5000':  { min: 2000,  max: 5000,     label: '₹2,000 – ₹5,000' },
    '5000-10000': { min: 5000,  max: 10000,    label: '₹5,000 – ₹10,000' },
    '10000+':     { min: 10000, max: Infinity,  label: '₹10,000+' },
  };

  /* ================================================================
     FILTER + SORT PIPELINE
  ================================================================ */
  function getFilteredSorted() {
    let list = PRODUCTS.filter(p => {
      // Category filter
      const matchCat = activeCategory === 'All' || p.category === activeCategory;

      // Search filter (sanitized)
      const q = searchQuery;
      const matchSearch = !q ||
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);

      // Price range filter
      const price = parsePrice(p.price);
      const range = PRICE_RANGES[activePriceRange];
      const matchPrice = price >= range.min && price < range.max;

      // Deal expiry filter
      if (p.dealEnds) {
        const endTime = new Date(p.dealEnds).getTime();
        if (endTime < Date.now()) return false; // hide expired deals
      }

      return matchCat && matchSearch && matchPrice;
    });

    // Sort
    switch (sortMode) {
      case 'price-low':
        list.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
        break;
      case 'price-high':
        list.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
        break;
      case 'rating':
        list.sort((a, b) => b.rating - a.rating);
        break;
      case 'discount':
        list.sort((a, b) => parseDiscount(b.discount) - parseDiscount(a.discount));
        break;
      default:
        break;
    }

    return list;
  }

  /* ================================================================
     RENDER PRODUCTS
  ================================================================ */
  function renderProducts() {
    try {
      const filtered = getFilteredSorted();

      grid.innerHTML = '';

      if (filtered.length === 0) {
        emptyState.classList.add('visible');
        grid.style.display = 'none';
        countEl.innerHTML = 'Showing <strong>0</strong> products';
        return;
      }

      emptyState.classList.remove('visible');
      grid.style.display = '';
      countEl.innerHTML = `Showing <strong>${filtered.length}</strong> product${filtered.length !== 1 ? 's' : ''}`;

      filtered.forEach(product => {
        const card = buildCard(product);
        grid.appendChild(card);
      });

      // Intersection Observer for staggered entrance
      observeCards();

      // Call search fallback logic
      if (typeof window.handleSearchFallback === 'function') {
        window.handleSearchFallback(filtered.length);
      }
    } catch (err) {
      console.error('renderProducts failed:', err);
      countEl.innerHTML = 'Showing <strong>0</strong> products';
      emptyState.classList.add('visible');
      grid.style.display = 'none';
    }
  }

  /* ================================================================
     INTERSECTION OBSERVER (Performance)
  ================================================================ */
  const cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        cardObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.05, rootMargin: '50px' });

  function observeCards() {
    const cards = grid.querySelectorAll('.product-card');
    cards.forEach((c, i) => {
      c.style.transitionDelay = `${i * 40}ms`;
      cardObserver.observe(c);
    });
  }

  /* ================================================================
     BUILD PRODUCT CARD
  ================================================================ */
  function buildCard(product) {
    const affLink    = buildAffLink(product.asin, product.title);
    const card       = document.createElement('article');
    card.className   = 'product-card';
    card.dataset.id  = product.id;
    card.setAttribute('role', 'listitem');
    const safeTitle = safeText(product.title, 'Untitled');
    const safeRating = safeNumber(product.rating, 0);
    const safeReviews = safeNumber(product.reviews, 0);

    const badgeHtml  = product.badge
      ? `<span class="card-badge badge-${slugify(product.badge)}">${escapeHtml(product.badge)}</span>`
      : '';

    const stars      = buildStars(safeRating);
    const wishlisted = wishlist.includes(product.id);

    // Countdown timer HTML
    let countdownHtml = '';
    if (product.dealEnds) {
      const endTime = new Date(product.dealEnds).getTime();
      if (endTime > Date.now()) {
        countdownHtml = `<div class="card-countdown" data-ends="${product.dealEnds}">⏰ <span class="countdown-text">Loading...</span></div>`;
      }
    }

    const bankOfferHtml = product.bankOffer
      ? `<div class="card-bank-offer">💳 ${escapeHtml(product.bankOffer)}</div>`
      : '';

    const priceHistoryHtml = product.priceHistory
      ? `<div class="card-price-history">📉 ${escapeHtml(product.priceHistory)}</div>`
      : '';

    const dealScoreHtml = product.dealScore
      ? `<div class="card-deal-score">
           <button class="score-up" aria-label="Upvote deal">🔥</button>
           <span class="score-val">${product.dealScore}</span>
           <button class="score-down" aria-label="Downvote deal">🧊</button>
         </div>`
      : '';

    const couponHtml = product.couponCode
      ? `<div class="card-coupon" data-code="${escapeHtml(product.couponCode)}" data-link="${affLink}" title="Click to copy & open">
           <span class="coupon-icon">✂️</span>
           <span class="coupon-text">${escapeHtml(product.couponCode)}</span>
           <span class="coupon-action">COPY</span>
         </div>`
      : '';

    card.innerHTML = `
      <div class="card-image-wrap">
        <img
          class="card-image"
          data-src="${escapeHtml(product.image)}"
          alt="${escapeHtml(safeTitle)}"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
        />
        ${badgeHtml}
        <span class="card-discount">-${escapeHtml(product.discount)}</span>
      </div>
      <div class="card-body">
        <div class="card-meta">
          <span class="card-category">${escapeHtml(product.category)}</span>
          ${dealScoreHtml}
        </div>
        <h2 class="card-title">${escapeHtml(safeTitle)}</h2>
        <p class="card-desc">${escapeHtml(product.description)}</p>
        <div class="card-rating">
          <div class="stars" aria-label="Rating: ${safeRating} out of 5">${stars}</div>
          <span class="rating-score">${safeRating}</span>
          <span class="rating-count">(${safeReviews.toLocaleString('en-IN')} reviews)</span>
        </div>
        ${bankOfferHtml}
        <div class="card-price">
          <span class="price-current">${escapeHtml(product.price)}</span>
          <span class="price-original">${escapeHtml(product.originalPrice)}</span>
        </div>
        ${priceHistoryHtml}
        ${countdownHtml}
        ${couponHtml}
      </div>
      <div class="card-footer">
        <a
          href="${affLink}"
          target="_blank"
          rel="noopener noreferrer sponsored"
          class="btn-buy"
          id="buy-btn-${product.id}"
          aria-label="Buy ${escapeHtml(safeTitle)} on Amazon"
          data-product-id="${product.id}"
        >
          <span class="btn-buy-icon">🛒</span>
          View on Amazon
        </a>
        <button
          class="btn-share"
          aria-label="Share deal"
          data-product-id="${product.id}"
        >
          <span class="btn-share-icon">🔗</span>
          Share
        </button>
        <button
          class="btn-copy"
          aria-label="Copy product link"
          data-copy-link="${affLink}"
        >
          <span class="btn-copy-icon">�</span>
          Copy Link
        </button>
        <button
          class="compare-check ${compareList.includes(product.id) ? 'checked' : ''}"
          data-product-id="${product.id}"
          aria-label="Compare product"
          title="Add to comparison"
        >🔄</button>
        <button
          class="btn-alert"
          data-product-id="${product.id}"
          data-product-title="${escapeHtml(safeTitle)}"
          aria-label="Set Price Drop Alert"
          title="Alert me if price drops"
        >🔔</button>
        <button
          class="btn-wishlist ${wishlisted ? 'wishlisted' : ''}"
          id="wish-btn-${product.id}"
          aria-label="${wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}"
          data-product-id="${product.id}"
        >${wishlisted ? '❤️' : '🤍'}</button>
      </div>
    `;

    /* Lazy-load image with fade-in and fallback */
    const img = card.querySelector('.card-image');
    const realSrc = img.dataset.src;

    const tempImg = new Image();
    tempImg.referrerPolicy = 'no-referrer';
    tempImg.onload = () => {
      img.src = realSrc;
      img.classList.add('loaded');
    };
    tempImg.onerror = () => {
      img.src = `https://placehold.co/400x260/1e1e2a/555575?text=${encodeURIComponent(safeTitle.slice(0, 20))}`;
      img.classList.add('loaded');
    };
    tempImg.src = realSrc;

    /* Wishlist toggle */
    card.querySelector('.btn-wishlist').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleWishlist(product.id, card.querySelector('.btn-wishlist'));
    });

    /* Share button */
    card.querySelector('.btn-share').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showShareMenu(product, card.querySelector('.btn-share'));
    });

    /* Compare button */
    card.querySelector('.compare-check').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleCompare(product.id);
    });

    /* Copy link button */
    const copyBtn = card.querySelector('[data-copy-link]');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const link = copyBtn.getAttribute('data-copy-link');
        if (navigator.clipboard) {
          navigator.clipboard.writeText(link).then(() => showToast('📋', 'Link copied to clipboard'));
        } else {
          const ta = document.createElement('textarea');
          ta.value = link; ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); document.body.removeChild(ta);
          showToast('📋', 'Link copied to clipboard');
        }
      });
    }

    /* Track recently viewed on buy click */
    card.querySelector('.btn-buy').addEventListener('click', () => {
      trackRecentlyViewed(product.id);
    });

    /* Coupon click to copy and open */
    const couponEl = card.querySelector('.card-coupon');
    if (couponEl) {
      couponEl.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const code = couponEl.dataset.code;
        const link = couponEl.dataset.link;
        navigator.clipboard.writeText(code).then(() => {
          couponEl.classList.add('copied');
          const actionBtn = couponEl.querySelector('.coupon-action');
          if (actionBtn) actionBtn.textContent = 'COPIED!';
          showToast('✂️', `Copied code: ${code}`);
          setTimeout(() => {
            window.open(link, '_blank', 'noopener');
          }, 800);
        }).catch(() => {
          showToast('⚠️', 'Failed to copy code');
        });
      });
    }

    /* Alert button */
    card.querySelector('.btn-alert').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openAlertModal(product.title);
    });

    /* Deal Score Voting (Mock) */
    const scoreUp = card.querySelector('.score-up');
    const scoreDown = card.querySelector('.score-down');
    const scoreVal = card.querySelector('.score-val');
    if (scoreUp && scoreDown && scoreVal) {
      let voted = false;
      let currentScore = product.dealScore;
      scoreUp.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        if(!voted) { currentScore++; scoreVal.textContent = currentScore; voted = true; scoreUp.style.opacity = '0.5'; scoreDown.style.opacity = '0.5'; showToast('🔥', 'You voted this deal HOT!'); }
      });
      scoreDown.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        if(!voted) { currentScore--; scoreVal.textContent = currentScore; voted = true; scoreUp.style.opacity = '0.5'; scoreDown.style.opacity = '0.5'; showToast('🧊', 'You voted this deal COLD.'); }
      });
    }

    return card;
  }

  /* ================================================================
     AFFILIATE LINK BUILDER
  ================================================================ */
  function isValidAffiliateTag(tag) {
    const normalized = safeText(tag).trim();
    if (!normalized) return false;
    if (/\s/.test(normalized)) return false;
    if (/your[-_ ]?tag/i.test(normalized)) return false;
    return /^[a-zA-Z0-9-]{3,64}$/.test(normalized);
  }

  function normalizeAsin(asin) {
    return safeText(asin).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function isValidAsin(rawAsin) {
    const a = normalizeAsin(rawAsin);
    return /^[A-Z0-9]{10}$/.test(a) || /^[0-9]{10,13}$/.test(a);
  }

  function buildAffLink(asin, fallbackQuery = '') {
    const safeAsin = normalizeAsin(asin);
    const tag = safeText(SITE_CONFIG?.affiliateTag).trim();
    const validTag = isValidAffiliateTag(tag);
    const hasValidAsin = isValidAsin(safeAsin);
    const q = safeText(fallbackQuery).trim();
    const base = hasValidAsin
      ? `https://www.amazon.in/dp/${encodeURIComponent(safeAsin)}`
      : (q ? `https://www.amazon.in/s?k=${encodeURIComponent(q)}` : 'https://www.amazon.in/');

    if (validTag) {
      return `${base}?tag=${encodeURIComponent(tag)}&linkCode=ogi&th=1&psc=1`;
    }
    return base;
  }

  /* ================================================================
     STAR RATINGS
  ================================================================ */
  function buildStars(rating) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
      if (i <= Math.floor(rating)) {
        html += `<span class="star filled" aria-hidden="true">★</span>`;
      } else if (i - rating < 1 && i - rating > 0) {
        html += `<span class="star half" aria-hidden="true">★</span>`;
      } else {
        html += `<span class="star" aria-hidden="true">☆</span>`;
      }
    }
    return html;
  }

  /* ================================================================
     WISHLIST
  ================================================================ */
  function toggleWishlist(productId, btn) {
    const idx = wishlist.indexOf(productId);
    if (idx === -1) {
      wishlist.push(productId);
      btn.classList.add('wishlisted');
      btn.textContent = '❤️';
      btn.setAttribute('aria-label', 'Remove from wishlist');
      showToast('❤️', 'Added to wishlist!');
    } else {
      wishlist.splice(idx, 1);
      btn.classList.remove('wishlisted');
      btn.textContent = '🤍';
      btn.setAttribute('aria-label', 'Add to wishlist');
      showToast('🤍', 'Removed from wishlist');
    }
    safeStorage.set('dealgod-wishlist', wishlist);
  }

  /* ================================================================
     SHARE DEALS
  ================================================================ */
  function showShareMenu(product, btn) {
    // Remove existing menus
    document.querySelectorAll('.share-menu').forEach(m => m.remove());

    const affLink = buildAffLink(product.asin);
    const text = `🔥 Check out this deal!\n${product.title}\n💰 ${product.price} (${product.discount} off)\n`;

    const menu = document.createElement('div');
    menu.className = 'share-menu';
    menu.innerHTML = `
      <button class="share-option" data-action="whatsapp">
        <span>💬</span> WhatsApp
      </button>
      <button class="share-option" data-action="twitter">
        <span>🐦</span> Twitter
      </button>
      <button class="share-option" data-action="copy">
        <span>📋</span> Copy Link
      </button>
    `;

    // Position near button
    btn.style.position = 'relative';
    btn.appendChild(menu);

    // Handle clicks
    menu.addEventListener('click', (e) => {
      const action = e.target.closest('.share-option')?.dataset.action;
      if (!action) return;

      switch (action) {
        case 'whatsapp':
          window.open(`https://wa.me/?text=${encodeURIComponent(text + affLink)}`, '_blank', 'noopener');
          showToast('💬', 'Opening WhatsApp...');
          break;
        case 'twitter':
          window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(affLink)}`, '_blank', 'noopener');
          showToast('🐦', 'Opening Twitter...');
          break;
        case 'copy':
          navigator.clipboard.writeText(affLink).then(() => {
            showToast('📋', 'Link copied to clipboard!');
          }).catch(() => {
            showToast('⚠️', 'Could not copy link');
          });
          break;
      }
      menu.remove();
    });

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function closeMenu(ev) {
        if (!menu.contains(ev.target)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 10);
  }

  /* ================================================================
     RECENTLY VIEWED
  ================================================================ */
  function trackRecentlyViewed(productId) {
    recentlyViewed = recentlyViewed.filter(id => id !== productId);
    recentlyViewed.unshift(productId);
    if (recentlyViewed.length > 6) recentlyViewed = recentlyViewed.slice(0, 6);
    safeStorage.set('dealgod-recent', recentlyViewed);
    renderRecentlyViewed();
  }

  function renderRecentlyViewed() {
    const container = document.getElementById('recently-viewed');
    const scroller  = document.getElementById('recent-scroller');
    if (!container || !scroller) return;

    if (recentlyViewed.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = '';
    scroller.innerHTML = '';

    recentlyViewed.forEach(id => {
      const product = PRODUCTS.find(p => p.id === id);
      if (!product) return;

      const card = document.createElement('a');
      card.className = 'recent-card';
      card.href = buildAffLink(product.asin);
      card.target = '_blank';
      card.rel = 'noopener noreferrer sponsored';
      card.innerHTML = `
        <div class="recent-img-wrap">
          <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://placehold.co/80x80/1e1e2a/555575?text=No+Image';" />
        </div>
        <p class="recent-title">${escapeHtml(product.title.slice(0, 35))}${product.title.length > 35 ? '…' : ''}</p>
        <span class="recent-price">${escapeHtml(product.price)}</span>
      `;
      scroller.appendChild(card);
    });
  }

  /* ================================================================
     DEAL COUNTDOWN TIMERS
  ================================================================ */
  function updateCountdowns() {
    const countdowns = document.querySelectorAll('.card-countdown');
    countdowns.forEach(el => {
      const endsStr = el.dataset.ends;
      if (!endsStr) return;
      const endsTime = new Date(endsStr).getTime();
      const now = Date.now();
      const diff = endsTime - now;

      if (diff <= 0) {
        el.innerHTML = '⏰ <span class="countdown-text countdown-expired">Deal Expired</span>';
        const cb = el.closest('.card-body');
        if (cb && cb.querySelector('.heat-progress')) {
          cb.querySelector('.heat-progress').style.width = '100%';
          cb.querySelector('.heat-progress').style.background = 'var(--accent-red)';
        }
        return;
      }

      // Progress bar heat map logic
      const totalMs = 48 * 60 * 60 * 1000; // Assume 48h total duration for demo
      let percent = 100 - ((diff / totalMs) * 100);
      if (percent < 0) percent = 0;
      if (percent > 100) percent = 100;

      const cardBody = el.closest('.card-body');
      if (cardBody) {
          let heatMap = cardBody.querySelector('.heat-map');
          if (!heatMap) {
             heatMap = document.createElement('div');
             heatMap.className = 'heat-map';
             heatMap.innerHTML = '<div class="heat-progress"></div>';
             el.parentNode.insertBefore(heatMap, el.nextSibling);
          }
          const bar = heatMap.querySelector('.heat-progress');
          bar.style.width = percent + '%';
          if (percent > 80) bar.style.background = 'var(--accent-red)';
          else if (percent > 50) bar.style.background = 'var(--accent-gold)';
          else bar.style.background = 'var(--accent-green)';
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins  = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs  = Math.floor((diff % (1000 * 60)) / 1000);

      let timeStr = '';
      if (hours > 0) timeStr += `${hours}h `;
      timeStr += `${mins}m ${secs}s`;

      const txt = el.querySelector('.countdown-text');
      if(txt) txt.textContent = `Ends in ${timeStr}`;

      if (diff < 2 * 60 * 60 * 1000) {
        el.classList.add('countdown-urgent');
      }
    });
  }

  /* ================================================================
     TOAST NOTIFICATION
  ================================================================ */
  function showToast(icon, message, duration = 2500) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span>${icon}</span><span>${sanitize(message)}</span>`;
    toastCont.appendChild(t);
    setTimeout(() => {
      t.classList.add('leaving');
      setTimeout(() => t.remove(), 350);
    }, duration);
  }

  /* ================================================================
     SEARCH (debounced + sanitized)
  ================================================================ */
  // Search is now handled globally via form submission to search.html

  /* ================================================================
     CATEGORY FILTER
  ================================================================ */
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-pressed', 'false');
      });
      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');
      activeCategory = chip.dataset.category;
      localStorage.setItem('dg_filter_category', activeCategory);
      renderProducts();
    });
  });

  /* ================================================================
     PRICE RANGE FILTER
  ================================================================ */
  priceChips.forEach(chip => {
    chip.addEventListener('click', () => {
      priceChips.forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-pressed', 'false');
      });
      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');
      activePriceRange = chip.dataset.range;
      localStorage.setItem('dg_filter_price', activePriceRange);
      renderProducts();
    });
  });

  /* ================================================================
     SORT
  ================================================================ */
  sortSelect.addEventListener('change', () => {
    sortMode = sortSelect.value;
    localStorage.setItem('dg_filter_sort', sortMode);
    renderProducts();
  });

  /* ================================================================
     BACK TO TOP + SCROLL PROGRESS
  ================================================================ */
  const scrollProgress = document.getElementById('scroll-progress');

  window.addEventListener('scroll', () => {
    // Back to top button
    backToTop.classList.toggle('visible', window.scrollY > 450);

    // Scroll progress bar
    if (scrollProgress) {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      scrollProgress.style.width = progress + '%';
    }

    // Active nav link highlighting
    updateActiveNavLink();
  }, { passive: true });

  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ================================================================
     ACTIVE NAV LINK HIGHLIGHTING
  ================================================================ */
  function updateActiveNavLink() {
    const sections = ['hero', 'why-section', 'products'];
    const navLinks = document.querySelectorAll('.nav-link');
    const scrollPos = window.scrollY + 120;

    let current = '';
    sections.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.offsetTop <= scrollPos) {
        current = id;
      }
    });

    navLinks.forEach(link => {
      const href = link.getAttribute('href').replace('#', '');
      link.classList.toggle('active', href === current);
    });
  }

  /* ================================================================
     ANIMATED HERO COUNTERS
  ================================================================ */
  const counterEls = document.querySelectorAll('.hero-stat-value[data-target]');
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counterEls.forEach(el => counterObserver.observe(el));

  function animateCounter(el) {
    const target   = parseFloat(el.dataset.target);
    const suffix   = el.dataset.suffix || '';
    const isFloat  = !Number.isInteger(target);
    const duration = 1600;
    const start    = performance.now();

    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const ease     = 1 - Math.pow(1 - progress, 3);
      const value    = target * ease;
      el.textContent = (isFloat ? value.toFixed(1) : Math.round(value)) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ================================================================
     COOKIE CONSENT
  ================================================================ */
  function initCookieConsent() {
    const consent = safeStorage.get('dealgod-cookie-consent', null);
    if (consent !== null) return; // already consented

    const banner = document.getElementById('cookie-banner');
    if (!banner) return;
    banner.classList.add('visible');

    const acceptBtn = document.getElementById('cookie-accept');
    if (acceptBtn) {
      acceptBtn.addEventListener('click', () => {
        safeStorage.set('dealgod-cookie-consent', true);
        banner.classList.remove('visible');
        banner.classList.add('hiding');
        setTimeout(() => banner.remove(), 400);
      });
    }
  }

  /* ================================================================
     KEYBOARD NAVIGATION
  ================================================================ */
  document.addEventListener('keydown', (e) => {
    // Escape closes share menus
    if (e.key === 'Escape') {
      document.querySelectorAll('.share-menu').forEach(m => m.remove());
    }

    // "/" focuses search
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  /* ================================================================
     UTILITIES
  ================================================================ */
  function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  /* ================================================================
     DARK/LIGHT MODE TOGGLE
  ================================================================ */
  function initThemeToggle() {
    const toggle = document.getElementById('theme-toggle');
    const icon = document.getElementById('theme-icon');
    if (!toggle) return;

    const saved = safeStorage.get('dealgod-theme', 'dark');
    document.documentElement.setAttribute('data-theme', saved);
    icon.textContent = saved === 'light' ? '☀️' : '🌙';

    toggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      icon.textContent = next === 'light' ? '☀️' : '🌙';
      safeStorage.set('dealgod-theme', next);
      showToast(next === 'light' ? '☀️' : '🌙', `${next === 'light' ? 'Light' : 'Dark'} mode activated`);
    });
  }

  /* ================================================================
     PRODUCT COMPARISON
  ================================================================ */
  const MAX_COMPARE = 3;

  function toggleCompare(productId) {
    const idx = compareList.indexOf(productId);
    if (idx === -1) {
      if (compareList.length >= MAX_COMPARE) {
        showToast('⚠️', `Max ${MAX_COMPARE} products to compare`);
        return;
      }
      compareList.push(productId);
      showToast('🔄', 'Added to comparison');
    } else {
      compareList.splice(idx, 1);
      showToast('🔄', 'Removed from comparison');
    }
    updateCompareUI();
    safeSession.set('dealgod-compare-list', compareList);
  }

  function updateCompareUI() {
    const floatBtn = document.getElementById('compare-float-btn');
    const countEl = document.getElementById('compare-count');
    if (!floatBtn) return;

    if (compareList.length > 0) {
      floatBtn.style.display = 'flex';
      countEl.textContent = compareList.length;
    } else {
      floatBtn.style.display = 'none';
    }

    // Update checkbox states
    document.querySelectorAll('.compare-check').forEach(cb => {
      const pid = parseInt(cb.dataset.productId);
      cb.classList.toggle('checked', compareList.includes(pid));
    });
  }

  function openCompareModal() {
    if (compareList.length < 2) {
      showToast('⚠️', 'Select at least 2 products to compare');
      return;
    }

    const modal = document.getElementById('compare-modal');
    const body = document.getElementById('compare-body');
    if (!modal || !body) return;

    const products = compareList.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);

    // Find best values for highlighting
    const prices = products.map(p => parsePrice(p.price));
    const ratings = products.map(p => p.rating);
    const discounts = products.map(p => parseDiscount(p.discount));
    const minPrice = Math.min(...prices);
    const maxRating = Math.max(...ratings);
    const maxDiscount = Math.max(...discounts);

    body.innerHTML = `
      <div class="compare-grid" style="grid-template-columns: repeat(${products.length}, 1fr);">
        ${products.map((p, i) => `
          <div class="compare-col">
            <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" class="compare-img" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://placehold.co/120x120/1e1e2a/555575?text=No+Image';" />
            <h3 class="compare-name">${escapeHtml(p.title)}</h3>
            <div class="compare-row">
              <span class="compare-label">Price</span>
              <span class="compare-val ${prices[i] === minPrice ? 'best' : ''}">${escapeHtml(p.price)}</span>
            </div>
            <div class="compare-row">
              <span class="compare-label">Original</span>
              <span class="compare-val">${escapeHtml(p.originalPrice)}</span>
            </div>
            <div class="compare-row">
              <span class="compare-label">Discount</span>
              <span class="compare-val ${discounts[i] === maxDiscount ? 'best' : ''}">${escapeHtml(p.discount)} off</span>
            </div>
            <div class="compare-row">
              <span class="compare-label">Rating</span>
              <span class="compare-val ${ratings[i] === maxRating ? 'best' : ''}">${p.rating} ★</span>
            </div>
            <div class="compare-row">
              <span class="compare-label">Reviews</span>
              <span class="compare-val">${p.reviews.toLocaleString()}</span>
            </div>
            <div class="compare-row">
              <span class="compare-label">Category</span>
              <span class="compare-val">${escapeHtml(p.category)}</span>
            </div>
            <a href="${buildAffLink(p.asin)}" target="_blank" rel="noopener noreferrer sponsored" class="btn-buy compare-buy">View on Amazon</a>
          </div>
        `).join('')}
      </div>
    `;

    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');

    const relatedScroller = document.getElementById('related-scroller');
    const relatedWrap = document.getElementById('compare-related');
    if (relatedScroller && relatedWrap) {
      const cats = [...new Set(products.map(p => p.category))];
      const related = PRODUCTS.filter(p => cats.includes(p.category) && !compareList.includes(p.id))
                              .sort(() => 0.5 - Math.random())
                              .slice(0, 4);
      
      if (related.length > 0) {
        relatedWrap.style.display = 'block';
        relatedScroller.innerHTML = '';
        related.forEach(p => {
          const card = document.createElement('a');
          card.className = 'recent-card';
          card.href = buildAffLink(p.asin);
          card.target = '_blank';
          card.innerHTML = `
            <div class="recent-img-wrap">
              <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://placehold.co/80x80/1e1e2a/555575?text=No+Image';" />
            </div>
            <p class="recent-title">${escapeHtml(p.title.slice(0, 35))}...</p>
            <span class="recent-price">${escapeHtml(p.price)}</span>
          `;
          relatedScroller.appendChild(card);
        });
      } else {
        relatedWrap.style.display = 'none';
      }
    }
  }

  // Close modal
  document.getElementById('compare-close')?.addEventListener('click', () => {
    document.getElementById('compare-modal').classList.remove('visible');
    document.getElementById('compare-modal').setAttribute('aria-hidden', 'true');
  });

  document.getElementById('compare-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'compare-modal') {
      e.target.classList.remove('visible');
      e.target.setAttribute('aria-hidden', 'true');
    }
  });

  document.getElementById('compare-float-btn')?.addEventListener('click', openCompareModal);

  /* ================================================================
     MEGA SALE BANNER
  ================================================================ */
  function setupMegaSaleBanner() {
    const banner = document.getElementById('mega-sale-banner');
    const closeBtn = document.getElementById('mega-sale-close');
    if (!banner || !closeBtn) return;
    
    if (safeStorage.get('dealgod-megasale-dismissed')) {
      banner.style.display = 'none';
    } else {
      banner.style.display = 'flex';
    }

    closeBtn.addEventListener('click', () => {
      banner.style.display = 'none';
      safeStorage.set('dealgod-megasale-dismissed', true);
    });
  }

  /* ================================================================
     PRICE DROP ALERT MODAL
  ================================================================ */
  // Attached to window so inline onclick could work, but we use event listener in buildCard
  window.openAlertModal = function(productTitle) {
    const modal = document.getElementById('alert-modal');
    const nameEl = document.getElementById('alert-product-name');
    if (!modal || !nameEl) return;
    nameEl.textContent = productTitle;
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
  };

  function setupAlertModal() {
    const modal = document.getElementById('alert-modal');
    const closeBtn = document.getElementById('alert-close');
    const form = document.getElementById('alert-form');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('visible');
        modal.setAttribute('aria-hidden', 'true');
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target.id === 'alert-modal') {
          modal.classList.remove('visible');
          modal.setAttribute('aria-hidden', 'true');
        }
      });
    }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const priceInput = document.getElementById('alert-target-price');
        const contactInput = document.getElementById('alert-contact');
        const targetPrice = safeNumber(priceInput?.value, 0);
        const contact = safeText(contactInput?.value).trim();
        const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
        const validTelegram = /^@?[a-zA-Z0-9_]{5,32}$/.test(contact);

        if (!targetPrice || targetPrice < 1) {
          showToast('⚠️', 'Enter a valid target price');
          return;
        }
        if (!validEmail && !validTelegram) {
          showToast('⚠️', 'Enter a valid email or Telegram username');
          return;
        }

        const alerts = Array.isArray(safeStorage.get('dealgod-alerts', []))
          ? safeStorage.get('dealgod-alerts', [])
          : [];
        alerts.push({
          product: safeText(document.getElementById('alert-product-name')?.textContent, 'Product'),
          targetPrice,
          contact,
          createdAt: Date.now()
        });
        safeStorage.set('dealgod-alerts', alerts);
        showToast('✅', 'Alert set successfully! We will notify you.');
        form.reset();
        modal.classList.remove('visible');
        modal.setAttribute('aria-hidden', 'true');
      });
    }
  }

  /* ================================================================
     AI GIFT FINDER
  ================================================================ */
  function setupGiftFinder() {
    const form = document.getElementById('gift-finder-form');
    const resultsWrap = document.getElementById('gf-results-wrap');
    const resultsGrid = document.getElementById('gf-results-grid');
    if (!form || !resultsWrap || !resultsGrid) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const recipient = safeText(document.getElementById('gf-recipient')?.value).trim();
      const occasion = safeText(document.getElementById('gf-occasion')?.value).trim();
      const budget = safeText(document.getElementById('gf-budget')?.value).trim();
      if (!recipient || !occasion || !budget) {
        showToast('⚠️', 'Please select recipient, occasion, and budget');
        return;
      }
      let maxPrice = Infinity;
      if (budget === 'under500') maxPrice = 500;
      else if (budget === 'under2000') maxPrice = 2000;
      else if (budget === 'under5000') maxPrice = 5000;
      else if (budget === 'under10000') maxPrice = 10000;

      const validProducts = PRODUCTS.filter(p => parsePrice(p.price) <= maxPrice);
      const shuffled = [...validProducts].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, 3);

      resultsGrid.innerHTML = '';
      if (selected.length === 0) {
        resultsGrid.innerHTML = '<p style="color:var(--text-muted)">No matching gifts found. Try a different category!</p>';
      } else {
        selected.forEach(p => {
          const card = buildCard(p);
          card.classList.add('visible');
          card.style.transitionDelay = '0ms';
          const footer = card.querySelector('.card-footer');
          if (footer) footer.style.justifyContent = 'center';
          const checks = card.querySelectorAll('.compare-check, .btn-wishlist, .btn-share, .btn-alert');
          checks.forEach(c => c.style.display = 'none');
          resultsGrid.appendChild(card);
        });
      }
      resultsWrap.style.display = 'block';
      resultsWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  /* ================================================================
     FOMO POPUPS (MOCK)
  ================================================================ */
  function setupFOMOPopups() {
    const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Pune', 'Chennai', 'Kolkata'];
    
    setInterval(() => {
      if (Math.random() > 0.4) {
        const randomProduct = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
        const randomCity = cities[Math.floor(Math.random() * cities.length)];
        showToast('🛒', `Someone from ${randomCity} just bought ${randomProduct.title.slice(0, 20)}...`, 4000);
      }
    }, 18000); // Check every 18 seconds
  }

  /* ================================================================
     PUSH NOTIFICATIONS (MOCK)
  ================================================================ */
  function setupPushNotificationsMock() {
    if (safeStorage.get('dealgod-push-asked')) return;

    setTimeout(() => {
      const allowed = confirm("🔔 DealGod wants to send you Push Notifications for Flash Deals. Allow?");
      safeStorage.set('dealgod-push-asked', true);
      if (allowed) {
        showToast('✅', 'Push notifications enabled!');
      }
    }, 8000);
  }

  /* ================================================================
     TOP DEALS FLOATING POPUP
  ================================================================ */
  function setupTopDealsPopup() {
    var floatBtn = document.getElementById('top-deals-float-btn');
    var popup = document.getElementById('top-deals-popup');
    var closeBtn = document.getElementById('top-deals-popup-close');
    var listEl = document.getElementById('top-deals-popup-list');
    if (!floatBtn || !popup || !listEl) return;

    // Populate list
    var topDeals = PRODUCTS.slice().sort(function(a, b) { return (b.dealScore || 0) - (a.dealScore || 0); }).slice(0, 5);
    listEl.innerHTML = topDeals.map(function(p, i) {
      var link = buildAffLink(p.asin);
      var image = isSafeHttpUrl(p.image) ? p.image : 'https://placehold.co/80x80/1e1e2a/555575?text=Deal';
      var title = safeText(p.title).length > 35 ? safeText(p.title).slice(0, 35) + '...' : safeText(p.title);
      return '<a href="' + escapeHtml(link) + '" target="_blank" rel="noopener noreferrer sponsored" class="popup-deal-item">' +
        '<span class="popup-deal-rank">#' + (i + 1) + '</span>' +
        '<img src="' + escapeHtml(image) + '" alt="" class="popup-deal-img" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'https://placehold.co/80x80/1e1e2a/555575?text=Deal\';" />' +
        '<div class="popup-deal-info">' +
          '<div class="popup-deal-title">' + escapeHtml(title) + '</div>' +
          '<div class="popup-deal-price">' + escapeHtml(safeText(p.price)) + ' <span class="popup-deal-discount">-' + escapeHtml(safeText(p.discount)) + '</span></div>' +
        '</div>' +
      '</a>';
    }).join('');

    floatBtn.addEventListener('click', function() {
      popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
    });
    if (closeBtn) {
      closeBtn.addEventListener('click', function() { popup.style.display = 'none'; });
    }
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.top-deals-popup') && !e.target.closest('.top-deals-float-btn')) {
        popup.style.display = 'none';
      }
    });
  }

  /* ================================================================
     SEARCH AUTOCOMPLETE (inside IIFE)
  ================================================================ */
  function initSearchLogic() {
    var si = document.getElementById('search-input');
    var sd = document.getElementById('search-autocomplete');
    if (!si || !sd) return;
    var searchTimer;

    si.addEventListener('input', function(e) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function() {
        var q = e.target.value.toLowerCase().trim();
        if (!q) { sd.style.display = 'none'; renderProducts(); return; }

        // Live filter the product grid too
        currentSearchQuery = q;
        renderProducts();

        var matches = PRODUCTS.filter(function(p) {
          return p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
        }).slice(0, 5);

        if (matches.length === 0) {
          sd.innerHTML = '<div style="padding:12px; color:var(--text-muted); font-size:0.85rem;">No suggestions found</div>';
        } else {
          sd.innerHTML = matches.map(function(p) {
            return '<a href="' + buildAffLink(p.asin) + '" target="_blank" rel="noopener noreferrer sponsored" class="autocomplete-item">' +
              '<img src="' + escapeHtml(p.image) + '" alt="" width="36" height="36" style="object-fit:contain; border-radius:6px; background:#fff; padding:2px;" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'https://placehold.co/36x36/1e1e2a/555575?text=D\';" />' +
              '<div style="flex:1; min-width:0;">' +
                '<div style="font-size:0.85rem; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHtml(p.title.slice(0, 40)) + '</div>' +
                '<div style="font-size:0.78rem; color:var(--accent-green); font-weight:600;">' + escapeHtml(p.price) + ' <span style="text-decoration:line-through; color:var(--text-muted); font-size:0.7rem;">' + escapeHtml(p.originalPrice) + '</span></div>' +
              '</div>' +
            '</a>';
          }).join('');
        }
        sd.style.display = 'block';
      }, 120);
    });

    document.addEventListener('click', function(e) {
      if (!e.target.closest('.nav-search')) { sd.style.display = 'none'; }
    });
  }

  /* ================================================================
     SEARCH FALLBACK (for search.html)
  ================================================================ */
  window.handleSearchFallback = function(filteredLength) {
    var isSearchPage = window.location.pathname.includes('search.html');
    if (!isSearchPage) return;
    var countDisplay = document.getElementById('search-count-display');
    var trendingGrid = document.getElementById('trending-grid');
    if (countDisplay) countDisplay.textContent = 'Found ' + filteredLength + ' result(s)';
    if (filteredLength === 0) {
      if (trendingGrid) {
        trendingGrid.style.display = 'grid';
        var topFallback = PRODUCTS.slice().sort(function(a,b) { return (b.dealScore||0) - (a.dealScore||0); }).slice(0, 6);
        trendingGrid.innerHTML = '';
        topFallback.forEach(function(p) { trendingGrid.appendChild(buildCard(p)); });
        observeCards();
      }
    } else {
      if (trendingGrid) trendingGrid.style.display = 'none';
    }
  };

  /* ================================================================
     HAMBURGER MOBILE MENU
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

    hamburger.addEventListener('click', function(e) {
      e.stopPropagation();
      overlay.classList.contains('open') ? closeMenu() : openMenu();
    });

    overlay.querySelectorAll('.mobile-nav-link').forEach(function(link) {
      link.addEventListener('click', function() { closeMenu(); });
    });

    document.addEventListener('click', function(e) {
      if (overlay.classList.contains('open') && !e.target.closest('.mobile-nav-overlay') && !e.target.closest('.nav-hamburger')) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) closeMenu();
    });
  }

  /* ================================================================
     INIT
  ================================================================ */
  async function loadCatalogIfPresent() {
    try {
      const res = await fetch('/catalog.json', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.products) && data.products.length > 0) PRODUCTS = data.products;
      if (Array.isArray(data?.categories) && data.categories.length > 0) CATEGORIES = data.categories;
    } catch {
      // ignore - keep fallback globals from data.js
    }
  }

  function injectAnalytics() {
    const a = SITE_CONFIG?.analytics;
    if (!a || !a.provider) return;

    if (a.provider === 'plausible' && a.domain) {
      const s = document.createElement('script');
      s.defer = true;
      s.setAttribute('data-domain', a.domain);
      s.src = 'https://plausible.io/js/script.js';
      document.head.appendChild(s);
      return;
    }

    if (a.provider === 'ga4' && a.measurementId) {
      const s1 = document.createElement('script');
      s1.async = true;
      s1.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(a.measurementId)}`;
      const s2 = document.createElement('script');
      s2.textContent =
        `window.dataLayer = window.dataLayer || [];` +
        `function gtag(){dataLayer.push(arguments);}` +
        `gtag('js', new Date());` +
        `gtag('config', '${String(a.measurementId).replace(/'/g, "\\'")}');`;
      document.head.appendChild(s1);
      document.head.appendChild(s2);
    }
  }

  (async function boot() {
    await loadCatalogIfPresent();

    validateProducts(PRODUCTS);
    if (!isValidAffiliateTag(SITE_CONFIG?.affiliateTag)) {
      console.warn('[DealGod] Affiliate tag is invalid/placeholder. Set a real Amazon Associates tag in data.js before going live.');
      setTimeout(() => {
        showToast('⚠️', 'Admin: Set real Amazon affiliate tag before launch.');
      }, 1200);
    }
    if (!/^https?:\/\/[^/\s]+/i.test(safeText(SITE_CONFIG?.siteUrl))) {
      console.warn('[DealGod] SITE_CONFIG.siteUrl is invalid. Update it before go-live.');
    }

    injectAnalytics();

    // Restore saved filters from localStorage
    try {
      const savedCat = localStorage.getItem('dg_filter_category');
      const savedPrice = localStorage.getItem('dg_filter_price');
      const savedSort = localStorage.getItem('dg_filter_sort');
      if (savedCat) {
        activeCategory = savedCat;
        filterChips.forEach(c => {
          c.classList.toggle('active', c.dataset.category === savedCat);
          c.setAttribute('aria-pressed', c.dataset.category === savedCat ? 'true' : 'false');
        });
      }
      if (savedPrice) {
        activePriceRange = savedPrice;
        priceChips.forEach(c => {
          c.classList.toggle('active', c.dataset.range === savedPrice);
          c.setAttribute('aria-pressed', c.dataset.range === savedPrice ? 'true' : 'false');
        });
      }
      if (savedSort && sortSelect) sortSelect.value = savedSort;
    } catch (_) { /* ignore */ }

    renderProducts();
    updateCompareUI();
    renderRecentlyViewed();
    updateCountdowns();
    setInterval(updateCountdowns, 1000);
    initCookieConsent();
    setupMegaSaleBanner();
    setupAlertModal();
    setupGiftFinder();
    if (SITE_CONFIG?.features?.enableFomoPopups) {
      setupFOMOPopups();
    }
    if (SITE_CONFIG?.features?.enablePushPromptMock) {
      setupPushNotificationsMock();
    }
    setupTopDealsPopup();
    initSearchLogic();
    initMobileMenu();

    console.log('[DealGod] Security active | Features loaded.');
  })();
});

