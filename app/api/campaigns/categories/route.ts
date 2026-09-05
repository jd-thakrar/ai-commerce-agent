import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('category')
      .eq('active', true)
      .limit(1000);

    if (error) throw error;

    const categories = Array.from(new Set((data || []).map((p: any) => p.category).filter(Boolean))).sort();

    return NextResponse.json({ success: true, categories });
  } catch (error) {
    console.error('Category fetch failed:', error);
    return NextResponse.json({ error: 'Unable to fetch categories.' }, { status: 500 });
  }
}
