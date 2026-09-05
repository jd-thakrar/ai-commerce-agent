import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const discountPercent = typeof body.discount_percent === 'number' ? body.discount_percent : -1;
    const activeCategory = typeof body.active_category === 'string' ? body.active_category.trim() : '';

    if (!name || discountPercent < 0 || discountPercent > 100 || !activeCategory) {
      return NextResponse.json(
        { error: 'name, discount_percent (0-100), and active_category are required.' },
        { status: 400 }
      );
    }

    const { data: campaign, error } = await supabaseAdmin
      .from('campaigns')
      .insert({
        name,
        discount_percent: discountPercent,
        active_category: activeCategory,
        status: 'inactive',
      })
      .select('id,name,discount_percent,active_category,status,created_at')
      .single();

    if (error || !campaign) throw error || new Error('Unable to create campaign.');

    return NextResponse.json({ success: true, campaign });
  } catch (error) {
    console.error('Campaign creation failed:', error);
    return NextResponse.json({ error: 'Unable to create campaign.' }, { status: 500 });
  }
}
