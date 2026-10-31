/* Featured product behaviour.
   - gallery: arrows, thumbnails and dots all just scroll one strip
   - variant change: swap in the ready-made <template> for that variant (all numbers were done in Liquid)
   - quantity, add to cart, buy it now, copy offer code */
(() => {
  if (window.lhFeaturedReady) return;
  window.lhFeaturedReady = true;

  const root = window.Shopify?.routes?.root ?? '/';
  const pad = (n) => String(n).padStart(2, '0');
  const MAX_QTY = 10;

  /* ---------- Gallery ---------- */

  const currentIndex = (track) => Math.round(track.scrollLeft / track.clientWidth);

  const syncGallery = (fp) => {
    const track = fp.querySelector('[data-fp-track]');
    const slides = track.children.length;
    const index = currentIndex(track);

    fp.querySelectorAll('[data-fp-go]').forEach((el) => {
      el.setAttribute('aria-current', String(Number(el.dataset.fpGo) === index));
    });
    fp.querySelector('[data-fp-arrow="-1"]').disabled = index <= 0;
    fp.querySelector('[data-fp-arrow="1"]').disabled = index >= slides - 1;
  };

  const goTo = (fp, index, smooth = true) => {
    const track = fp.querySelector('[data-fp-track]');
    track.scrollTo({ left: index * track.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  };

  const showMedia = (fp, mediaId, smooth) => {
    if (!mediaId) return;
    const slides = [...fp.querySelectorAll('.lh-fp__slide')];
    const index = slides.findIndex((slide) => slide.dataset.mediaId === mediaId);
    if (index >= 0) goTo(fp, index, smooth);
  };

  /* ---------- Info column ---------- */

  const renderQty = (fp) => {
    const qty = Number(fp.dataset.qty);
    const value = fp.querySelector('[data-fp-qty-value]');
    if (value) value.textContent = pad(qty);
    fp.querySelector('[data-fp-qty="-1"]')?.toggleAttribute('disabled', qty <= 1);
    fp.querySelector('[data-fp-qty="1"]')?.toggleAttribute('disabled', qty >= MAX_QTY);
  };

  const showError = (fp, message) => {
    const el = fp.querySelector('[data-fp-error]');
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
  };

  const swapVariant = (fp, button) => {
    const template = fp.querySelector(`template[data-fp-variant="${button.dataset.variant}"]`);
    if (!template) return;

    const { group } = button.dataset;
    const info = fp.querySelector('[data-fp-info]');
    info.replaceChildren(template.content.cloneNode(true));

    renderQty(fp); // quantity survives the swap because it lives on the section, not in the template
    showMedia(fp, info.querySelector('[data-media-id]')?.dataset.mediaId, true);
    info.querySelector(`[data-group="${group}"][aria-pressed="true"]`)?.focus(); // keep keyboard focus
  };

  const withLoading = async (button, task) => {
    button.disabled = true;
    try {
      await task();
    } finally {
      button.disabled = false;
    }
  };

  /* ---------- Events (one listener for the whole page) ---------- */

  document.addEventListener('click', (event) => {
    const fp = event.target.closest('[data-fp]');
    if (!fp) return;

    // gallery
    const arrow = event.target.closest('[data-fp-arrow]');
    if (arrow) {
      const track = fp.querySelector('[data-fp-track]');
      return goTo(fp, currentIndex(track) + Number(arrow.dataset.fpArrow));
    }
    const go = event.target.closest('[data-fp-go]');
    if (go) return goTo(fp, Number(go.dataset.fpGo));

    // swatch / size pill
    const option = event.target.closest('[data-variant][data-group]');
    if (option && !option.disabled && option.getAttribute('aria-pressed') !== 'true') {
      return swapVariant(fp, option);
    }

    // quantity
    const qtyButton = event.target.closest('[data-fp-qty]');
    if (qtyButton) {
      const next = Number(fp.dataset.qty) + Number(qtyButton.dataset.fpQty);
      fp.dataset.qty = Math.min(MAX_QTY, Math.max(1, next));
      return renderQty(fp);
    }

    // add to cart (opens the drawer)
    const add = event.target.closest('[data-fp-add]');
    if (add) {
      showError(fp, '');
      withLoading(add, () => window.LhCart.add(add.dataset.variantId, Number(fp.dataset.qty))).catch((error) =>
        showError(fp, error.message)
      );
      return;
    }

    // buy it now: put it in the cart quietly (so the Black/M rule still runs), then go to checkout
    const buy = event.target.closest('[data-fp-buy]');
    if (buy) {
      showError(fp, '');
      buy.disabled = true;
      window.LhCart.add(buy.dataset.variantId, Number(fp.dataset.qty), { open: false })
        .then(() => { window.location.href = `${root}checkout`; })
        .catch((error) => {
          showError(fp, error.message);
          buy.disabled = false;
        });
      return;
    }

    // copy offer code
    const copy = event.target.closest('[data-copy]');
    if (copy) {
      navigator.clipboard.writeText(copy.dataset.copy).then(() => {
        const card = copy.closest('.lh-offer');
        const status = card.querySelector('[data-offer-status]');
        card.classList.add('is-copied');
        status.hidden = false;
        setTimeout(() => {
          card.classList.remove('is-copied');
          status.hidden = true;
        }, 2000);
      });
    }
  });

  /* ---------- Setup ---------- */

  const init = (fp) => {
    const track = fp.querySelector('[data-fp-track]');
    if (!track) return;

    let frame;
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => syncGallery(fp));
    });

    showMedia(fp, fp.querySelector('[data-media-id].lh-fp__panel')?.dataset.mediaId, false);
    renderQty(fp);
    syncGallery(fp);
  };

  const initAll = () => document.querySelectorAll('[data-fp]').forEach(init);
  initAll();
  document.addEventListener('shopify:section:load', (event) => {
    const fp = event.target.querySelector('[data-fp]');
    if (fp) init(fp);
  });
})();
