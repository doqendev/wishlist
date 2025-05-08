document.addEventListener('DOMContentLoaded', () => {
  const customerId = window.ShopifyAnalytics.meta.customerId || null;
  const { emptyHeart, fullHeart } = window.__WishlistEmbedAssets || {};

  // Helper: create a heart container for a given productId
  function createHeartContainer(productId) {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.bottom   = '8px';
    container.style.right    = '8px';
    container.style.cursor   = 'pointer';
    container.style.zIndex   = '2';

    // Use an <img> so we can swap src easily
    const img = document.createElement('img');
    img.src = emptyHeart;
    img.width = 24;
    img.height = 24;
    container.appendChild(img);

    // Toggle SVG
    function updateIcon(filled) {
      img.src = filled ? fullHeart : emptyHeart;
    }

    // Click handler
    container.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!customerId) {
        window.location.href = `/account/login?return_url=${encodeURIComponent(location.href)}`;
        return;
      }
      const filled = img.src === fullHeart;
      const method = filled ? 'DELETE' : 'POST';
      await fetch('/api/wishlist', {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, productId }),
      });
      updateIcon(!filled);
    });

    // Initialize fill state
    if (customerId) {
      fetch(`/api/wishlist?customerId=${customerId}`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
          const inWishlist = data.items.some(i => i.productId === productId);
          updateIcon(inWishlist);
        });
    }

    return container;
  }

  // Attach hearts to every product-card link
  document.querySelectorAll('a[href*="/products/"]').forEach(anchor => {
    const m = anchor.pathname.match(/^\/products\/([^\/]+)/);
    if (!m) return;
    const handle = m[1];

    // Fetch product JSON once per handle
    fetch(`/products/${handle}.js`)
      .then(r => r.json())
      .then(json => {
        const productId = json.id;
        // Create the container
        const heart = createHeartContainer(productId);

        // Find the card wrapper: usually <article> or <div class="card-wrapper">
        const wrapper = anchor.closest('article, .card-wrapper, li') || anchor.parentElement;
        if (!wrapper) return;

        // Ensure the wrapper is positioned
        const st = window.getComputedStyle(wrapper).position;
        if (st === 'static') wrapper.style.position = 'relative';

        // Append *one* heart per card
        wrapper.appendChild(heart);
      })
      .catch(() => {});
  });
});

// === Inject "My Wishlist" into customer-account nav ===
if (location.pathname.startsWith('/account')) {
  document.addEventListener('DOMContentLoaded', () => {
    // Adjust the selector to match Dawn's account-nav
    const nav = document.querySelector('.account-layout__navigation nav');
    if (!nav) return;
    // Only add once
    if (nav.querySelector('a[href="/apps/wishlist"]')) return;

    const li = document.createElement('div');
    li.innerHTML = `
      <a href="/apps/wishlist" class="ui-link">Wishlist</a>
    `;
    // Style as needed:
    li.style.marginTop = '1rem';
    nav.appendChild(li);
  });
}