import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const PRESET_CAMPAIGN = {
  name: 'Weekend Laptop Sale',
  discount_percent: 10,
  active_category: 'Laptop',
};

export async function POST(_request: NextRequest) {
  try {
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('campaigns')
      .select('id,name,discount_percent,active_category,status,created_at')
      .eq('name', PRESET_CAMPAIGN.name)
      .maybeSingle();
    if (lookupError) throw lookupError;

    const { error: deactivateError } = await supabaseAdmin
      .from('campaigns')
      .update({ status: 'inactive' })
      .eq('status', 'active');
    if (deactivateError) throw deactivateError;

    const campaignQuery = existing
      ? supabaseAdmin.from('campaigns').update({
          discount_percent: PRESET_CAMPAIGN.discount_percent,
          active_category: PRESET_CAMPAIGN.active_category,
          status: 'active',
        }).eq('id', existing.id)
      : supabaseAdmin.from('campaigns').insert({
          ...PRESET_CAMPAIGN,
          status: 'active',
        });

    const { data: campaign, error: activateError } = await campaignQuery
      .select('id,name,discount_percent,active_category,status,created_at')
      .single();
    if (activateError || !campaign) throw activateError || new Error('Unable to activate campaign.');

    const { error: auditError } = await supabaseAdmin.from('audit_logs').insert({
      session_id: 'merchant-dashboard',
      action: 'CAMPAIGN_ACTIVATED',
      description: `${campaign.name} activated with ${campaign.discount_percent}% off ${campaign.active_category} products`,
      metadata: {
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        discount_percent: campaign.discount_percent,
        active_category: campaign.active_category,
      },
    });
    if (auditError) console.error('Campaign audit failed:', auditError);

    return NextResponse.json({ success: true, campaign });
  } catch (error) {
    console.error('Campaign activation failed:', error);
    return NextResponse.json({ error: 'Unable to activate campaign.' }, { status: 500 });
  }
}
