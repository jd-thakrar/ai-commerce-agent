'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatedNumber } from '../components/AnimatedNumber';

const money = (value: number) => `₹${value.toLocaleString('en-IN')}`;
type Campaign = {
  id: string;
  name: string;
  discount_percent: number;
  active_category: string;
  status: string;
};
type Dashboard = {
  metrics: Record<string, number>;
  campaigns: Campaign[];
  active_campaign: Campaign | null;
  activity: Array<{ id: string; action: string; description: string; created_at: string }>;
  orders: Array<{ id: string; amount: number; status: string; created_at: string }>;
};

function formatTimestamp(value: string) {
  const date = new Date(value);
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function shortId(value: string) {
  return value.slice(0, 8).toUpperCase();
}

function StatusLabel({ status }: { status: string }) {
  const isPaid = status === 'paid';
  const isFailed = status === 'failed' || status === 'declined';
  const dotClass = isPaid ? 'status-dot-success' : isFailed ? 'status-dot-danger' : 'status-dot-neutral';

  return (
    <span className="inline-flex items-center gap-1.5 text-text-secondary">
      <span className={`status-dot ${dotClass}`} />
      {status}
    </span>
  );
}

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
    if (
      !formData.name ||
      formData.discount_percent < 0 ||
      formData.discount_percent > 100 ||
      !formData.active_category
    ) {
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
    <main className="min-h-screen bg-bg px-4 py-6 text-text-primary md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
              Merchant console
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Operations dashboard</h1>
          </div>
          <Link
            href="/shop"
            className="interactive-border primary-button px-4 py-2 text-xs font-semibold"
          >
            Open storefront
          </Link>
        </header>

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        {metrics && (
          <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {[
                ['Sessions', metrics.ai_assisted_sessions],
                ['Discovered', metrics.products_discovered],
                ['Carts', metrics.carts_created],
                ['Orders', metrics.orders],
                ['Revenue', metrics.revenue],
                ['Conversion', metrics.conversion_rate],
              ].map(([label, value]) => (
                <div key={String(label)} className="panel px-5 py-5">
                  <p className="text-[10px] uppercase tracking-[0.06em] text-text-secondary">
                    {label}
                  </p>
                  <p className="mt-1 font-mono-data text-xl font-semibold text-accent">
                    {label === 'Revenue' ? (
                      <AnimatedNumber value={Number(value)} format={money} className="text-accent" />
                    ) : label === 'Conversion' ? (
                      <AnimatedNumber value={Number(value)} format={(v) => `${v}%`} />
                    ) : (
                      <AnimatedNumber value={Number(value)} />
                    )}
                  </p>
                </div>
              ))}
          </section>
        )}

        <section className="panel mt-4">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                Campaigns
              </p>
              <h2 className="text-sm font-semibold tracking-tight">Pricing controls</h2>
            </div>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              disabled={working === 'create'}
              className="interactive-border primary-button px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40"
            >
              {working === 'create' ? 'Creating...' : '+ New campaign'}
            </button>
          </div>

          {showCreateForm && (
            <div className="border-b border-border px-4 py-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="block text-[11px] text-text-secondary">Campaign name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Spring Sale"
                    className="input-control mt-1 w-full px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-text-secondary">Discount %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.discount_percent}
                    onChange={(e) =>
                      setFormData({ ...formData, discount_percent: Number(e.target.value) })
                    }
                    className="input-control mt-1 w-full px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-text-secondary">Category</label>
                  <select
                    value={formData.active_category}
                    onChange={(e) => setFormData({ ...formData, active_category: e.target.value })}
                    className="input-control mt-1 w-full px-2 py-1.5 text-sm"
                  >
                    <option value="">Select category</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={createCampaign}
                  disabled={working === 'create'}
                  className="interactive-border primary-button px-4 py-1.5 text-xs font-semibold disabled:opacity-40"
                >
                  {working === 'create' ? 'Creating...' : 'Create campaign'}
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="interactive-border border border-border bg-bg px-4 py-1.5 text-xs text-text-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {campaigns.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-secondary">
              No campaigns yet. Create one to get started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Discount</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th className="align-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr key={campaign.id}>
                      <td className="font-semibold">{campaign.name}</td>
                      <td className="font-mono-data text-accent">
                        −{campaign.discount_percent}%
                      </td>
                      <td className="text-text-secondary">{campaign.active_category}</td>
                      <td>
                        <span className="inline-flex items-center gap-1.5 text-text-secondary">
                          <span
                            className={`status-dot ${
                              campaign.status === 'active'
                                ? 'status-dot-success'
                                : 'status-dot-neutral'
                            }`}
                          />
                          {campaign.status}
                        </span>
                      </td>
                      <td className="align-right">
                        <button
                          onClick={() => toggleCampaign(campaign)}
                          disabled={working === campaign.id}
                          className={`interactive-border border px-3 py-1 text-[11px] font-semibold disabled:opacity-40 ${
                            campaign.status === 'active'
                              ? 'border-danger text-danger'
                              : 'border-accent-gold bg-accent-gold text-bg'
                          }`}
                        >
                          {working === campaign.id
                            ? 'Updating...'
                            : campaign.status === 'active'
                              ? 'Deactivate'
                              : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel mt-4">
          <div className="border-b border-border px-4 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
              Orders
            </p>
            <h2 className="text-sm font-semibold tracking-tight">Recent transactions</h2>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th className="align-right">Amount</th>
                  <th>Status</th>
                  <th className="align-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {data?.orders.length ? (
                  data.orders.map((order) => (
                    <tr key={order.id}>
                      <td className="font-mono-data text-xs">{shortId(order.id)}</td>
                      <td className="align-right font-mono-data text-accent">
                        {money(Number(order.amount))}
                      </td>
                      <td>
                        <StatusLabel status={order.status} />
                      </td>
                      <td className="align-right font-mono-data text-xs text-text-secondary">
                        {formatTimestamp(order.created_at)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-text-secondary">
                      No orders yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel mt-4">
          <div className="border-b border-border px-4 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
              Activity log
            </p>
            <h2 className="text-sm font-semibold tracking-tight">AI audit trail</h2>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="align-right">Time</th>
                  <th>Action</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {data?.activity.map((entry) => (
                  <tr key={entry.id}>
                    <td className="align-right font-mono-data text-xs text-text-secondary">
                      {formatTimestamp(entry.created_at)}
                    </td>
                    <td className="font-mono-data text-xs">{entry.action}</td>
                    <td className="text-text-secondary">{entry.description}</td>
                  </tr>
                ))}
                {!data?.activity.length && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-text-secondary">
                      No activity recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
