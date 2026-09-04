import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST() {
  const { data: campaign, error: lookupError } = await supabaseAdmin
    .from('campaigns')
    .select('id,name,discount_percent,active_category')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (lookupError) return NextResponse.json({ error: 'Unable to find active campaign.' }, { status: 500 });
  if (!campaign) return NextResponse.json({ success: true, campaign: null });

  const { error } = await supabaseAdmin
    .from('campaigns')
    .update({ status: 'inactive' })
    .eq('id', campaign.id);
  if (error) return NextResponse.json({ error: 'Unable to deactivate campaign.' }, { status: 500 });

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
}