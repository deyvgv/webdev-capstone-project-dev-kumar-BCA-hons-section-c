document.addEventListener('DOMContentLoaded', () => {
  console.info('[shoppy] script starting (DOM ready)');

  const qs = s => document.querySelector(s);
  const qsa = s => Array.from(document.querySelectorAll(s));
  const money = v => `$${Number(v).toFixed(2)}`;

  const must = (sel) => {
    const el = document.querySelector(sel);
    if (!el) console.warn(`[shoppy] element not found: ${sel}`);
    return el;
  };

  const productsContainer = must('#products');
  if (!productsContainer) {
    console.error('[shoppy] Fatal: #products container missing. Aborting script.');
    return;
  }

  const productNodesRaw = qsa('.product-card');

  const ratingFilter = qs('#ratingFilter');
  const priceRange = qs('#priceRange');
  const priceValue = qs('#priceValue');
  const applyBtn = qs('#applyFilters');
  const clearBtn = qs('#clearFilters');
  const searchInput = qs('#searchInput');
  const sortSelect = qs('#sortSelect');
  const cartButton = qs('#cartButton');
  const cartCountEl = qs('#cartCount');
  const cartDrawer = qs('#cartDrawer');
  const cartBackdrop = qs('#cartBackdrop');
  const closeCartBtn = qs('#closeCart');
  const cartItemsList = qs('#cartItems');
  const cartSubtotalEl = qs('#cartSubtotal');
  const clearCartBtn = qs('#clearCart');
  const checkoutBtn = qs('#checkoutBtn');
  const themeToggle = qs('#themeToggle');
  const contactForm = qs('#contactForm');

  const productNodes = productNodesRaw.map(node => {
    const id = node.dataset.id || (node.querySelector('.add-cart') && node.querySelector('.add-cart').dataset.id) || null;
    let price = 0;
    if (node.dataset.price) price = Number(node.dataset.price);
    else {
      const priceEl = node.querySelector('.price');
      if (priceEl) price = Number(priceEl.textContent.replace(/[^0-9.]/g,''));
    }
    const rating = Number(node.dataset.rating || 0);
    const titleEl = node.querySelector('.product-title') || node.querySelector('h4') || node.querySelector('img[alt]');
    const title = titleEl ? (titleEl.textContent || titleEl.getAttribute('alt') || '') : '';
    const category = node.dataset.category || '';
    return { node, id, price, rating, title: title.toLowerCase(), category };
  });

  console.info(`[shoppy] Found ${productNodes.length} product cards.`);

  const categoryInputs = () => Array.from(document.querySelectorAll('#categoryList input'));
  let filters = {
    minRating: 0,
    maxPrice: priceRange ? Number(priceRange.value || 500) : 500,
    categories: new Set(categoryInputs().map(i => i.value)),
    search: ''
  };

  let cart = (function loadCart() {
    try {
      const raw = localStorage.getItem('shoppy-cart');
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[shoppy] Failed to parse shoppy-cart from localStorage:', e);
      return {};
    }
  })();

  const saveCart = () => {
    try { localStorage.setItem('shoppy-cart', JSON.stringify(cart)); }
    catch (e) { console.warn('[shoppy] saveCart failed', e); }
  };

  const updateCartCount = () => {
    const total = Object.values(cart).reduce((s,i) => s + (i.qty || 0), 0);
    if (cartCountEl) cartCountEl.textContent = total;
  };

  const renderCart = () => {
    if (!cartItemsList || !cartSubtotalEl) return;
    cartItemsList.innerHTML = '';
    const items = Object.values(cart);
    if (items.length === 0) {
      cartItemsList.innerHTML = '<li class="cart-empty">Your cart is empty.</li>';
      cartSubtotalEl.textContent = money(0);
      updateCartCount();
      return;
    }
    let subtotal = 0;
    items.forEach(item => {
      subtotal += item.price * item.qty;
      const li = document.createElement('li');
      li.className = 'cart-item';
      li.innerHTML = `
        <img src="${item.img}" alt="${escapeHtml(item.title)}">
        <div class="info">
          <div class="title">${escapeHtml(item.title)}</div>
          <div class="price">${money(item.price)}</div>
        </div>
        <div class="qty-controls">
          <button class="decrease" data-id="${item.id}">-</button>
          <div class="qty">${item.qty}</div>
          <button class="increase" data-id="${item.id}">+</button>
          <button class="remove" data-id="${item.id}" title="Remove">✕</button>
        </div>
      `;
      cartItemsList.appendChild(li);
    });
    cartSubtotalEl.textContent = money(subtotal);
    updateCartCount();
  };

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  }

  if (priceRange && priceValue) priceValue.textContent = priceRange.value;

  function applyFilters() {
    filters.minRating = ratingFilter ? Number(ratingFilter.value || 0) : 0;
    filters.maxPrice = priceRange ? Number(priceRange.value || 500) : 500;
    filters.search = searchInput ? (searchInput.value || '').trim().toLowerCase() : '';
    filters.categories = new Set(categoryInputs().filter(i => i.checked).map(i => i.value));

    productNodes.forEach(p => {
      const meetsRating = p.rating >= filters.minRating;
      const meetsPrice = p.price <= filters.maxPrice;
      const meetsCategory = filters.categories.size === 0 ? true : filters.categories.has(p.category);
      const meetsSearch = !filters.search || p.title.includes(filters.search);

      if (meetsRating && meetsPrice && meetsCategory && meetsSearch) {
        p.node.style.display = 'flex';
        p.node.style.opacity = '1';
      } else {
        p.node.style.display = 'none';
        p.node.style.opacity = '0';
      }
    });

    applySort();
    console.debug('[shoppy] Filters applied', {
      minRating: filters.minRating, maxPrice: filters.maxPrice, categories: Array.from(filters.categories), search: filters.search
    });
  }

  function clearFilters() {
    if (ratingFilter) ratingFilter.value = '0';
    if (priceRange) { priceRange.value = priceRange.max || 500; if (priceValue) priceValue.textContent = priceRange.value; }
    if (searchInput) searchInput.value = '';
    categoryInputs().forEach(i => i.checked = true);
    filters = { minRating: 0, maxPrice: priceRange ? Number(priceRange.value) : 500, categories: new Set(categoryInputs().map(i => i.value)), search: '' };
    applyFilters();
    console.info('[shoppy] Filters cleared');
  }

  function applySort() {
    if (!sortSelect) return;
    const mode = sortSelect.value;
    let visible = productNodes.filter(p => p.node.style.display !== 'none');
    const cmpMap = {
      'price-asc': (a,b) => a.price - b.price,
      'price-desc': (a,b) => b.price - a.price,
      'rating-desc': (a,b) => b.rating - a.rating,
      'rating-asc': (a,b) => a.rating - b.rating,
      'default': () => 0
    };
    const cmp = cmpMap[mode] || cmpMap['default'];
    visible.sort(cmp);
    visible.forEach(p => productsContainer.appendChild(p.node));
    console.debug('[shoppy] Sorting applied', mode);
  }

  let searchTimer = null;
  if (searchInput) searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 180);
  });
  if (priceRange) priceRange.addEventListener('input', () => { if (priceValue) priceValue.textContent = priceRange.value; });
  if (applyBtn) applyBtn.addEventListener('click', applyFilters);
  if (clearBtn) clearBtn.addEventListener('click', clearFilters);
  if (sortSelect) sortSelect.addEventListener('change', applySort);

  if (themeToggle) {
    const initTheme = () => {
      const t = localStorage.getItem('shoppy-theme');
      if (t === 'light') document.body.classList.add('light');
      themeToggle.setAttribute('aria-pressed', document.body.classList.contains('light'));
    };
    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('light');
      localStorage.setItem('shoppy-theme', document.body.classList.contains('light') ? 'light' : 'dark');
      themeToggle.setAttribute('aria-pressed', document.body.classList.contains('light'));
    });
    initTheme();
  }

  function addToCartFromNode(productNode) {
    if (!productNode) return;
    const id = productNode.dataset.id;
    if (!id) { console.warn('[shoppy] product has no data-id', productNode); return; }
    const title = (productNode.querySelector('.product-title')?.textContent || productNode.querySelector('h4')?.textContent || productNode.querySelector('img')?.alt || `Item ${id}`).trim();
    const price = Number(productNode.dataset.price || 0);
    const img = productNode.querySelector('img')?.src || '';
    if (cart[id]) cart[id].qty += 1;
    else cart[id] = { id, title, price, qty: 1, img };
    saveCart();
    renderCart();
    if (cartButton) {
      try { cartButton.animate([{ transform: 'scale(1)' },{ transform:'scale(1.12)' },{ transform:'scale(1)' }], { duration: 220 }); } catch(e){}
    }
    openCart();
    console.info(`[shoppy] Added to cart: ${title} (id=${id})`);
  }

  qsa('.add-cart').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = btn.dataset.id;
      if (!id) { console.warn('[shoppy] add-cart button missing data-id'); return; }
      const node = document.querySelector(`.product-card[data-id="${id}"]`);
      if (!node) { console.warn(`[shoppy] product node for id=${id} not found`); return; }
      try { node.animate([{ transform: 'scale(1)' },{ transform:'scale(1.02)' },{ transform:'scale(1)' }], { duration: 260 }); } catch(e){}
      addToCartFromNode(node);
    });
  });

  function openCart() {
    if (!cartDrawer || !cartBackdrop || !cartCountEl) return;
    cartDrawer.classList.add('open');
    cartBackdrop.hidden = false;
    cartDrawer.setAttribute('aria-hidden','false');
    if (cartButton) cartButton.setAttribute('aria-expanded','true');
    renderCart();
    const focusable = cartDrawer.querySelector('button, [tabindex], a');
    if (focusable) focusable.focus();
  }
  function closeCart() {
    if (!cartDrawer || !cartBackdrop) return;
    cartDrawer.classList.remove('open');
    cartBackdrop.hidden = true;
    cartDrawer.setAttribute('aria-hidden','true');
    if (cartButton) cartButton.setAttribute('aria-expanded','false');
  }

  if (cartButton) cartButton.addEventListener('click', () => cartDrawer && cartDrawer.classList.contains('open') ? closeCart() : openCart());
  if (closeCartBtn) closeCartBtn.addEventListener('click', closeCart);
  if (cartBackdrop) cartBackdrop.addEventListener('click', closeCart);

  if (cartItemsList) {
    cartItemsList.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.dataset.id;
      if (!id) return;
      if (btn.classList.contains('increase')) cart[id].qty += 1;
      else if (btn.classList.contains('decrease')) cart[id].qty = Math.max(1, cart[id].qty - 1);
      else if (btn.classList.contains('remove')) delete cart[id];
      saveCart();
      renderCart();
    });
  }

  if (clearCartBtn) clearCartBtn.addEventListener('click', () => { cart = {}; saveCart(); renderCart(); });
  if (checkoutBtn) checkoutBtn.addEventListener('click', () => {
    if (Object.keys(cart).length === 0) { alert('Cart empty'); return; }
    alert('Checkout demo — clearing cart');
    cart = {}; saveCart(); renderCart(); closeCart();
  });

  updateCartCount();
  renderCart();
  applyFilters();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeCart(); if (searchInput) searchInput.blur(); }
  });

  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = contactForm.querySelector('button[type="submit"], button');
      if (btn) { btn.disabled = true; const old = btn.textContent; btn.textContent = 'Sending...'; setTimeout(() => { alert('Message sent (demo)'); contactForm.reset(); btn.disabled = false; btn.textContent = old; }, 900); }
      else { setTimeout(() => { alert('Message sent (demo)'); contactForm.reset(); }, 900); }
    });
  }

  console.info('[shoppy] script initialized successfully.');
});
