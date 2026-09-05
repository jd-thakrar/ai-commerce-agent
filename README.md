# TechNova — AI Commerce Agent

**Razorpay AI Buildathon 2026 — Track 01: AI Growth & Agentic Commerce**

> Grow the merchant's revenue, and make them sellable to AI buyers.

TechNova is a working, end-to-end prototype that turns a merchant catalog into
something an AI agent — human-operated or fully autonomous — can discover,
reason about, and transact against, with every money action **explainable,
bounded, gated, and auditable.**

---

## 1. The problem, in one paragraph

NPCI's UAP and the global race between agent-commerce protocols (Stripe/OpenAI's
ACP, Google's AP2, Coinbase's x402) are all trying to answer the same question:
**how does an AI agent safely buy something on a human's behalf, or transact
with another agent entirely, without a human clicking "confirm" at every step?**
Nobody has this fully solved yet. TechNova is a concrete answer to the *safety
pattern* that any such system needs — demonstrated on real Razorpay test-mode
payments, not a mockup.

---

## 2. What TechNova actually does

```
Buyer intent
  → AI catalog search (real Supabase inventory)
  → recommendation with stated reasoning
  → structured comparison (when asked)
  → contextual upsell
  → cart (server-owned, session-scoped)
  → explicit purchase authorization
  → Razorpay Test Mode order (server recalculates the total — never trusts the AI)
  → Checkout
  → server-side signature verification
  → order + audit trail
  → merchant control center
```

**The one rule the whole system is built around:**
**AI may discover, compare, and recommend — but it cannot silently spend money.**
The customer (or an external agent) must explicitly authorize checkout, the
server independently recalculates the amount from the database cart, and
payment is only marked successful after Razorpay's signature is verified.

---

## 3. How this maps to the brief's four example directions

| Brief's example direction | Where it lives |
|---|---|
| Conversational in-app checkout | `/shop` chat → cart → `/checkout` → Razorpay |
| Agent-readable catalog | `GET /api/ai/catalog` — structured JSON, no chat required |
| Upsell & cross-sell agent | `suggestUpsells` tool, ranks real complementary products |
| Campaign orchestrator | `/merchant` Campaigns panel — activate/deactivate discounts, agent applies them live |

**Plus a fifth proof point beyond the four directions:** `scripts/ai-buyer-demo.ts`
— a standalone script with **zero human interaction** that discovers the
catalog, decides on a product, builds a cart, and creates a real Razorpay order
entirely programmatically. This is the literal agent-to-agent case the brief's
"why now" paragraph opens with.

---

## 4. "The bar" — explainable, bounded, gated, auditable

1. **Explainable.** Every product recommendation includes a model-generated
   `reason` tied to the customer's stated budget/use case. Comparisons render
   as a structured Markdown table with a one-line verdict, not a wall of prose.
2. **Bounded.** The AI never touches Supabase or Razorpay directly — it can
   only call a fixed set of server-owned tools (below). The server
   **independently recalculates the cart total** before creating a Razorpay
   order; it never trusts a number the model produced.
3. **Gated.** Checkout only opens after the customer clicks "Authorize
   purchase." No payment is ever initiated silently.
4. **Auditable.** Every tool call, checkout authorization, order creation,
   payment outcome, and campaign change is written to `audit_logs` with a
   timestamp and metadata. The merchant dashboard reads this live.
5. **One failure handled gracefully.** A declined/cancelled Razorpay payment
   shows a clear "Payment declined — your cart is safe, nothing was charged"
   state with a "Try again" button. The existing order row is reused on retry
   (no duplicate orders), and the cart is never cleared on failure — only on
   confirmed success.

---

## 5. Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) + React + TypeScript, Tailwind CSS |
| Backend | Next.js Route Handlers |
| AI | Groq (primary) with Gemini as fallback — same tool-calling contract for both |
| Database | Supabase (PostgreSQL) |
| Payments | Razorpay Test Mode |
| Deployment | Vercel |

---

## 6. Database schema

**products** — `id, name, description, category, price, currency, stock, attributes (jsonb), use_cases (text[]), tags (text[]), active, created_at`
Prices stored in **rupees**; converted to paise only at the point of calling Razorpay.

**carts** — `id, session_id, status, created_at, updated_at`
One active cart per browser session — no login required (intentionally out of
scope, see §16).

**cart_items** — `id, cart_id, product_id, quantity, price_at_addition, created_at`

**orders** — `id, cart_id, razorpay_order_id, razorpay_payment_id, amount, currency, status, created_at`
`status` is one of `created | paid | failed`. A failed retry **updates this
same row** rather than inserting a new one.

