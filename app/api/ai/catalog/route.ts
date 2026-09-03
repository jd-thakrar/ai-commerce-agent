import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id,name,description,category,price,currency,stock,attributes,use_cases,tags')
    .eq('active', true)
    .order('name');

  if (error) return NextResponse.json({ error: 'Catalog unavailable' }, { status: 500 });
  return NextResponse.json({ merchant: 'TechNova', products: data || [] });
}
