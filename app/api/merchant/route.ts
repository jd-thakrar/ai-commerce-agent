import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const [orders, audit, carts, products] = await Promise.all([
    supabaseAdmin.from('orders').select('id,amount,status,created_at,razorpay_payment_id').order('created_at', { ascending: false }).limit(50),
    supabaseAdmin.from('audit_logs').select('id,action,description,metadata,created_at,session_id').order('created_at', { ascending: false }).limit(50),
    supabaseAdmin.from('carts').select('id,session_id,status').limit(1000),
    supabaseAdmin.from('products').select('id').eq('active', true),
  ]);
  if (orders.error || audit.error || carts.error || products.error) return NextResponse.json({ error: 'Merchant data unavailable.' }, { status: 500 });
  const orderRows = orders.data || [];
  const paid = orderRows.filter((order) => order.status === 'paid');
  const sessions = new Set((audit.data || []).map((entry) => entry.session_id).filter(Boolean));
  const recommendations = (audit.data || []).filter((entry) => entry.action === 'suggestUpsells' || entry.action === 'UPSELL_SUGGESTED').length;
  const cartsCreated = carts.data?.length || 0;
  const conversionRate = cartsCreated
    ? Math.min(100, Math.round((paid.length / cartsCreated) * 100))
    : 0;
  return NextResponse.json({ metrics: { ai_assisted_sessions: sessions.size, products_discovered: products.data?.length || 0, ai_recommendations: recommendations, carts_created: cartsCreated, orders: orderRows.length, revenue: paid.reduce((sum, order) => sum + Number(order.amount || 0), 0), conversion_rate: conversionRate }, orders: orderRows.slice(0, 10), activity: audit.data || [] });
}
