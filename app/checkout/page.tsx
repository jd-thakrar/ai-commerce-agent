'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AnimatedNumber } from '../components/AnimatedNumber';

type Cart = {
  items: Array<{ id: string; quantity: number; price_at_addition: number; product: { name: string } }>;
  total: number;
  currency: string;
  item_count: number;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: Record<string, unknown>) => void) => void;
    };
  }
}

const money = (value: number) => `₹${value.toLocaleString('en-IN')}`;

export default function CheckoutPage() {
  const [sessionId] = useState(() =>
    typeof window === 'undefined' ? '' : localStorage.getItem('ai-commerce-session') || crypto.randomUUID(),
  );
  const [cart, setCart] = useState<Cart | null>(null);
  const [message, setMessage] = useState('Loading your cart...');
  const [authorizing, setAuthorizing] = useState(false);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const failureReported = useRef(false);

  useEffect(() => {
    let id = localStorage.getItem('ai-commerce-session');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('ai-commerce-session', id);
    }
    localStorage.setItem('ai-commerce-session', id);
    fetch(`/api/cart?session_id=${encodeURIComponent(id)}`)
      .then((response) => response.json())
      .then((data) => {
        setCart(data.items?.length ? data : null);
        setMessage(data.items?.length ? 'Ready for your authorization.' : 'Your cart is empty.');
      })
      .catch(() => setMessage('We could not load your cart.'));
  }, []);
  async function removeItem(itemId: string) {
    if (!sessionId) return;
    await fetch('/api/cart/items', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, item_id: itemId }),
    }).catch(() => undefined);
    const response = await fetch(`/api/cart?session_id=${encodeURIComponent(sessionId)}`);
    const data = await response.json();
    setCart(data.items?.length ? data : null);
    setMessage(data.items?.length ? 'Ready for your authorization.' : 'Your cart is empty.');
  }

  async function authorizePurchase() {
    if (!sessionId || !cart || authorizing) return;
    setPaymentFailed(false);
    failureReported.current = false;
    setAuthorizing(true);
    setMessage('Creating a secure Razorpay order...');
    try {
      const response = await fetch('/api/checkout/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to start checkout.');
      const Razorpay = window.Razorpay;
      if (!Razorpay) throw new Error('Razorpay Checkout is unavailable.');
      const checkout = new Razorpay({
        key: data.key_id,
        amount: Math.round(data.order.amount * 100),
        currency: data.order.currency,
        name: 'TechNova',
        description: 'AI-assisted purchase',
        order_id: data.order.razorpay_order_id,
        handler: async (payment: Record<string, string>) => {
          const verify = await fetch('/api/checkout/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payment),
          });
          const result = await verify.json();
          if (verify.ok) {
            setMessage(`Payment complete. Order ${result.order.id}`);
          } else {
            await reportFailure(data.order.razorpay_order_id, result.error || 'Payment verification failed.');
          }
          setAuthorizing(false);
        },
        modal: {
          ondismiss: () => {
            void reportFailure(data.order.razorpay_order_id, 'Customer cancelled Razorpay Checkout.');
            setAuthorizing(false);
          },
        },
      });
      checkout.on('payment.failed', () => {
        void reportFailure(data.order.razorpay_order_id, 'Razorpay reported payment.failed.');
        setAuthorizing(false);
      });
      checkout.open();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start checkout.');
      setAuthorizing(false);
    }
  }

  async function reportFailure(orderId: string, reason: string) {
    if (failureReported.current) return;
    failureReported.current = true;
    await fetch('/api/checkout/failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ razorpay_order_id: orderId, reason }),
    }).catch(() => undefined);
    setPaymentFailed(true);
    setMessage('Payment declined — your cart is safe, nothing was charged.');
  }

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  return (
    <main className="min-h-screen bg-bg px-4 py-6 text-text-primary md:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between border-b border-border pb-4">
          <Link href="/shop" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-xs font-bold text-accent">
              T
            </span>
            <span className="text-sm font-semibold tracking-tight">TechNova</span>
          </Link>
          <Link href="/shop" className="interactive-border border border-transparent text-xs text-text-secondary">
            Back to shop
          </Link>
        </header>

        <div className="grid gap-4 md:grid-cols-[1fr_0.72fr] md:items-start">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
              Checkout terminal
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Authorize purchase</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-text-secondary">
              Review your live cart before Razorpay opens. Nothing is charged until you authorize
              the transaction.
            </p>

            {cart ? (
              <section className="panel mt-6">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <h2 className="text-sm font-semibold tracking-tight">Order summary</h2>
                  <span className="font-mono-data text-[11px] text-text-secondary">
                    {cart.item_count} ITEM{cart.item_count === 1 ? '' : 'S'}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th className="align-right">Qty</th>
                        <th className="align-right">Line total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.product.name}</td>
                          <td className="align-right font-mono-data text-text-secondary">
                            {item.quantity}
                          </td>
                          <td className="align-right font-mono-data text-accent">
                            {money(item.price_at_addition * item.quantity)}
                          </td>
                          <td className="align-right">
                            <button
                              onClick={() => removeItem(item.id)}
                              className="text-xs text-danger hover:underline"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-end justify-between gap-4 border-t border-border px-4 py-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.06em] text-text-secondary">
                      Total INR
                    </p>
                    <AnimatedNumber
                      value={cart.total}
                      format={money}
                      className="mt-1 text-2xl font-semibold text-accent"
                    />
                  </div>
                  <button
                    onClick={authorizePurchase}
                    disabled={authorizing}
                    className="interactive-border primary-button flex min-w-40 items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold disabled:opacity-40"
                  >
                    {authorizing
                      ? <><span className="spinner" /> Opening Razorpay...</>
                      : paymentFailed
                        ? 'Try again'
                        : 'Authorize purchase'}
                  </button>
                </div>

                {paymentFailed ? (
                  <div className="border-t border-danger/40 px-4 py-3 text-sm text-danger">
                    Payment declined — your cart is safe, nothing was charged.
                  </div>
                ) : (
                  <p className="border-t border-border px-4 py-3 text-sm text-text-secondary">
                    {message}
                  </p>
                )}
              </section>
            ) : (
              <div className="panel mt-6 px-4 py-8 text-text-secondary">
                {message}
                <div className="mt-4">
                  <Link
                    href="/shop"
                    className="interactive-border border border-border bg-bg px-3 py-1.5 text-xs text-text-primary"
                  >
                    Find something to buy
                  </Link>
                </div>
              </div>
            )}
          </div>

          <aside className="panel p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
              Transaction guardrails
            </p>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="font-semibold tracking-tight">Merchant-controlled amount</p>
                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  Calculated from the live Supabase cart on the server.
                </p>
              </div>
              <div>
                <p className="font-semibold tracking-tight">Razorpay Test Mode</p>
                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  Checkout opens only after your explicit authorization.
                </p>
              </div>
              <div>
                <p className="font-semibold tracking-tight">Verified before success</p>
                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  Payment signatures and webhooks update the order safely.
                </p>
              </div>
            </div>
            <div className="mt-6 border-t border-border pt-4 text-xs text-text-secondary">
              Every money action is recorded in the merchant activity trail.
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
