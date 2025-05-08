document.addEventListener('DOMContentLoaded', () => {
  const customerId = window.ShopifyAnalytics.meta.customerId || null;
  const cache = {};

  // Find every product link
  document.querySelectorAll('a[href*="/products/"]').forEach(anchor => {
    // Extract the handle
    const match = anchor.pathname.match(/^\/products\/([^\/]+)/);
    if (!match) return;
    const handle = match[1];
    if (!handle) return;

    // Prevent duplicate containers per handle
    if (cache[handle] && cache[handle].container) {
      // append same container to this card
      const clone = cache[handle].container.cloneNode(true);
      attachToCard(anchor, clone, cache[handle].productId);
      return;
    }

    // Fetch product JSON to get the ID
    fetch(`/products/${handle}.js`)
      .then(r => r.json())
      .then(json => {
        const productId = json.id;
        // build the heart container once
        const container = buildContainer(productId, customerId);
        cache[handle] = { productId, container };

        // attach it to *this* card
        attachToCard(anchor, container, productId);
      })
      .catch(() => {
        // ignore failures
      });
  });

  function buildContainer(productId, customerId) {
    const emptySVG = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"><path d="M12 21s-8-6.58-8-11a6 6 0 0112 0c0 4.42-8 11-8 11z"/></svg>';
    const fullSVG  = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 21s-8-6.58-8-11a6 6 0 0112 0c0 4.42-8 11-8 11z"/></svg>';
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.bottom = '8px';
    container.style.right  = '8px';
    container.style.cursor = 'pointer';
    container.style.zIndex = '2';

    const updateIcon = (filled) => {
      container.innerHTML = filled ? fullSVG : emptySVG;
    };

    container.addEventListener('click', async e => {
      e.preventDefault(); e.stopPropagation();
      if (!customerId) {
        window.location.href = `/account/login?return_url=${encodeURIComponent(location.href)}`;
        return;
      }
      const isFilled = container.querySelector('svg').getAttribute('fill') === 'currentColor';
      const method = isFilled ? 'DELETE' : 'POST';
      await fetch('/api/wishlist', {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, productId })
      });
      updateIcon(!isFilled);
    });

    // initialize state
    if (customerId) {
      fetch(`/api/wishlist?customerId=${customerId}`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
          const inList = data.items.some(i => i.productId === productId);
          updateIcon(inList);
        });
    } else {
      updateIcon(false);
    }

    return container;
  }

  function attachToCard(anchor, container, productId) {
    // find a wrapper to attach to
    const wrapper = anchor.closest('div,article') || anchor.parentElement;
    if (!wrapper) return;
    if (!wrapper.style.position) wrapper.style.position = 'relative';
    // clone the container for each card
    const clone = container.cloneNode(true);
    wrapper.appendChild(clone);
  }
});
