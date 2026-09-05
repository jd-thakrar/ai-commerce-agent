'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const money = (value: number) => `₹${value.toLocaleString('en-IN')}`;
type Campaign = { id: string; name: string; discount_percent: number; active_category: string; status: string };
type Dashboard = { metrics: Record<string, number>; campaigns: Campaign[]; active_campaign: Campaign | null; activity: Array<{ id: string; action: string; description: string; created_at: string }>; orders: Array<{ id: string; amount: number; status: string; created_at: string }> };

export default function MerchantPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', discount_percent: 10, active_category: '' });

  useEffect(() => {
    fetch('/api/merchant')
      .then((response) => response.json())
      .then(setData)
      .catch(() => setError('Merchant data is unavailable.'));
  }, []);

  useEffect(() => {
    fetch('/api/campaigns/categories')
      .then((response) => response.json())
      .then((d) => setCategories(d.categories || []))
      .catch(() => undefined);
  }, []);

  async function toggleCampaign(campaign: Campaign) {
    const action = campaign.status === 'active' ? 'deactivate' : 'activate';
    setWorking(campaign.id);
    const endpoint = action === 'activate' ? '/api/campaigns/activate' : '/api/campaigns/deactivate';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: campaign.id }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || `Unable to ${action} campaign.`);
    } else {
      const refreshed = await fetch('/api/merchant');
      setData(await refreshed.json());
    }
    setWorking('');
  }

  async function createCampaign() {
    if (!formData.name || formData.discount_percent < 0 || formData.discount_percent > 100 || !formData.active_category) {
      setError('All fields are required and discount must be 0-100.');
      return;
    }
    setWorking('create');
    const response = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || 'Unable to create campaign.');
    } else {
      const refreshed = await fetch('/api/merchant');
      setData(await refreshed.json());
      setFormData({ name: '', discount_percent: 10, active_category: '' });
      setShowCreateForm(false);
    }
    setWorking('');
  }

  const metrics = data?.metrics;
  const campaigns = data?.campaigns || [];

  return (
    <main className="min-h-screen bg-[#f7f7f8] px-5 py-8 text-[#111] md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between border-b border-black/10 pb-6">
          <div>
            <p className="text-xs font-medium tracking-widest text-black/40">MERCHANT CONSOLE</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">AI commerce control center</h1>
          </div>
          <Link href="/shop" className="rounded-full bg-black px-4 py-2 text-sm text-white">Open storefront</Link>
        </header>

        {error && <p className="mt-8 text-sm text-red-700">{error}</p>}

        {/* Campaigns Section */}
        <section className="mt-8 border border-black/10 bg-white">
          <div className="border-b border-black/10 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium tracking-widest text-black/40">CAMPAIGNS</p>
                <h2 className="mt-2 text-lg font-semibold">Manage campaigns</h2>
              </div>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                disabled={working === 'create'}
                className="rounded-full bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
              >
                {working === 'create' ? 'Creating...' : '+ New campaign'}
              </button>
            </div>
          </div>

          {showCreateForm && (
            <div className="border-b border-black/10 p-5">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-black/60">Campaign name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Spring Sale"
                    className="mt-1 w-full rounded border border-black/10 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-black/60">Discount %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.discount_percent}
                    onChange={(e) => setFormData({ ...formData, discount_percent: Number(e.target.value) })}
                    className="mt-1 w-full rounded border border-black/10 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-black/60">Apply to category</label>
                  <select
                    value={formData.active_category}
                    onChange={(e) => setFormData({ ...formData, active_category: e.target.value })}
                    className="mt-1 w-full rounded border border-black/10 px-3 py-2 text-sm"
                  >
                    <option value="">Select category</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={createCampaign}
                    disabled={working === 'create'}
                    className="flex-1 rounded-full bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
                  >
                    {working === 'create' ? 'Creating...' : 'Create campaign'}
                  </button>
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="flex-1 rounded-full border border-black/10 px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {campaigns.length === 0 ? (
            <div className="p-5 text-center text-sm text-black/45">No campaigns yet. Create one to get started.</div>
          ) : (
            <div className="divide-y divide-black/10">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="flex items-center justify-between p-5">
                  <div className="flex-1">
                    <p className="font-semibold">{campaign.name}</p>
                    <p className="mt-1 text-sm text-black/50">
                      {campaign.discount_percent}% off {campaign.active_category} · {campaign.status === 'active' ? '✓ Active' : 'Inactive'}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleCampaign(campaign)}
                    disabled={working === campaign.id}
                    className={`rounded-full px-4 py-2 text-sm ${
                      campaign.status === 'active'
                        ? 'bg-red-600 text-white'
                        : 'bg-black text-white'
                    } disabled:opacity-40`}
                  >
                    {working === campaign.id ? 'Updating...' : campaign.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {metrics && (
          <>
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ['AI-assisted sessions', metrics.ai_assisted_sessions],
                ['Products discovered', metrics.products_discovered],
                ['Carts created', metrics.carts_created],
                ['Orders', metrics.orders],
                ['Revenue', money(metrics.revenue)],
                ['Cart-to-order conversion', `${metrics.conversion_rate}%`],
              ].map(([label, value]) => (
                <div key={String(label)} className="border border-black/10 bg-white p-5">
                  <p className="text-xs text-black/45">{label}</p>
                  <p className="mt-3 text-2xl font-semibold">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 grid gap-8 md:grid-cols-[1fr_1.2fr]">
              <section>
                <h2 className="text-lg font-semibold">Recent orders</h2>
                <div className="mt-3 divide-y divide-black/10 border-y border-black/10">
                  {data?.orders.length ? (
                    data.orders.map((order) => (
                      <div key={order.id} className="flex justify-between py-4 text-sm">
                        <span>{order.status}</span>
                        <span>{money(Number(order.amount))}</span>
                      </div>
                    ))
                  ) : (
                    <p className="py-5 text-sm text-black/45">No orders yet.</p>
                  )}
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold">Recent AI activity</h2>
                <div className="mt-3 divide-y divide-black/10 border-y border-black/10">
                  {data?.activity.slice(0, 12).map((entry) => (
                    <div key={entry.id} className="flex gap-3 py-4 text-sm">
                      <span className="text-green-600">✓</span>
                      <div>
                        <p>{entry.description}</p>
                        <p className="mt-1 text-xs text-black/40">{new Date(entry.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
