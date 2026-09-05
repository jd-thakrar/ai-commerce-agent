# TechNova — AI Commerce Agent

**Razorpay AI Buildathon 2026 — Track 01: AI Growth & Agentic Commerce**

> AI handles the shopping. The customer controls the money.

## 🚀 Live Demo

**https://ai-commerce-xi.vercel.app/shop**

**Merchant Dashboard:** https://ai-commerce-xi.vercel.app/merchant

---

## 💡 What is TechNova?

TechNova is an AI-powered commerce agent that allows customers to shop using natural language instead of manually browsing an ecommerce catalog.

For example:

> "I need a laptop for programming under ₹70,000."

The AI can understand the requirement, search the live catalog, recommend products, compare options, suggest relevant products, and add items to the cart.

The customer remains in control of the actual payment through Razorpay.

---

## 🔄 How It Works

```text
User Intent
    ↓
AI Agent
    ↓
Search → Compare → Recommend
    ↓
Upsell / Cross-sell
    ↓
Cart
    ↓
Server Calculates Final Amount
    ↓
User Authorizes Purchase
    ↓
Razorpay Checkout
    ↓
Payment Verification
    ↓
Order + Audit Trail
    ↓
Merchant Dashboard
```

---

## 🤖 AI Commerce

The AI agent works with real catalog data through server-owned tools.

| Tool | Purpose |
|---|---|
| `searchProducts` | Search available products |
| `getProduct` | Get product details |
| `checkInventory` | Check stock |
| `compareProducts` | Compare products |
| `suggestUpsells` | Suggest relevant products |
| `addToCart` | Add products to cart |
| `calculateCart` | Calculate the cart total |

The AI never directly accesses Supabase or Razorpay.

---

## 🔐 Payment Safety

The AI is not trusted with the final transaction amount.

```text
AI
 ↓
Discover / Compare / Recommend
 ↓
Cart
 ↓
SERVER
 ├── Reads live cart
 ├── Checks product prices
 ├── Checks inventory
 └── Applies campaign discount
 ↓
RAZORPAY
 ↓
USER AUTHORIZES PAYMENT
 ↓
SERVER VERIFIES PAYMENT
 ↓
ORDER CONFIRMED
```

Before creating a Razorpay order, the server independently recalculates the cart total.

The payment is marked successful only after Razorpay signature verification.

No payment is initiated silently by the AI.

---

## 🏷️ Merchant Campaigns

Merchants can create and activate campaigns from the merchant dashboard.

Example:

```text
Original Price: ₹58,999
Discount: 10%
Final Price: ₹53,099
```

The campaign price is reflected consistently across the AI response, cart and checkout.

---

## 💳 Razorpay Integration

TechNova uses **Razorpay Test Mode**.

```text
Cart
 ↓
Create Razorpay Order
 ↓
Razorpay Checkout
 ↓
User Payment
 ↓
Server Signature Verification
 ↓
Order Confirmed
```

Razorpay webhooks are also verified and used to update payment status.

If a payment fails, the cart remains safe and the existing order can be retried without creating a duplicate order.

---

## 📊 Merchant Dashboard

The merchant dashboard provides visibility into:

- Sessions
- Products discovered
- Carts
- Orders
- Revenue
- Conversion
- Campaigns
- Recent transactions
- Audit activity

---

## 📝 Audit Trail

Important commerce actions are recorded in the audit log.

Examples include:

```text
PRODUCT_SEARCH
PRODUCT_RECOMMENDATION
UPSELL_SUGGESTED
PRODUCT_COMPARISON
CART_ITEM_ADDED
CHECKOUT_STARTED
RAZORPAY_ORDER_CREATED
PAYMENT_SUCCESS
PAYMENT_FAILED
CAMPAIGN_ACTIVATED
CAMPAIGN_DEACTIVATED
```

This makes the AI commerce flow traceable and auditable.

---

## 🤝 Agent-to-Agent Commerce

TechNova also includes a standalone AI buyer demonstration:

```text
scripts/ai-buyer-demo.ts
```

Run:

```bash
npx tsx scripts/ai-buyer-demo.ts
```

The script can:

1. Read the machine-readable catalog
2. Select a suitable product
3. Create a cart
4. Create a Razorpay Test Mode order

The flow intentionally stops at order creation because actual payment capture requires Razorpay Checkout and user authorization.

---

## 🏗️ Architecture

```text
                    CUSTOMER
                       │
                       ▼
                  TECHNOVA UI
                       │
                       ▼
                   AI AGENT
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Search       Compare      Upsell
          │            │            │
          └────────────┼────────────┘
                       ▼
                    SUPABASE
                       │
                       ▼
                SERVER CHECKOUT
                       │
                       ▼
                   RAZORPAY
                       │
                       ▼
              PAYMENT VERIFICATION
                       │
                       ▼
                ORDER + AUDIT
                       │
                 ┌─────┴─────┐
                 ▼           ▼
             CUSTOMER     MERCHANT
                CART       DASHBOARD
```

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript |
| UI | Tailwind CSS |
| Backend | Next.js Route Handlers |
| AI | Groq + Gemini fallback |
| Database | Supabase PostgreSQL |
| Payments | Razorpay Test Mode |
| Deployment | Vercel |

---

## 🌐 Main Routes

```text
/shop
/checkout
/merchant

/api/agent
/api/ai/catalog
/api/checkout/order
/api/checkout/verify
/api/webhooks/razorpay
```

---

## 🧪 Verified

The core flow has been tested for:

- AI product search
- Product recommendations
- Product comparison
- Inventory checking
- Cart operations
- Campaign discounts
- Razorpay order creation
- Payment verification
- Failed payment retry
- Merchant dashboard
- Audit logging

Example verified campaign:

```text
₹58,999 → 10% OFF → ₹53,099
```

---

## 📌 Scope

TechNova focuses on:

- Conversational product discovery
- AI recommendations
- Product comparison
- Upselling and cross-selling
- Cart management
- Merchant campaigns
- Safe Razorpay checkout
- Payment verification
- Auditability
- Agent-to-agent commerce proof

This is a hackathon-focused prototype and does not include:

- Real-money transactions
- Multi-merchant infrastructure
- Mobile application
- Custom ML training
- Microservices / Kubernetes
- Vector database
- Full user authentication system
- External ecommerce scraping

---

## 🔗 Project Links

**Live Demo:**  
https://ai-commerce-xi.vercel.app/shop

**Merchant Dashboard:**  
https://ai-commerce-xi.vercel.app/merchant

**GitHub Repository:**  
https://github.com/jd-thakrar/ai-commerce-agent

---

## 🏆 Built For

**Razorpay AI Buildathon 2026**

**Track 01 — AI Growth & Agentic Commerce**

> **AI handles the shopping. The customer controls the money.**
