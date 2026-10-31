/* Loomhaus cart drawer.
   Every change = 1) POST to the Cart AJAX API  2) re-read the cart  3) re-render the drawer
   from the Section Rendering API  4) tell the rest of the page with an event. */
(() => {
  if (window.LhCart) return;

  const drawer = document.querySelector('[data-cart-drawer]');
  if (!drawer) return;

  const root = window.Shopify?.routes?.root ?? '/';
  const SECTION_ID = drawer.closest('.shopify-section')?.id.replace('shopify-section-', '') || 'lh-cart-drawer';
  const DISMISS_KEY = 'lh_auto_dismissed';

  const autoVariantId = Number(drawer.dataset.autoVariantId) || null;
  const autoHandle = drawer.dataset.autoHandle;

  let lastFocus = null;
  let queue = Promise.resolve();

  /* ---------- Small helpers ---------- */

  const store = {
    get: () => { try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } },
    set: () => { try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* storage blocked */ } },
    clear: () => { try { sessionStorage.removeItem(DISMISS_KEY); } catch { /* storage blocked */ } },
  };

  const post = async (url, payload) => {
    const res = await fetch(root + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.description || data.message || 'Could not update the cart.');
    return data;
  };

  const getCart = () => fetch(`${root}cart.js`).then((res) => res.json());

  const showError = (message) => {
    const el = drawer.querySelector('[data-cart-error]');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
  };

  /* ---------- Render ---------- */

  const render = async () => {
    const res = await fetch(`${root}?sections=${SECTION_ID}`);
    const html = (await res.json())[SECTION_ID];
    const fresh = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-cart-body]');
    if (fresh) drawer.querySelector('[data-cart-body]').innerHTML = fresh.innerHTML;
  };

  /* ---------- Auto-add rule ----------
     Black + M item in cart  ->  auto product is added (tagged with a hidden _auto_added property).
     No Black + M item left  ->  auto product is removed. */

  const norm = (value) => String(value).trim().toLowerCase();

  const isTrigger = (line) => {
    if (line.properties?._auto_added || line.handle === autoHandle) return false;
    const values = line.options_with_values.map((option) => norm(option.value));
    return values.includes('black') && values.includes('m');
  };

  // Returns true when it changed the cart, so the caller re-reads it.
  const reconcile = async (cart) => {
    const hasTrigger = cart.items.some(isTrigger);
    const autoLine = cart.items.find((line) => line.properties?._auto_added);

    if (!hasTrigger) {
      store.clear();
      if (!autoLine) return false;
      await post('cart/change.js', { id: autoLine.key, quantity: 0 });
      return true;
    }

    if (autoLine || !autoVariantId || store.get()) return false;
    try {
      await post('cart/add.js', {
        items: [{ id: autoVariantId, quantity: 1, properties: { _auto_added: 'true' } }],
      });
      return true;
    } catch (error) {
      console.warn('Auto-add failed:', error.message);
      return false;
    }
  };

  const refresh = async () => {
    let cart = await getCart();
    if (await reconcile(cart)) cart = await getCart();
    await render();
    document.dispatchEvent(new CustomEvent('lh:cart:updated', { detail: { cart } }));
    return cart;
  };

  // Jobs run one after another so quick clicks can't overlap.
  const run = (task) => {
    const job = queue.then(async () => {
      drawer.classList.add('is-loading');
      try {
        await task();
        return await refresh();
      } catch (error) {
        showError(error.message);
        throw error;
      } finally {
        drawer.classList.remove('is-loading');
      }
    });
    queue = job.catch(() => {});
    return job;
  };

  /* ---------- Open / close ---------- */

  const open = () => {
    lastFocus = document.activeElement;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('lh-no-scroll');
    drawer.querySelector('.lh-drawer__close')?.focus();
  };

  const close = () => {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('lh-no-scroll');
    lastFocus?.focus?.();
  };

  /* ---------- Public API (used by quick view and the featured product) ---------- */

  const add = (id, quantity = 1) =>
    run(() => post('cart/add.js', { items: [{ id: Number(id), quantity: Number(quantity) }] })).then(open);

  window.LhCart = { add, open, close };

  /* ---------- Events ---------- */

  drawer.addEventListener('click', (event) => {
    if (event.target.closest('[data-cart-close]')) return close();

    const button = event.target.closest('[data-action="qty"]');
    if (!button) return;
    if (button.dataset.auto && button.dataset.qty === '0') store.set(); // user removed the auto item on purpose
    run(() => post('cart/change.js', { id: button.dataset.key, quantity: Number(button.dataset.qty) })).catch(() => {});
  });

  document.addEventListener('lh:cart:open', open);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drawer.classList.contains('is-open')) close();
  });
})();
