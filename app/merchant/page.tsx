'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const money = (value: number) => `₹${value.toLocaleString('en-IN')}`;
type Dashboard = { metrics: Record<string, number>; activity: Array<{ id: string; action: string; description: string; created_at: string }>; orders: Array<{ id: string; amount: number; status: string; created_at: string }> };

export default function MerchantPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { fetch('/api/merchant').then((response) => response.json()).then(setData).catch(() => setError('Merchant data is unavailable.')); }, []);
  const metrics = data?.metrics;
  return <main className="min-h-screen bg-[#f7f7f8] px-5 py-8 text-[#111] md:px-10"><div className="mx-auto max-w-6xl"><header className="flex items-center justify-between border-b border-black/10 pb-6"><div><p className="text-xs font-medium tracking-widest text-black/40">MERCHANT CONSOLE</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">AI commerce control center</h1></div><Link href="/shop" className="rounded-full bg-black px-4 py-2 text-sm text-white">Open storefront</Link></header>{error && <p className="mt-8 text-sm text-red-700">{error}</p>}{metrics && <><div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">{[['AI-assisted sessions', metrics.ai_assisted_sessions], ['Products discovered', metrics.products_discovered], ['Carts created', metrics.carts_created], ['Orders', metrics.orders], ['Revenue', money(metrics.revenue)], ['Conversion rate', `${metrics.conversion_rate}%`]].map(([label, value]) => <div key={String(label)} className="border border-black/10 bg-white p-5"><p className="text-xs text-black/45">{label}</p><p className="mt-3 text-2xl font-semibold">{value}</p></div>)}</div><div className="mt-8 grid gap-8 md:grid-cols-[1fr_1.2fr]"><section><h2 className="text-lg font-semibold">Recent orders</h2><div className="mt-3 divide-y divide-black/10 border-y border-black/10">{data.orders.length ? data.orders.map((order) => <div key={order.id} className="flex justify-between py-4 text-sm"><span>{order.status}</span><span>{money(Number(order.amount))}</span></div>) : <p className="py-5 text-sm text-black/45">No orders yet.</p>}</div></section><section><h2 className="text-lg font-semibold">Recent AI activity</h2><div className="mt-3 divide-y divide-black/10 border-y border-black/10">{data.activity.slice(0, 12).map((entry) => <div key={entry.id} className="flex gap-3 py-4 text-sm"><span className="text-green-600">✓</span><div><p>{entry.description}</p><p className="mt-1 text-xs text-black/40">{new Date(entry.created_at).toLocaleString()}</p></div></div>)}</div></section></div></>}</div></main>;
}
