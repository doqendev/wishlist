document.addEventListener('DOMContentLoaded', () => {
  const customerId = window.ShopifyAnalytics.meta.customerId || null;
  const map = window.__WishlistProductMap || {};

  // Find every product-card anchor linking to "/products/<handle>"
  document.querySelectorAll('a[href*="/products/"]').forEach(anchor => {
    // Extract handle
    const path = new URL(anchor.href).pathname;
    const match = path.match(/\/products\/([^\/]+)/);
    if (!match) return;
    const handle = match[1];
    const productId = map[handle];
    if (!productId) return;

    // Make sure we only add one heart per card
    if (anchor.querySelector('.wishlist-heart-container')) return;

    // Create container
    const container = document.createElement('div');
    container.className = 'wishlist-heart-container';
    Object.assign(container.style, {
      position: 'absolute',
      bottom: '8px',
      right: '8px',
      zIndex: 2,
      cursor: 'pointer',
    });

    // Insert an empty-heart svg
    const emptySVG = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"><path d="M12 21s-8-6.58-8-11a6 6 0 0112 0c0 4.42-8 11-8 11z"/></svg>`;
    const fullSVG  = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 21s-8-6.58-8-11a6 6 0 0112 0c0 4.42-8 11-8 11z"/></svg>`;

    // Helper to update icon
    const updateIcon = (filled) => {
      container.innerHTML = filled ? fullSVG : emptySVG;
    };

    // Prevent parent link nav and handle click
    container.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!customerId) {
        window.location.href = `/account/login?return_url=${encodeURIComponent(location.href)}`;
        return;
      }
      const filled = container.querySelector('svg').getAttribute('fill') === 'currentColor';
      const method = filled ? 'DELETE' : 'POST';
      await fetch('/api/wishlist', {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, productId }),
      });
      updateIcon(!filled);
    });

    // Attach the heart container to the card wrapper
    // We assume the card wrapper is the anchor’s closest positioned ancestor
    const wrapper = anchor.closest('div,article') || anchor.parentElement;
    if (wrapper) {
      wrapper.style.position = wrapper.style.position || 'relative';
      wrapper.appendChild(container);
    }

    // Initialize filled status
    if (customerId) {
      fetch(`/api/wishlist?customerId=${customerId}`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
          const inWishlist = data.items.some(i => i.productId === productId);
          updateIcon(inWishlist);
        });
    } else {
      updateIcon(false);
    }
  });
});