**audit_logs** — `id, session_id, action, description, metadata (jsonb), created_at`

**campaigns** — `id, name, discount_percent, active_category, status, created_at`
Only one campaign may be `active` at a time; activating one deactivates any
other.

Setup script: `supabase/migrations/001_create_campaigns.sql` (and follow-up
migrations) — run once via Supabase SQL Editor or CLI.

---

## 7. Agent architecture

Main agent route: `app/api/agent/route.ts`

- Groq is the primary provider; Gemini is the fallback when Groq is unavailable.
- Both providers share the exact same tool-calling contract, defined once in
  `lib/agent/tools.ts` — behavior is identical regardless of which model answered.
- The server **always overwrites** the `session_id` the model might produce
  with the browser's actual session ID — the model never controls session
  identity.
- Tool results are returned to the browser as structured `tool_results` and
  rendered from real database rows — the UI never displays AI-invented
  product data.
- Assistant replies are rendered as Markdown (tables, bold, lists) via
  `react-markdown` + `remark-gfm` — comparisons render as real tables, not
  raw text.

**Tools** (`lib/agent/tools.ts`):

| Tool | Purpose |
|---|---|
| `searchProducts` | Active, in-stock catalog search with optional category/price/tag filters, campaign-aware pricing |
| `getProduct` | Full details for one product, campaign-aware pricing |
| `checkInventory` | Verifies stock before purchase |
| `suggestUpsells` | Ranks real complementary products by shared `use_cases` |
| `compareProducts` | Normalizes 2–4 products' attributes into a structured diff for table rendering |
| `addToCart` | Validates product/quantity/stock, writes to Supabase |
| `calculateCart` | Server-side total, campaign discount applied here — never trusts the model's math |

Every tool call is logged to `audit_logs` with its arguments and result.

---

## 8. Payment architecture

The payment boundary is deliberately split so the AI is never in the money path:

1. Browser sends only `{ session_id }` to `POST /api/checkout/order`.
2. Server reads the **live** cart from Supabase, applies any active campaign
   discount, and computes the amount independently — in paise, for Razorpay.
3. Server calls Razorpay using Basic Auth (`RAZORPAY_KEY_ID` /
   `RAZORPAY_KEY_SECRET` — server-only, never sent to the client).
4. Local `orders` row stores the Razorpay order ID, amount, and status.
5. Browser receives only the public Checkout key + order data needed to open
   Razorpay Checkout.
6. `POST /api/checkout/verify` recomputes the expected HMAC signature from
   `order_id|payment_id` using the server secret and compares it — **only
   then** does the order become `paid`.
7. `POST /api/webhooks/razorpay` independently verifies Razorpay's webhook
   signature and updates order status idempotently (`payment.captured`,
   `payment.failed`, `order.paid`) — safe against replays and out-of-order
   delivery.
8. On confirmed success, the cart is cleared and marked `checked_out`. On
   failure, the cart is left untouched and the existing order row is reused
   on retry.

**Known constraint:** Razorpay cannot call `localhost`. Webhook testing
requires the deployed HTTPS URL or a tunnel (`ngrok http 3000`) with the
webhook temporarily repointed — always reset it to the production URL
afterward.

---

## 9. Campaign orchestrator

- `/merchant` → Campaigns panel lists all campaigns with Activate/Deactivate
  actions and a "New campaign" form (name, discount %, category).
- Activating a campaign deactivates any other active one and writes a
  `CAMPAIGN_ACTIVATED` audit event.
- The agent fetches the active campaign before answering — if one applies to
  a product's category, the agent quotes the **discounted** price (never the
  original), and `calculateCart`/checkout apply the same discount server-side.
  Verified in testing: a 10%-off campaign on an ₹58,999 item correctly quoted
  and charged ₹53,099 throughout chat, cart, and checkout.
- `campaign_influenced_orders` on the dashboard counts orders created while a
  campaign was active, joined against `audit_logs` timestamps.

---

## 10. Agent-to-agent proof (`scripts/ai-buyer-demo.ts`)

A standalone Node/TypeScript script, run outside the browser entirely:

```bash
npx tsx scripts/ai-buyer-demo.ts
```

1. `GET /api/ai/catalog` — fetches the machine-readable catalog
2. Filters products programmatically against a hardcoded intent (price ≤
   ₹70,000, tag includes "coding") — no LLM call, pure logic, representing a
   rules-based or agent-decided intent
3. Generates a fresh `session_id`, adds the selected product to a new cart
   via `POST /api/cart/items`
4. Creates a real Razorpay test order via `POST /api/checkout/order` — the
   server recalculates the amount exactly as it would for a human checkout
