/* Loomhaus quick view popup.
   Click on any [data-quickview="<product handle>"] -> fetch that product rendered by the
   lh-quick-view section -> show it in the popup -> add the chosen variant with LhCart. */
(() => {
  if (window.lhQuickViewReady) return;

  const modal = document.querySelector('[data-qv]');
  if (!modal) return;
  window.lhQuickViewReady = true;

  const root = window.Shopify?.routes?.root ?? '/';
  const SECTION_ID = modal.closest('.shopify-section')?.id.replace('shopify-section-', '') || 'lh-quick-view';
  const content = modal.querySelector('[data-qv-content]');

  let variants = [];
  let hasSize = false;
  const state = { color: '', size: '' };
  let lastFocus = null;
  let requestId = 0; // lets us ignore a slow response if the popup was closed or another product was opened

  const $ = (selector) => content.querySelector(selector);

  /* ---------- Variant logic ---------- */

  const findVariant = () =>
    variants.find((v) => v.color === state.color && (!hasSize || v.size === state.size));

  const showError = (message) => {
    const el = $('[data-qv-error]');
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
  };

  // Refresh price and disable sizes that are sold out in the chosen colour.
  const update = () => {
    const select = $('[data-qv-size]');

    if (select) {
      [...select.options].forEach((option) => {
        if (!option.value) return;
        const variant = variants.find((v) => v.color === state.color && v.size === option.value);
        const unavailable = !variant || !variant.available;
        option.disabled = unavailable;
        option.textContent = option.dataset.label + (unavailable ? ' – Sold out' : '');
      });
      // The chosen size may not exist in the newly chosen colour.
      if (select.selectedOptions[0]?.disabled) {
        select.value = '';
        state.size = '';
      }
    }

    const match = findVariant() || variants.find((v) => v.color === state.color) || variants[0];
    if (match) $('[data-qv-price]').textContent = match.price;
  };

  const setup = () => {
    const data = $('[data-qv-variants]');
    if (!data) return;
    variants = JSON.parse(data.textContent);
    hasSize = Boolean($('[data-qv-size]'));
    state.color = $('.lh-qv__color[aria-pressed="true"]')?.dataset.value ?? '';
    state.size = '';
    update();
  };

  /* ---------- Open / close ---------- */

  const open = async (handle) => {
    lastFocus = document.activeElement;
    const current = ++requestId;

    modal.classList.add('is-open', 'is-loading');
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('lh-no-scroll');

    try {
      const res = await fetch(`${root}products/${encodeURIComponent(handle)}?section_id=${SECTION_ID}`);
      if (!res.ok) throw new Error('Product not found');
      const html = await res.text();
      if (current !== requestId) return;

      const fresh = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-qv-content]');
      content.innerHTML = fresh.innerHTML;
      setup();
      $('.lh-qv__close')?.focus();
    } catch {
      if (current !== requestId) return;
      content.innerHTML = '<p>Sorry, we could not load this product.</p>';
    } finally {
      if (current === requestId) modal.classList.remove('is-loading');
    }
  };

  const close = ({ restoreFocus = true } = {}) => {
    requestId += 1;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    // Keep the page locked if the cart drawer is open on top.
    if (!document.querySelector('.lh-drawer.is-open')) {
      document.documentElement.classList.remove('lh-no-scroll');
    }
    if (restoreFocus) lastFocus?.focus?.();
  };

  /* ---------- Add to cart ---------- */

  const addToCart = async (button) => {
    if (hasSize && !state.size) {
      showError('Please choose a size.');
      $('[data-qv-size]').focus();
      return;
    }
    const variant = findVariant();
    if (!variant || !variant.available) {
      showError('This option is sold out.');
      return;
    }

    showError('');
    button.disabled = true;
    try {
      await window.LhCart.add(variant.id, 1); // adds, then opens the cart drawer
      close({ restoreFocus: false });
    } catch (error) {
      showError(error.message);
    } finally {
      button.disabled = false;
    }
  };

  /* ---------- Events ---------- */

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-quickview]');
    if (trigger) open(trigger.dataset.quickview);
  });

  modal.addEventListener('click', (event) => {
    if (event.target.closest('[data-qv-close]')) return close();

    const colorButton = event.target.closest('.lh-qv__color');
    if (colorButton) {
      content.querySelectorAll('.lh-qv__color').forEach((b) => b.setAttribute('aria-pressed', String(b === colorButton)));
      state.color = colorButton.dataset.value;
      const image = $('.lh-qv__img');
      if (image && colorButton.dataset.image) {
        image.src = colorButton.dataset.image;
        image.removeAttribute('srcset');
      }
      showError('');
      update();
      return;
    }

    const addButton = event.target.closest('[data-qv-add]');
    if (addButton) addToCart(addButton);
  });

  modal.addEventListener('change', (event) => {
    if (!event.target.matches('[data-qv-size]')) return;
    state.size = event.target.value;
    showError('');
    update();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('is-open')) close();
  });
})();
