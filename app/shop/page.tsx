'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AnimatedNumber } from '../components/AnimatedNumber';

type Message = { id: string; role: 'user' | 'assistant'; text: string };
type Product = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  stock: number;
  attributes: Record<string, unknown>;
  tags: string[];
  reason?: string;
};
type ToolResult = { products?: Product[]; suggestions?: Product[] };
type ActiveCampaign = {
  discount_percent: number;
  active_category: string;
  status: string;
};

const money = (value: number) => `₹${value.toLocaleString('en-IN')}`;
const starterPrompt = 'I need a laptop for programming under ₹70,000';

function specRow(product: Product) {
  return Object.entries(product.attributes || {})
    .slice(0, 4)
    .map(([key, value]) => `${key}:${String(value)}`)
    .join('  ·  ');
}

function resolvePrice(product: Product, activeCampaign: ActiveCampaign | null) {
  const isDiscounted =
    activeCampaign?.status === 'active' &&
    product.category.toLowerCase() === activeCampaign.active_category.toLowerCase();
  return isDiscounted
    ? Math.round(product.price * (1 - activeCampaign.discount_percent / 100))
    : product.price;
}

export default function ShopPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: "I can search TechNova's live catalog, compare the right fit, and help you check out when you are ready.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [cartCount, setCartCount] = useState(0);
  const [status, setStatus] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [activeCampaign, setActiveCampaign] = useState<ActiveCampaign | null>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const [addedProductId, setAddedProductId] = useState<string | null>(null);
  const [cartBouncing, setCartBouncing] = useState(false);

  useEffect(() => {
    let id = localStorage.getItem('ai-commerce-session');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('ai-commerce-session', id);
    }
    setSessionId(id);
    Promise.all([
      fetch(`/api/cart?session_id=${encodeURIComponent(id)}`).then((response) => response.json()),
      fetch('/api/products').then((response) => response.json()),
      fetch('/api/merchant').then((response) => response.json()),
    ])
      .then(([cart, catalog, merchant]) => {
        setCartCount(cart.item_count || 0);
        setProducts(catalog.products || []);
        setActiveCampaign(merchant.active_campaign || null);
      })
      .catch(() => setStatus('Catalog is temporarily unavailable. Try again in a moment.'))
      .finally(() => setCatalogLoading(false));
  }, []);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  const laptops = useMemo(
    () => products.filter((product) => product.category.toLowerCase() === 'laptop').slice(0, 4),
    [products],
  );

  function choosePrompt(prompt: string) {
    setInput(prompt);
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || loading || !sessionId) return;
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', text };
    const conversation = [...messages, userMessage];
    setMessages(conversation);
    setInput('');
    setLoading(true);
    setStatus('');
    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          message: text,
          history: messages.map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            content: message.text,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The AI assistant is unavailable.');
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'assistant', text: data.reply },
      ]);
      const results = (data.tool_results || []) as ToolResult[];
      const result = [...results]
        .reverse()
        .find((item) => item.products?.length || item.suggestions?.length);
      const discovered = result?.products || result?.suggestions;
      if (discovered?.length) setProducts(discovered);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function addProduct(product: Product) {
    if (!sessionId) return;
    setStatus(`Adding ${product.name}...`);
    const response = await fetch('/api/cart/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, product_id: product.id, quantity: 1 }),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || 'Unable to add this product.');
      return;
    }
    setCartCount(data.item_count || 0);
    setCartBouncing(true);
    window.setTimeout(() => setCartBouncing(false), 380);
    setAddedProductId(product.id);
    window.setTimeout(() => setAddedProductId((current) => current === product.id ? null : current), 800);
    setStatus(`${product.name} added to your cart.`);
  }

  return (
    <main className="min-h-screen bg-bg text-text-primary">
      <div className="mx-auto max-w-[1440px] px-4 md:px-8">
        <header className="flex items-center justify-between border-b border-border py-3">
          <Link href="/shop" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-xs font-bold tracking-tight text-accent">
              T
            </span>
            <span className="text-sm font-semibold tracking-tight">TechNova</span>
          </Link>
          <nav className="flex items-center gap-4 text-xs text-text-secondary">
            <span className="hidden font-mono-data md:inline">SYS · AI COMMERCE</span>
            <Link href="/merchant" className="interactive-border border border-transparent px-2 py-1">
              Merchant
            </Link>
            <Link
              href="/checkout"
              className="interactive-border border border-border bg-surface px-3 py-1.5"
            >
              Cart{' '}
              <span className={`inline-block ${cartBouncing ? 'badge-bounce' : ''}`}><AnimatedNumber value={cartCount} className="ml-1 text-accent" /></span>
            </Link>
          </nav>
        </header>

        <section className="border-b border-border py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                AI buyer terminal
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
                Intent-driven commerce
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-text-secondary">
                Live catalog discovery, explicit authorization, auditable transactions.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => choosePrompt(starterPrompt)}
                className="interactive-border primary-button px-4 py-2 text-xs font-semibold"
              >
                Run sample query
              </button>
              <Link
                href="/merchant"
                className="interactive-border border border-border bg-surface px-4 py-2 text-xs text-text-secondary"
              >
                Merchant console
              </Link>
            </div>
          </div>
        </section>

        <section className="grid border-b border-border py-2 text-[11px] font-mono-data text-text-secondary md:grid-cols-4">
          <span>LIVE CATALOG</span>
          <span>RAZORPAY TEST</span>
          <span>AUDIT TRAIL ON</span>
          <span className="text-right">
            {activeCampaign?.status === 'active'
              ? `CAMPAIGN −${activeCampaign.discount_percent}% ${activeCampaign.active_category.toUpperCase()}`
              : 'NO ACTIVE CAMPAIGN'}
          </span>
        </section>

        <section className="grid gap-4 py-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="panel flex h-[560px] flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                  Discovery chat
                </p>
                <h2 className="text-sm font-semibold tracking-tight">Session interface</h2>
              </div>
              <span className="font-mono-data text-[11px] text-success">LIVE</span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    `message-enter ${message.role === 'user'
                      ? 'ml-6 rounded-xl border border-border bg-bg px-3 py-2 text-sm leading-5'
                      : 'mr-6 rounded-xl border border-border bg-surface px-3 py-2 text-sm leading-5 text-text-secondary'}`
                  }
                >
                  {message.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-text-primary prose-strong:text-text-primary prose-a:text-accent prose-p:text-text-secondary">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                    </div>
                  ) : (
                    message.text
                  )}
                </div>
              ))}
              {loading && (
                <div className="mr-6 border border-border px-3 py-2 text-sm text-text-secondary">
                  Querying catalog...
                </div>
              )}
              <div ref={endOfMessagesRef} />
            </div>

            <form onSubmit={sendMessage} className="border-t border-border p-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                rows={2}
                placeholder="I need a laptop for programming under ₹70,000"
                className="input-control w-full resize-none px-3 py-2 text-sm leading-5 text-text-primary placeholder:text-text-secondary"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[10px] text-text-secondary">
                  Enter send · Shift+Enter newline
                </span>
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="interactive-border primary-button px-3 py-1.5 text-[11px] font-semibold disabled:opacity-35"
                >
                  Send
                </button>
              </div>
            </form>
          </div>

          <div>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                  Catalog feed
                </p>
                <h2 className="text-sm font-semibold tracking-tight">Verified matches</h2>
              </div>
              <span className="font-mono-data text-[11px] text-text-secondary">
                {catalogLoading ? 'LOADING' : `${laptops.length} ROWS`}
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {laptops.map((product) => {
                const displayPrice = resolvePrice(product, activeCampaign);
                const specs = specRow(product);
                return (
                  <article key={product.id} className="panel product-card p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div><div className="category-icon mb-3 text-lg">{product.category.toLowerCase() === 'laptop' ? '⌘' : product.category.toLowerCase() === 'service' ? '✦' : '◌'}</div><h3 className="text-sm font-bold leading-tight tracking-tight">{product.name}</h3></div>
                      <div className="shrink-0 text-right">
                        <AnimatedNumber
                          value={displayPrice}
                          format={money}
                          className="text-sm font-semibold text-accent"
                        />
                        <p
                          className={`mt-0.5 font-mono-data text-[10px] ${
                            product.stock > 0 ? 'text-success' : 'text-danger'
                          }`}
                        >
                          {product.stock > 0 ? `STK ${product.stock}` : 'OUT'}
                        </p>
                      </div>
                    </div>

                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-secondary">
                      {product.description || 'Built for focused work and everyday performance.'}
                    </p>

                    {product.reason && (
                      <p className="mt-1 truncate text-[11px] text-text-secondary">
                        {product.reason}
                      </p>
                    )}

                    {specs && (
                      <div className="mt-3 flex flex-wrap gap-1.5">{specs.split('  ·  ').map((spec) => <span key={spec} className="rounded-full bg-surface px-2 py-1 text-[10px] text-text-secondary">{spec}</span>)}</div>
                    )}

                    <button
                      onClick={() => addProduct(product)}
                      disabled={product.stock < 1}
                      className="interactive-border primary-button mt-5 w-full py-2.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {addedProductId === product.id ? '✓ Added' : 'Add to cart'}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {status && (
          <p className="border-t border-border py-3 text-xs text-accent-gold">{status}</p>
        )}

        <footer className="flex flex-col gap-2 border-t border-border py-4 text-[11px] text-text-secondary md:flex-row md:items-center md:justify-between">
          <span>TechNova · controlled AI commerce</span>
          <span className="font-mono-data">DISCOVER → RECOMMEND → AUTHORIZE → PAY</span>
        </footer>
      </div>
    </main>
  );
}
