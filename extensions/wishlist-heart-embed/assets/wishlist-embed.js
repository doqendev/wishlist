(() => {
    const customerId = window.ShopifyAnalytics?.meta?.customerId || null;
  
    document.querySelectorAll('[data-product-id]').forEach((el) => {
      const productId = el.dataset.productId;
      if (!productId) return;
  
      // create the heart container
      const container = document.createElement('div');
      Object.assign(container.style, {
        position: 'absolute',
        bottom: '8px',
        right: '8px',
        cursor: 'pointer',
        zIndex: 2,
      });
      container.innerHTML = `<img src="${window.themeAppExtensionBaseUrl}/assets/heart-empty.svg" />`;
      el.style.position = 'relative';
      el.appendChild(container);
  
      const updateIcon = (filled) => {
        const icon = filled ? 'heart-full.svg' : 'heart-empty.svg';
        container.querySelector('img').src =
          `${window.themeAppExtensionBaseUrl}/assets/${icon}`;
      };
  
      container.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
      
        if (!customerId) {
          window.location.href = `/account/login?return_url=${encodeURIComponent(location.href)}`;
          return;
        }
      
        const isFilled = container.querySelector('img').src.includes('heart-full.svg');
        const method = isFilled ? 'DELETE' : 'POST';
        await fetch('/api/wishlist', {
          method,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId, productId }),
        });
        updateIcon(!isFilled);
      });
      
  
      // initialize state on page load
      if (customerId) {
        fetch(`/api/wishlist?customerId=${customerId}`, { credentials: 'include' })
          .then(r => r.json())
          .then(data => {
            if (data.items.some(item => item.productId === productId)) {
              updateIcon(true);
            }
          });
      }
    });
  })();
  