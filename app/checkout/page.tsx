'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Cart = { items: Array<{ id: string; quantity: number; price_at_addition: number; product: { name: string } }>; total: number; currency: string; item_count: number };

declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (response: Record<string, unknown>) => void) => void } } }
const money = (value: number) => `₹${value.toLocaleString('en-IN')}`;

export default function CheckoutPage() {
  const [sessionId] = useState(() => typeof window === 'undefined' ? '' : (localStorage.getItem('ai-commerce-session') || crypto.randomUUID()));
  const [cart, setCart] = useState<Cart | null>(null);
  const [message, setMessage] = useState('Loading your cart...');
  const [authorizing, setAuthorizing] = useState(false);

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
        setMessage(verify.ok ? `Payment complete. Order ${result.order.id}` : (result.error || 'Payment verification failed.'));
        setAuthorizing(false);
      }, modal: { ondismiss: () => { fetch('/api/checkout/failure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ razorpay_order_id: data.order.razorpay_order_id }) }).catch(() => undefined); setMessage('Payment was not completed. You can retry.'); setAuthorizing(false); } } });
      checkout.on('payment.failed', () => {
        fetch('/api/checkout/failure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ razorpay_order_id: data.order.razorpay_order_id }) }).catch(() => undefined);
        setMessage("Payment wasn't completed. You can retry.");
        setAuthorizing(false);
      });
      checkout.open();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to start checkout.'); setAuthorizing(false); }
  }

  useEffect(() => { const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.async = true; document.body.appendChild(script); return () => { script.remove(); }; }, []);

  return <main className="min-h-screen bg-[#f7f7f8] px-5 py-8 text-[#111] md:px-10"><div className="mx-auto max-w-3xl"><header className="mb-10 flex items-center justify-between"><Link href="/shop" className="text-lg font-semibold tracking-tight">TechNova</Link><Link href="/shop" className="text-sm text-black/55">Back to shop</Link></header><p className="text-xs font-medium tracking-widest text-black/40">CHECKOUT</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">Authorize your purchase</h1>{cart ? <section className="mt-8 rounded-3xl border border-black/10 bg-white p-6 shadow-sm"><div className="space-y-4">{cart.items.map((item) => <div key={item.id} className="flex justify-between gap-4 border-b border-black/8 pb-4 text-sm"><span>{item.product.name} <span className="text-black/45">× {item.quantity}</span></span><span className="font-medium">{money(item.price_at_addition * item.quantity)}</span></div>)}</div><div className="mt-6 flex items-end justify-between"><div><p className="text-sm text-black/50">You are about to purchase</p><p className="mt-1 text-3xl font-semibold">{money(cart.total)}</p></div><button onClick={authorizePurchase} disabled={authorizing} className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-40">{authorizing ? 'Opening Razorpay...' : 'Authorize purchase →'}</button></div><p className="mt-5 text-sm text-black/50">{message}</p></section> : <div className="mt-8 rounded-3xl border border-black/10 bg-white p-8 text-black/55">{message}<div className="mt-5"><Link href="/shop" className="font-medium text-black underline">Find something to buy</Link></div></div>}</div></main>;
}
