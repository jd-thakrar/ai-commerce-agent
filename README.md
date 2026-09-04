# TechNova AI Commerce

An AI-native commerce prototype for Razorpay Track 01. The live flow is:
AI intent -> verified Supabase catalog -> cart -> explicit authorization -> Razorpay Test Mode -> server verification -> merchant audit trail.

## Run locally

```bash
npm install
npm run dev
## TechNova AI Commerce

TechNova is a working prototype for Razorpay Track 01: **AI Growth & Agentic Commerce**.

The product makes a merchant catalog understandable and transactable by an AI buyer:

```text
Buyer intent
	-> AI catalog search
	-> recommendation
	-> contextual upsell
	-> real Supabase cart
	-> explicit purchase authorization
	-> Razorpay Test Mode order
	-> Checkout
	-> server-side signature verification
	-> order and audit trail
	-> merchant control center
```

The central product rule is: **AI may discover and recommend, but it cannot silently spend money.** The customer must explicitly authorize checkout, the server calculates the amount from the database cart, and payment is marked successful only after verification.

## Track 01 Fit

This project demonstrates all four example directions from the brief:

- **Conversational in-app checkout:** the buyer describes a need in natural language and continues to a gated checkout.
- **Agent-readable catalog:** `/api/ai/catalog` exposes active products as structured JSON.
- **Upsell and cross-sell agent:** `suggestUpsells` finds real accessories and services from the Supabase catalog.
- **Merchant growth view:** `/merchant` shows live carts, orders, revenue, sessions, recommendations, and AI activity.

The “bar” is covered by three visible controls:

1. **Explainable:** the assistant recommends only products returned by commerce tools and the checkout explains the amount and payment steps.
2. **Bounded and gated:** the server owns the session, cart total, product data, Razorpay secret, and payment verification. Checkout opens only after the customer clicks authorization.
3. **Auditable:** AI tool actions, checkout authorization, Razorpay order creation, payment success, and payment failure are written to `audit_logs`.

## User Demo Flow

Use this exact flow for a submission demo:

1. Open `/shop`.
2. Enter: `I need a laptop for programming under ₹70,000`.
3. The agent calls `searchProducts` against the active Supabase catalog. Product cards show real names, prices, attributes, and stock.
4. Enter: `What accessories go with it?`.
5. The agent uses conversation context and calls `suggestUpsells` for the relevant laptop.
6. Enter: `Add the ProBook 14 to my cart`, or click **Add to cart**.
7. Open `/checkout`.
8. Review the server-backed cart and click **Authorize purchase**.
9. The server creates a Razorpay Test Mode order using the database total. Razorpay Checkout opens in the browser.
10. Complete a Razorpay test payment. The server verifies `razorpay_signature` before marking the order paid.
11. Open `/merchant` and show the order and recent AI/payment activity.
12. Repeat with a failed or dismissed payment to demonstrate graceful failure. The order stays unpaid and the failure is audited.

## Application Routes

### Pages

| Route | Purpose |
| --- | --- |
| `/` | Redirects to the customer storefront. |
| `/shop` | AI buyer mode, conversational discovery, verified product cards, and cart actions. |
| `/checkout` | Cart summary, explicit purchase authorization, Razorpay Checkout, and failure state. |
| `/merchant` | Live merchant metrics, orders, and recent AI activity from Supabase. |

### API Routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/agent` | `POST` | Runs Groq first and Gemini as fallback, with commerce tool calling. |
| `/api/products` | `GET` | Returns active catalog products for storefront loading. |
| `/api/ai/catalog` | `GET` | Returns a clean machine-readable active catalog for AI buyers. |
| `/api/cart` | `GET` | Retrieves the active cart for a browser session. |
| `/api/cart/items` | `POST` | Adds a validated product and quantity to the Supabase cart. |
| `/api/checkout/order` | `POST` | Recalculates the cart total, creates a Razorpay order, and stores the local order. |
| `/api/checkout/verify` | `POST` | Verifies the Razorpay payment signature and marks the order paid. |
| `/api/checkout/failure` | `POST` | Marks a non-paid order failed and writes a failure audit event. |
| `/api/webhooks/razorpay` | `POST` | Validates Razorpay webhook signatures and handles payment events idempotently. |
| `/api/merchant` | `GET` | Returns live merchant metrics, order summaries, and audit activity. |

## AI Architecture

The main agent is [app/api/agent/route.ts](app/api/agent/route.ts).

- Groq is the primary model provider.
- Gemini is the fallback provider when Groq is unavailable.
- Both providers use the same commerce tools and system rules.
- The browser sends prior turns as `{ role, content }`; the server sanitizes the last 20 turns.
- The server always overwrites the model-provided `session_id` with the browser session ID.
- Tool results are returned to the browser as `tool_results`, allowing the UI to render products from the database rather than rendering invented AI product data.

Commerce tools live in [lib/agent/tools.ts](lib/agent/tools.ts):

- `searchProducts`: active, in-stock, ranked catalog search with optional category and price limit.
- `getProduct`: retrieves one active product by ID.
- `suggestUpsells`: ranks real accessory/service candidates for a base product.
- `addToCart`: validates product, quantity, stock, and existing cart quantity before writing to Supabase.
- `getCart`: returns current items, quantities, subtotal/total, and item count.

