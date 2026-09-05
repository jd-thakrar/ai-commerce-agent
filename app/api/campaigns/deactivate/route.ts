import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const campaignId = typeof body.id === 'string' ? body.id.trim() : '';
    if (!campaignId) return NextResponse.json({ error: 'Campaign ID is required.' }, { status: 400 });

    const { data: campaign, error: lookupError } = await supabaseAdmin
      .from('campaigns')
      .select('id,name,discount_percent,active_category,status')
      .eq('id', campaignId)
      .limit(1)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!campaign) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });

    const { error } = await supabaseAdmin
      .from('campaigns')
      .update({ status: 'inactive' })
      .eq('id', campaign.id);
    if (error) throw error;

    const { error: auditError } = await supabaseAdmin.from('audit_logs').insert({
      session_id: 'merchant-dashboard',
      action: 'CAMPAIGN_DEACTIVATED',
      description: `${campaign.name} deactivated`,
      metadata: {
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        discount_percent: campaign.discount_percent,
        active_category: campaign.active_category,
      },
    });
    if (auditError) console.error('Campaign audit failed:', auditError);

    return NextResponse.json({ success: true, campaign: { ...campaign, status: 'inactive' } });
  } catch (error) {
    console.error('Campaign deactivation failed:', error);
    return NextResponse.json({ error: 'Unable to deactivate campaign.' }, { status: 500 });
  }
}