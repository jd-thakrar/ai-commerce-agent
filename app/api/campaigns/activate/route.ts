import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const campaignId = typeof body.id === 'string' ? body.id.trim() : '';
    if (!campaignId) return NextResponse.json({ error: 'Campaign ID is required.' }, { status: 400 });

    const { data: campaign, error: lookupError } = await supabaseAdmin
      .from('campaigns')
      .select('id,name,discount_percent,active_category,status,created_at')
      .eq('id', campaignId)
      .limit(1)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!campaign) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });

    const { error: deactivateError } = await supabaseAdmin
      .from('campaigns')
      .update({ status: 'inactive' })
      .eq('status', 'active');
    if (deactivateError) throw deactivateError;

    const { data: updated, error: activateError } = await supabaseAdmin
      .from('campaigns')
      .update({ status: 'active' })
      .eq('id', campaignId)
      .select('id,name,discount_percent,active_category,status,created_at')
      .limit(1)
      .maybeSingle();
    if (activateError || !updated) throw activateError || new Error('Unable to activate campaign.');

    const { error: auditError } = await supabaseAdmin.from('audit_logs').insert({
      session_id: 'merchant-dashboard',
      action: 'CAMPAIGN_ACTIVATED',
      description: `${updated.name} activated with ${updated.discount_percent}% off ${updated.active_category} products`,
      metadata: {
        campaign_id: updated.id,
        campaign_name: updated.name,
        discount_percent: updated.discount_percent,
        active_category: updated.active_category,
      },
    });
    if (auditError) console.error('Campaign audit failed:', auditError);

    return NextResponse.json({ success: true, campaign: updated });
  } catch (error) {
    console.error('Campaign activation failed:', error);
    return NextResponse.json({ error: 'Unable to activate campaign.' }, { status: 500 });
  }
}
