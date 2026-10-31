/* Header behaviour: keep the cart count in sync and open the drawer.
   Other scripts announce changes with a CustomEvent, so no script needs to know about the header. */
(() => {
  // Guard: this file is loaded by the section, which can render more than once in the theme editor.
  if (window.lhHeaderReady) return;
  window.lhHeaderReady = true;

  const updateCount = (count) => {
    document.querySelectorAll('[data-cart-count]').forEach((el) => {
      el.textContent = count;
      el.hidden = count === 0;
    });
  };

  // Fired by the cart drawer / quick view after any /cart/*.js call: detail = { cart }
  document.addEventListener('lh:cart:updated', (event) => {
    updateCount(event.detail.cart.item_count);
  });

  // Event delegation: works for buttons added later too.
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-cart-open]')) {
      document.dispatchEvent(new CustomEvent('lh:cart:open'));
    }
  });
})();
