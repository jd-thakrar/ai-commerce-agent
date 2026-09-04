'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type Cart = { items: Array<{ id: string; quantity: number; price_at_addition: number; product: { name: string } }>; total: number; currency: string; item_count: number };

declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (response: Record<string, unknown>) => void) => void } } }
const money = (value: number) => `₹${value.toLocaleString('en-IN')}`;

export default function CheckoutPage() {
  const [sessionId] = useState(() => typeof window === 'undefined' ? '' : (localStorage.getItem('ai-commerce-session') || crypto.randomUUID()));
  const [cart, setCart] = useState<Cart | null>(null);
  const [message, setMessage] = useState('Loading your cart...');
  const [authorizing, setAuthorizing] = useState(false);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const failureReported = useRef(false);

  useEffect(() => {
    let id = localStorage.getItem('ai-commerce-session');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('ai-commerce-session', id); }
    localStorage.setItem('ai-commerce-session', id);
    fetch(`/api/cart?session_id=${encodeURIComponent(id)}`).then((response) => response.json()).then((data) => {
      setCart(data.items?.length ? data : null);
      setMessage(data.items?.length ? 'Ready for your authorization.' : 'Your cart is empty.');
    }).catch(() => setMessage('We could not load your cart.'));
  }, []);

  async function authorizePurchase() {
    if (!sessionId || !cart || authorizing) return;
    setPaymentFailed(false);
    failureReported.current = false;
    setAuthorizing(true); setMessage('Creating a secure Razorpay order...');
    try {
      const response = await fetch('/api/checkout/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to start checkout.');
      const Razorpay = window.Razorpay;
      if (!Razorpay) throw new Error('Razorpay Checkout is unavailable.');
      const checkout = new Razorpay({ key: data.key_id, amount: Math.round(data.order.amount * 100), currency: data.order.currency, name: 'TechNova', description: 'AI-assisted purchase', order_id: data.order.razorpay_order_id, handler: async (payment: Record<string, string>) => {
        const verify = await fetch('/api/checkout/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payment) });
        const result = await verify.json();
        if (verify.ok) {
          setMessage(`Payment complete. Order ${result.order.id}`);
        } else {
          await reportFailure(data.order.razorpay_order_id, result.error || 'Payment verification failed.');
        }
        setAuthorizing(false);
      }, modal: { ondismiss: () => { void reportFailure(data.order.razorpay_order_id, 'Customer cancelled Razorpay Checkout.'); setAuthorizing(false); } } });
      checkout.on('payment.failed', () => {
        void reportFailure(data.order.razorpay_order_id, 'Razorpay reported payment.failed.');
        setAuthorizing(false);
      });
      checkout.open();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to start checkout.'); setAuthorizing(false); }
  }

  async function reportFailure(orderId: string, reason: string) {
    if (failureReported.current) return;
    failureReported.current = true;
    await fetch('/api/checkout/failure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ razorpay_order_id: orderId, reason }) }).catch(() => undefined);
    setPaymentFailed(true);
    setMessage('Payment declined — your cart is safe, nothing was charged.');
  }

  useEffect(() => { const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.async = true; document.body.appendChild(script); return () => { script.remove(); }; }, []);

  return <main className="min-h-screen bg-[#f4eee3] px-5 py-8 text-[#17120f] md:px-10"><div className="mx-auto max-w-5xl"><header className="mb-12 flex items-center justify-between border-b border-black/10 pb-5"><Link href="/shop" className="flex items-center gap-3 text-sm font-semibold tracking-[0.2em]"><span className="brand-mark">T</span> TECHNOVA</Link><Link href="/shop" className="text-sm text-black/55">Back to shop</Link></header><div className="grid gap-10 md:grid-cols-[1fr_0.72fr] md:items-start"><div><p className="text-xs font-semibold tracking-[0.2em] text-[#a46f16]">FINAL STEP · EXPLICIT AUTHORIZATION</p><h1 className="mt-3 max-w-xl text-5xl font-medium tracking-[-0.055em]">A purchase you can trust.</h1><p className="mt-5 max-w-md text-base leading-7 text-black/55">Review your live cart before Razorpay opens. Nothing is charged until you authorize the transaction.</p>{cart ? <section className="mt-10 rounded-[26px] border border-black/10 bg-white p-6 shadow-sm"><div className="mb-6 flex items-center justify-between"><h2 className="font-semibold">Order summary</h2><span className="text-xs text-black/45">{cart.item_count} item{cart.item_count === 1 ? '' : 's'}</span></div><div className="space-y-4">{cart.items.map((item) => <div key={item.id} className="flex justify-between gap-4 border-b border-black/8 pb-4 text-sm"><span>{item.product.name} <span className="text-black/45">× {item.quantity}</span></span><span className="font-medium">{money(item.price_at_addition * item.quantity)}</span></div>)}</div><div className="mt-6 flex items-end justify-between gap-5"><div><p className="text-xs text-black/45">Total in INR</p><p className="mt-1 text-3xl font-semibold">{money(cart.total)}</p></div><button onClick={authorizePurchase} disabled={authorizing} className="rounded-full bg-[#17120f] px-5 py-3 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-40">{authorizing ? 'Opening Razorpay...' : paymentFailed ? 'Try again' : 'Authorize purchase →'}</button></div>{paymentFailed ? <div className="mt-5 rounded-2xl border border-red-900/15 bg-red-50 px-4 py-3 text-sm text-red-900">Payment declined — your cart is safe, nothing was charged.</div> : <p className="mt-5 text-sm text-black/55">{message}</p>}</section> : <div className="mt-10 rounded-[26px] border border-black/10 bg-white p-8 text-black/55">{message}<div className="mt-5"><Link href="/shop" className="font-medium text-black underline">Find something to buy</Link></div></div>}</div><aside className="rounded-[26px] bg-[#17120f] p-7 text-[#f4eee3]"><p className="text-xs font-semibold tracking-[0.18em] text-[#d7a548]">TRANSACTION GUARDRAILS</p><div className="mt-7 space-y-6 text-sm"><div><p className="font-medium">Merchant-controlled amount</p><p className="mt-1 text-xs leading-5 text-white/45">Calculated from the live Supabase cart on the server.</p></div><div><p className="font-medium">Razorpay Test Mode</p><p className="mt-1 text-xs leading-5 text-white/45">Checkout opens only after your explicit authorization.</p></div><div><p className="font-medium">Verified before success</p><p className="mt-1 text-xs leading-5 text-white/45">Payment signatures and webhooks update the order safely.</p></div></div><div className="mt-8 border-t border-white/15 pt-5 text-xs text-white/45">Every money action is recorded in the merchant activity trail.</div></aside></div></div></main>;
}