5. Logs every step with a timestamp, prefixed `[AI BUYER]`

This intentionally stops at order creation, not `paid` — actual payment
capture requires Razorpay's Checkout UI (a browser), which is identical to
the already-proven human flow. The script's job is to prove the
**discovery → decision → order** pipeline works with zero human input; the
signature-verified payment step underneath is the same code path already
demonstrated live.

---

## 11. Audit events (non-exhaustive)

```
PRODUCT_SEARCH / searchProducts
PRODUCT_RECOMMENDATION / assistant_response
UPSELL_SUGGESTED / suggestUpsells
compareProducts
CART_ITEM_ADDED
CHECKOUT_STARTED
RAZORPAY_ORDER_CREATED
PAYMENT_SUCCESS / PAYMENT_FAILED
CAMPAIGN_ACTIVATED / CAMPAIGN_DEACTIVATED
Razorpay webhook: order.paid / payment.failed
```

Metadata may include product IDs, order IDs, payment IDs, amounts, provider,
and tool arguments/results. **Secrets are never written to audit metadata.**

---

## 12. Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=       # server-only
GROQ_API_KEY=
GEMINI_API_KEY=
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=             # server-only
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_WEBHOOK_SECRET=         # different from the API secret
```

Never commit `.env.local`. `.env.example` holds blank variable names only.

---

## 13. Running locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000/shop`. Note: Razorpay **cannot** call `localhost`
for webhooks — full paid-status confirmation only works on the deployed URL
(or via an ngrok tunnel, temporarily repointed).

## 14. Deploying

1. Push to `main` — Vercel auto-deploys from this branch.
2. Set all environment variables above under Vercel → Project Settings →
   Environment Variables (Production + Preview).
3. Configure the Razorpay webhook to
   `https://<your-domain>/api/webhooks/razorpay`, subscribed to
   `payment.captured`, `payment.failed`, `order.paid`.
4. **`scripts/` is excluded from the production TypeScript build** (see
   `tsconfig.json` `exclude`) — it's a standalone dev/demo tool, not part of
   the deployed app, and should never block a production build.

---

## 15. Demo script (~5 minutes)

1. **(0:00–0:30)** State the problem: agent-to-agent commerce is the open
   problem of the year; TechNova is the safety layer that makes a merchant
   safely transactable by an AI buyer.
2. **(0:30–1:30)** `/shop`: "I need a laptop for coding under ₹70,000" →
   agent recommends with stated reasoning, real catalog data.
3. **(1:30–2:15)** "Compare ProBook 14 and CodeBook Pro" → renders as a real
   Markdown table with a one-line verdict. Add an upsell.
4. **(2:15–3:00)** `/checkout` → review the guardrails panel → authorize →
   Razorpay opens.
5. **(3:00–3:45)** Trigger one declined payment → show the graceful failure
   state → "Try again" → succeed. Point out: same order row reused, cart
   never lost.
6. **(3:45–4:15)** `/merchant` → activate a campaign live → show the agent
   immediately quoting the discounted price in chat and at checkout.
7. **(4:15–4:45)** Run `npx tsx scripts/ai-buyer-demo.ts` live in a terminal
   — narrate: *"Everything so far was a human using our agent. This is a
   different AI agent buying with zero human input — the actual
   agent-to-agent case this track is built around."*
8. **(4:45–5:00)** `/merchant` dashboard — audit trail, revenue, conversion,
   campaign-influenced orders — all provably correct, not decorative.

---

## 16. What we deliberately did not build

No scraped e-commerce platform · no real-money transactions · no custom ML
training · no microservices/Kubernetes · no multi-merchant system · no mobile
app · no user authentication/account system · no vector database.

These are out of scope for the track's actual bar (explainable / bounded /
gated / auditable), not oversights — session-based carts are a legitimate,
standard pattern at this scope, and building any of the above would trade
correctness on what's actually judged for surface area that isn't.

---

## 17. Verified correctness (not just "it runs")

- Checkout total independently hand-verified against line items (₹1,35,998 +
  ₹899 + ₹1,17,998 + ₹42,999 = ₹2,97,894 ✓)
- Campaign discount math verified (₹58,999 × 0.90 = ₹53,099 ✓, applied
  consistently in chat, catalog, and checkout)
- Dashboard revenue verified as sum of `paid`-status orders only
- Conversion rate verified as `paid orders / carts created`, clamped to 100%
- Failed-payment retry verified to reuse the existing order row, not create
  a duplicate
- Real Razorpay order (`order_TYDM23gycTN2cu`, ₹69,499) cross-checked
  directly against the Razorpay dashboard, confirming server-side amount
  calculation is correct end to end
