// @ts-check
import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";

import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import PrivacyWebhookHandlers from "./privacy.js";

// ─────────────────────────────────────────────────────────────────────────────
// Add Prisma
// ─────────────────────────────────────────────────────────────────────────────
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();


const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3000",
  10
);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();

// Set up Shopify authentication and webhook handling
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: PrivacyWebhookHandlers })
);

// Protect all /api/* routes
app.use("/api/*", shopify.validateAuthenticatedSession());

// Parse JSON bodies
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// Existing sample routes
// ─────────────────────────────────────────────────────────────────────────────

app.get("/api/products/count", async (_req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  const countData = await client.request(`
    query shopifyProductCount {
      productsCount {
        count
      }
    }
  `);

  res.status(200).send({ count: countData.data.productsCount.count });
});

app.post("/api/products", async (_req, res) => {
  let status = 200;
  let error = null;

  try {
    await productCreator(res.locals.shopify.session);
  } catch (e) {
    console.log(`Failed to process products/create: ${e.message}`);
    status = 500;
    error = e.message;
  }
  res.status(status).send({ success: status === 200, error });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wishlist endpoints
// ─────────────────────────────────────────────────────────────────────────────

// GET  /api/wishlist?customerId=123
app.get("/api/wishlist", async (req, res) => {
  try {
    const shop = res.locals.shopify.session.shop;
    const customerId = req.query.customerId;

    if (!customerId) {
      return res.status(400).json({ error: "Missing customerId" });
    }

    const items = await prisma.wishlist.findMany({
      where: { shop, customerId: String(customerId) },
    });

    return res.json({ success: true, items });
  } catch (err) {
    console.error("GET /api/wishlist error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// POST /api/wishlist
// body: { customerId, productId }
app.post("/api/wishlist", async (req, res) => {
  try {
    const shop = res.locals.shopify.session.shop;
    const { customerId, productId } = req.body;

    if (!customerId || !productId) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const entry = await prisma.wishlist.create({
      data: { shop, customerId, productId },
    });

    return res.json({ success: true, entry });
  } catch (err) {
    // Handle unique constraint violation (already added)
    if (err.code === "P2002") {
      return res
        .status(200)
        .json({ success: true, message: "Already in wishlist" });
    }
    console.error("POST /api/wishlist error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

// DELETE /api/wishlist
// body: { customerId, productId }
app.delete("/api/wishlist", async (req, res) => {
  try {
    const shop = res.locals.shopify.session.shop;
    const { customerId, productId } = req.body;

    if (!customerId || !productId) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    await prisma.wishlist.deleteMany({
      where: { shop, customerId, productId },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/wishlist error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});


// Serve the Wishlist page via App Proxy
app.get(
  "/apps/wishlist",
  shopify.validateAuthenticatedSession(),
  async (req, res) => {
    const customerId = res.locals.shopify.session.onlineAccessInfo.associated_user?.id
      || window.ShopifyAnalytics.meta.customerId;

    // Fetch the wishlist items from your SQLite via Prisma
    const items = await prisma.wishlistItem.findMany({
      where: { customerId: String(customerId) },
      include: { product: true }, // assuming you link to a Product model
    });

    // Build simple HTML
    let listHtml = items.length
      ? items
          .map(
            (it) => `<li>
                <a href="/products/${it.product.handle}">
                  ${it.product.title}
                </a>
                <button data-product-id="${it.productId}" class="remove">Remove</button>
              </li>`
          )
          .join("")
      : "<li>Your wishlist is empty.</li>";

    res.send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>My Wishlist</title>
          <style>
            body { font-family: sans-serif; max-width:600px; margin:2rem auto; }
            ul { list-style: none; padding:0; }
            li { margin:1rem 0; display:flex; justify-content:space-between; }
            button.remove { background: #c00; color:#fff; border:none; padding:0.5rem 1rem; cursor:pointer; }
          </style>
        </head>
        <body>
          <h1>My Wishlist</h1>
          <ul>${listHtml}</ul>
          <script>
            document.querySelectorAll('button.remove').forEach(btn => {
              btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-product-id');
                await fetch('/api/wishlist', {
                  method: 'DELETE',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ customerId: '${customerId}', productId: id })
                });
                btn.parentElement.remove();
              });
            });
          </script>
        </body>
      </html>
    `);
  }
);

// ─────────────────────────────────────────────────────────────────────────────

app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res, _next) => {
  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(
      readFileSync(join(STATIC_PATH, "index.html"))
        .toString()
        .replace("%VITE_SHOPIFY_API_KEY%", process.env.SHOPIFY_API_KEY || "")
    );
});

app.listen(PORT);
