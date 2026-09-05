#!/usr/bin/env node
import { randomUUID } from 'crypto';

const BASE_URL = process.env.DEMO_BASE_URL || 'https://ai-commerce-xi.vercel.app';

const log = (message: string) => {
  const timestamp = new Date().toISOString();
  console.log(`[AI BUYER] ${timestamp} ${message}`);
};

type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  tags?: string[];
  category?: string;
  description?: string;
};

type CatalogResponse = {
  merchant: string;
  products: Product[];
};

type CartResponse = {
  success?: boolean;
  error?: string;
  cart_id?: string;
};

type OrderResponse = {
  error?: string;
  key_id?: string;
  order?: {
    id: string;
    razorpay_order_id: string;
    amount: number;
    currency: string;
    status: string;
  };
};

async function fetchCatalog(): Promise<Product[]> {
  log('Fetching machine-readable product catalog...');
  const response = await fetch(`${BASE_URL}/api/ai/catalog`);
  if (!response.ok) {
    throw new Error(`Catalog fetch failed: ${response.status} ${response.statusText}`);
  }
  const data: CatalogResponse = await response.json();
  log(`Catalog loaded: ${data.products.length} products available from "${data.merchant}"`);
  return data.products;
}

function selectProduct(products: Product[]): Product {
  log('Filtering products: price <= 70000, tags includes "coding", stock > 0...');
  const filtered = products.filter(
    (p) =>
      p.price <= 70000 &&
      (p.tags || []).includes('coding') &&
      (p.stock || 0) > 0
  );

  if (filtered.length === 0) {
    throw new Error('No products match filter criteria');
  }

  const selected = filtered[0];
  log(
    `Selected product: "${selected.name}" ` +
    `(ID: ${selected.id}, Price: ₹${selected.price}, Stock: ${selected.stock})`
  );
  return selected;
}

async function addToCart(sessionId: string, productId: string): Promise<void> {
  log(`Adding product to cart (session: ${sessionId}, product: ${productId})...`);
  const response = await fetch(`${BASE_URL}/api/cart/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, product_id: productId, quantity: 1 }),
  });

  const data: CartResponse = await response.json();
  if (!response.ok) {
    throw new Error(`Cart addition failed: ${data.error || response.statusText}`);
  }
  log('Product added to cart successfully');
}

async function createOrder(sessionId: string): Promise<OrderResponse['order']> {
  log('Creating Razorpay test order...');
  const response = await fetch(`${BASE_URL}/api/checkout/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });

  const data: OrderResponse = await response.json();
  if (!response.ok) {
    throw new Error(`Order creation failed: ${data.error || response.statusText}`);
  }

  if (!data.order) {
    throw new Error('No order returned from server');
  }

  log(
    `Order created successfully: ID=${data.order.id}, ` +
    `Razorpay Order ID=${data.order.razorpay_order_id}, ` +
    `Amount=₹${data.order.amount / 100}, Status=${data.order.status}`
  );

  return data.order;
}

async function main() {
  try {
    log('========== AI BUYER AUTONOMOUS AGENT STARTED ==========');
    log(`Base URL: ${BASE_URL}`);

    // Step 1: Fetch catalog
    const products = await fetchCatalog();

    // Step 2: Select product
    const selectedProduct = selectProduct(products);

    // Step 3: Generate session ID
    const sessionId = randomUUID();
    log(`Generated fresh session ID: ${sessionId}`);

    // Step 4: Add to cart
    await addToCart(sessionId, selectedProduct.id);

    // Step 5: Create order
    const order = await createOrder(sessionId);

    // Success
    log('========== PURCHASE COMPLETED AUTONOMOUSLY ==========');
    log(
      '✓ ZERO HUMAN INTERACTION: This entire e-commerce transaction ' +
      '(catalog discovery → product selection → cart addition → checkout) ' +
      'was completed by an external AI agent without any human involvement.'
    );
    log(`Transaction Summary:`);
    log(`  - Product: "${selectedProduct.name}"`);
    log(`  - Amount: ₹${order.amount }`);
    log(`  - Order ID: ${order.id}`);
    log(`  - Razorpay Order: ${order.razorpay_order_id}`);
    log(`  - Session: ${sessionId}`);
    log('========== AI AGENT COMMERCE DEMO COMPLETE ==========');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`ERROR: ${message}`);
    process.exit(1);
  }
}

main();
