# TechNova AI Commerce

An AI-native commerce prototype for Razorpay Track 01. The live flow is:
AI intent -> verified Supabase catalog -> cart -> explicit authorization -> Razorpay Test Mode -> server verification -> merchant audit trail.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000/shop`.

Required server environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GROQ_API_KEY=...
GEMINI_API_KEY=...
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
NEXT_PUBLIC_RAZORPAY_KEY_ID=...
RAZORPAY_WEBHOOK_SECRET=...
```

For local checkout, these Razorpay variables must be present in `.env.local` (not `.env.example`). Get `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and the public key ID from Razorpay Dashboard -> Test Mode -> Account & Settings -> API Keys. The checkout route returns a configuration message instead of attempting payment when any of these values is missing.

Never commit `.env.local` or expose server keys through `NEXT_PUBLIC_` variables. Configure the Razorpay webhook URL as `https://<deployment>/api/webhooks/razorpay` and subscribe to `payment.captured`, `payment.failed`, and `order.paid`.

## Demo routes

- `/shop` customer AI buyer experience
- `/checkout` explicit payment authorization and Razorpay Checkout
- `/merchant` live merchant metrics and AI activity
- `/api/ai/catalog` machine-readable active catalog

## Deploy and configure Razorpay

1. Open [vercel.com/new](https://vercel.com/new), import `jd-thakrar/ai-commerce-agent`, and deploy it.
2. In Vercel, open **Project Settings -> Environment Variables** and add every variable from the block above for **Production** and **Preview**.
3. Redeploy after saving the variables. Your public submission URL will look like `https://ai-commerce-agent-....vercel.app`.
4. In the Razorpay Dashboard, switch to **Test Mode**, open **Account & Settings -> API Keys**, and generate a key pair. Put the Key ID in both `RAZORPAY_KEY_ID` and `NEXT_PUBLIC_RAZORPAY_KEY_ID`; put the Secret only in `RAZORPAY_KEY_SECRET`.
5. In Razorpay, open **Account & Settings -> Webhooks -> Add New Webhook**. Set the webhook URL to `https://<your-vercel-domain>/api/webhooks/razorpay`, create a random signing secret, and copy that same value to `RAZORPAY_WEBHOOK_SECRET` in Vercel.
6. Subscribe to `payment.captured`, `payment.failed`, and `order.paid`, then redeploy once more if the webhook secret was added afterward.

The webhook secret is not the Razorpay API Secret. It is created separately when you add the webhook. Razorpay cannot call `localhost`; for local webhook testing use a tunnel such as `ngrok http 3000` and set the generated HTTPS URL as the webhook endpoint temporarily.

Validate the deployed `/shop`, `/checkout`, `/merchant`, and `/api/ai/catalog` routes before submitting.

## Validation

```bash
npx tsc --noEmit
npm run lint
npm run build
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
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