## Payment Architecture

The payment boundary is split deliberately:

1. `/api/checkout/order` receives only `session_id` from the browser.
2. The server reads the active cart from Supabase and calculates the amount in paise.
3. The server calls Razorpay using Basic Auth with `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
4. The local `orders` row stores `razorpay_order_id`, amount, currency, and status.
5. The browser receives only the public Checkout key and order data required by Razorpay.
6. `/api/checkout/verify` calculates the expected HMAC from `order_id|payment_id` using the server secret and compares it in constant time.
7. Only then does the order become `paid`.
8. `payment.captured`, `payment.failed`, and `order.paid` webhooks update the order safely and avoid changing an already-paid order.

The current Supabase `orders` table does **not** contain `session_id`. Do not add that field back to payment inserts or selects without changing the database schema. The implementation links payment activity back to the browser session through the `RAZORPAY_ORDER_CREATED` record in `audit_logs`.

## Data Model Assumptions

The application expects these existing Supabase tables:

- `products`: active catalog records with `id`, `name`, `description`, `category`, `price`, `currency`, `stock`, `attributes`, `use_cases`, `tags`, and `active`.
- `carts`: active browser-session carts with `id`, `session_id`, and `status`.
- `cart_items`: cart product rows with `cart_id`, `product_id`, `quantity`, and `price_at_addition`.
- `orders`: payment records with `id`, `razorpay_order_id`, `razorpay_payment_id`, `amount`, `currency`, `status`, and timestamps.
- `audit_logs`: activity records with `session_id`, `action`, `description`, `metadata`, and timestamps.

Prices and product details are always read from Supabase. The browser cannot set the payment amount, product price, order status, or payment result.

## Audit Events

The agent currently logs provider/tool activity, and checkout logs these business events:

```text
PRODUCT_SEARCH / searchProducts
PRODUCT_RECOMMENDATION / assistant_response
UPSELL_SUGGESTED / suggestUpsells
CART_ITEM_ADDED
CHECKOUT_STARTED
RAZORPAY_ORDER_CREATED
PAYMENT_SUCCESS
PAYMENT_FAILED
```

Audit metadata may include product IDs, order IDs, payment IDs, amounts, provider, tool arguments, and tool results. Secrets must never be written to metadata.

## Environment Setup

Create `.env.local` locally. Never commit it. Use [.env.example](.env.example) only as a blank variable-name template.

```env
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GROQ_API_KEY=...
GEMINI_API_KEY=...
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_WEBHOOK_SECRET=...
```

Razorpay setup:

1. Switch the Razorpay Dashboard to **Test Mode**.
2. Open **Account & Settings -> API Keys** and generate a test key pair.
3. Put the Key ID in both `RAZORPAY_KEY_ID` and `NEXT_PUBLIC_RAZORPAY_KEY_ID`.
4. Put the API Secret only in `RAZORPAY_KEY_SECRET`.
5. After deployment, create a webhook at `https://<domain>/api/webhooks/razorpay`.
6. Create a separate webhook signing secret and put it in `RAZORPAY_WEBHOOK_SECRET`.
7. Subscribe to `payment.captured`, `payment.failed`, and `order.paid`.

The webhook secret is different from the Razorpay API Secret. Razorpay cannot call `localhost`; use the deployed HTTPS URL or a tunnel such as `ngrok http 3000` for local webhook testing.

## Run and Deploy

From the project directory:

```bash
npm install
npm run dev
```

Open `http://localhost:3000/shop`.

For deployment:

1. Import `jd-thakrar/ai-commerce-agent` into Vercel.
2. Add all variables above under **Project Settings -> Environment Variables** for Production and Preview.
3. Deploy or redeploy after changing variables.
4. Configure the Razorpay webhook with the generated Vercel HTTPS URL.
5. Test `/shop`, `/checkout`, `/merchant`, and `/api/ai/catalog` on the deployed domain.

## Validation Commands

```bash
npx tsc --noEmit
npm run lint
npm run build
```

TypeScript and the production build are expected to pass. The repository still contains legacy ESLint `any` violations in older files; these are lint debt and are separate from the runtime payment path.

## Claude Handoff Notes

Before changing behavior, read these files in this order:

1. [README.md](README.md) for this scenario and the current schema assumptions.
2. [app/api/agent/route.ts](app/api/agent/route.ts) for provider fallback, history, tool execution, and session ownership.
3. [lib/agent/tools.ts](lib/agent/tools.ts) for catalog, upsell, cart, stock, and total behavior.
4. [lib/commerce.ts](lib/commerce.ts) for audit, Razorpay requests, signatures, and order-to-session lookup.
5. The relevant route under [app/api](app/api) before changing any database contract.
6. The page under [app/shop](app/shop), [app/checkout](app/checkout), or [app/merchant](app/merchant) for UI changes.

Do not:

- Put secrets in client components, `.env.example`, Git, or audit metadata.
- Trust price, amount, product details, status, or payment success from the browser.
- Reintroduce `orders.session_id` unless the Supabase schema is intentionally migrated.
- Claim a payment succeeded before signature verification or a trusted webhook.
- Replace real catalog data with hardcoded products in the recommendation flow.
- Remove the explicit authorization step before opening Razorpay.
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
