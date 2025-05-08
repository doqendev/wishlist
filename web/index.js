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
