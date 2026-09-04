'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

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

const money = (value: number) => `₹${value.toLocaleString('en-IN')}`;
const starterPrompt = 'I need a laptop for programming under ₹70,000';

function attributeSummary(product: Product) {
  return Object.entries(product.attributes || {})
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('  ·  ');
}

export default function ShopPage() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', text: 'I can search TechNova\'s live catalog, compare the right fit, and help you check out when you are ready.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [cartCount, setCartCount] = useState(0);
  const [status, setStatus] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    let id = localStorage.getItem('ai-commerce-session');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('ai-commerce-session', id); }
    setSessionId(id);
    Promise.all([
      fetch(`/api/cart?session_id=${encodeURIComponent(id)}`).then((response) => response.json()),
      fetch('/api/products').then((response) => response.json()),
    ]).then(([cart, catalog]) => {
      setCartCount(cart.item_count || 0);
      setProducts(catalog.products || []);
    }).catch(() => setStatus('Catalog is temporarily unavailable. Try again in a moment.'))
      .finally(() => setCatalogLoading(false));
  }, []);

  const laptops = useMemo(() => products.filter((product) => product.category.toLowerCase() === 'laptop').slice(0, 4), [products]);

  function choosePrompt(prompt: string) { setInput(prompt); }

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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: text, history: messages.map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', content: message.text })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The AI assistant is unavailable.');
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: data.reply }]);
      const results = (data.tool_results || []) as ToolResult[];
      const result = [...results].reverse().find((item) => item.products?.length || item.suggestions?.length);
      const discovered = result?.products || result?.suggestions;
      if (discovered?.length) setProducts(discovered);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Something went wrong.');
    } finally { setLoading(false); }
  }

  async function addProduct(product: Product) {
    if (!sessionId) return;
    setStatus(`Adding ${product.name}...`);
    const response = await fetch('/api/cart/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, product_id: product.id, quantity: 1 }) });
    const data = await response.json();
    if (!response.ok) { setStatus(data.error || 'Unable to add this product.'); return; }
    setCartCount(data.item_count || 0);
    setStatus(`${product.name} added to your cart.`);
  }

  return (
    <main className="storefront-shell min-h-screen text-[#f4eee3]">
      <div className="mx-auto max-w-[1440px] px-5 md:px-10">
        <header className="flex items-center justify-between border-b border-[#d9cdb9]/15 py-5">
          <Link href="/shop" className="flex items-center gap-3"><span className="brand-mark">T</span><span className="text-sm font-semibold tracking-[0.22em]">TECHNOVA</span></Link>
          <nav className="flex items-center gap-3 text-xs text-[#cfc4b4] md:gap-6"><span className="hidden md:inline">AI-ready commerce layer</span><Link href="/merchant" className="transition hover:text-white">Merchant view</Link><Link href="/checkout" className="rounded-full border border-[#d9cdb9]/25 px-3 py-2 text-[#f4eee3] transition hover:border-[#d9cdb9]/60">Cart <span className="ml-1 text-[#d7a548]">{cartCount}</span></Link></nav>
        </header>

        <section className="grid gap-10 pb-14 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:pt-20">
          <div>
            <div className="mb-6 flex items-center gap-3 text-xs font-semibold tracking-[0.2em] text-[#d7a548]"><span className="h-px w-8 bg-[#d7a548]" /> AI BUYER MODE</div>
            <h1 className="max-w-3xl text-5xl font-medium leading-[0.98] tracking-[-0.055em] md:text-7xl">Commerce that<br /><span className="text-[#d8cbbb]">understands intent.</span></h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-[#b8ada0] md:text-lg">TechNova makes its catalog discoverable, recommendable, and transactable by AI buyers, with every money action explicit and auditable.</p>
            <div className="mt-9 flex flex-wrap gap-2"><button onClick={() => choosePrompt(starterPrompt)} className="rounded-full bg-[#f4eee3] px-5 py-3 text-sm font-semibold text-[#17120f] transition hover:bg-white">Try the AI buyer <span className="ml-2">↗</span></button><Link href="/merchant" className="rounded-full border border-[#d9cdb9]/25 px-5 py-3 text-sm text-[#e2d8cc] transition hover:border-[#d9cdb9]/60">See merchant impact</Link></div>
          </div>
          <div className="relative overflow-hidden rounded-[28px] border border-[#d9cdb9]/15 bg-[#1c1814] p-6 md:p-8"><div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-[#d7a548]/10 blur-3xl" /><div className="relative"><div className="flex items-center justify-between border-b border-[#d9cdb9]/15 pb-5"><span className="text-xs tracking-[0.16em] text-[#d7a548]">CONTROLLED TRANSACTION</span><span className="flex items-center gap-2 text-xs text-[#9eaa91]"><i className="h-2 w-2 rounded-full bg-[#91a77d]" /> Live catalog</span></div><div className="space-y-5 py-6 text-sm"><div><span className="text-[#877c70]">01</span><span className="ml-4 text-[#e8ded1]">Understand buyer intent</span></div><div><span className="text-[#877c70]">02</span><span className="ml-4 text-[#e8ded1]">Recommend from real inventory</span></div><div><span className="text-[#877c70]">03</span><span className="ml-4 text-[#e8ded1]">Authorize. Pay. Audit.</span></div></div><div className="border-t border-[#d9cdb9]/15 pt-5 text-xs leading-5 text-[#998e81]">No invented products. No silent payments.<br /><span className="text-[#d7a548]">Every step is bounded by the merchant.</span></div></div></div>
        </section>

        <section className="border-y border-[#d9cdb9]/15 py-3"><div className="flex flex-wrap items-center justify-between gap-3 text-[10px] uppercase tracking-[0.18em] text-[#877c70]"><span>Live merchant catalog</span><span>AI-readable by design</span><span>Razorpay test mode</span><span>Activity trail on every action</span></div></section>

        <section className="grid gap-8 py-12 lg:grid-cols-[0.8fr_1.2fr] lg:py-16">
          <div className="rounded-[28px] border border-[#d9cdb9]/15 bg-[#181410] p-5 md:p-7"><div className="mb-7 flex items-center justify-between"><div><p className="text-[10px] font-semibold tracking-[0.18em] text-[#d7a548]">CONVERSATIONAL DISCOVERY</p><h2 className="mt-2 text-2xl font-medium tracking-[-0.03em]">Ask for anything.</h2></div><span className="text-xs text-[#877c70]">Session live</span></div><div className="max-h-[390px] space-y-4 overflow-y-auto pr-1">{messages.map((message) => <div key={message.id} className={message.role === 'user' ? 'ml-8 rounded-2xl rounded-br-sm bg-[#f4eee3] px-4 py-3 text-sm leading-6 text-[#17120f]' : 'mr-8 rounded-2xl rounded-bl-sm border border-[#d9cdb9]/15 bg-[#211c17] px-4 py-3 text-sm leading-6 text-[#d8cbbb]'}>{message.text}</div>)}{loading && <div className="mr-8 rounded-2xl border border-[#d9cdb9]/15 px-4 py-3 text-sm text-[#877c70]">Searching the live catalog...</div>}</div><form onSubmit={sendMessage} className="mt-6 border-t border-[#d9cdb9]/15 pt-5"><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} rows={2} placeholder="I need a laptop for programming under ₹70,000" className="w-full resize-none bg-transparent text-sm leading-6 text-[#f4eee3] outline-none placeholder:text-[#756b61]" /><div className="mt-3 flex items-center justify-between"><span className="text-[10px] text-[#756b61]">Enter to send · Shift + Enter for a new line</span><button type="submit" disabled={!input.trim() || loading} className="rounded-full bg-[#d7a548] px-4 py-2 text-xs font-semibold text-[#17120f] disabled:opacity-35">Send ↗</button></div></form>{status && <p className="mt-4 text-xs text-[#d7a548]">{status}</p>}</div>

          <div><div className="mb-6 flex items-end justify-between"><div><p className="text-[10px] font-semibold tracking-[0.18em] text-[#d7a548]">VERIFIED MATCHES</p><h2 className="mt-2 text-2xl font-medium tracking-[-0.03em]">From the merchant catalog</h2></div><span className="text-xs text-[#877c70]">{catalogLoading ? 'Loading...' : `${laptops.length} available`}</span></div><div className="grid gap-3 sm:grid-cols-2">{laptops.map((product, index) => <article key={product.id} className="group rounded-[22px] border border-[#d9cdb9]/15 bg-[#f4eee3] p-5 text-[#17120f] transition hover:-translate-y-1 hover:border-[#d7a548]/70"><div className="flex aspect-[1.35] items-end justify-between rounded-xl bg-[#ded4c7] p-4"><span className="text-4xl font-semibold tracking-[-0.08em] text-[#b9aa98]">0{index + 1}</span><span className="rounded-full bg-[#17120f] px-2 py-1 text-[9px] uppercase tracking-widest text-[#f4eee3]">{product.stock > 0 ? 'In stock' : 'Sold out'}</span></div><div className="mt-5 flex items-start justify-between gap-2"><h3 className="font-semibold">{product.name}</h3><span className="whitespace-nowrap text-sm font-semibold">{money(product.price)}</span></div><p className="mt-2 min-h-10 text-xs leading-5 text-[#756b61]">{product.description || 'Built for focused work and everyday performance.'}</p>{product.reason && <p className="mt-2 truncate text-xs italic text-[#9b8d7c]">{product.reason}</p>}<p className="mt-3 truncate text-[10px] text-[#9b8d7c]">{attributeSummary(product)}</p><button onClick={() => addProduct(product)} disabled={product.stock < 1} className="mt-5 w-full rounded-full border border-[#17120f]/20 py-2.5 text-xs font-semibold transition hover:bg-[#17120f] hover:text-[#f4eee3] disabled:cursor-not-allowed disabled:opacity-40">Add to cart <span className="ml-1">+</span></button></article>)}</div></div>
        </section>

        <footer className="flex flex-col gap-4 border-t border-[#d9cdb9]/15 py-7 text-xs text-[#756b61] md:flex-row md:items-center md:justify-between"><span>TECHNOVA · AI-NATIVE COMMERCE DEMO</span><span>Discover <i className="mx-2">→</i> Recommend <i className="mx-2">→</i> Authorize <i className="mx-2">→</i> Pay</span></footer>
      </div>
    </main>
  );
}
