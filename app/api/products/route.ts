import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { Product } from '@/types/product';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const maxPrice = searchParams.get('max_price');
    const tag = searchParams.get('tag');

    let query = supabaseAdmin
      .from('products')
      .select('*')
      .eq('active', true);

    if (category) {
      query = query.eq('category', category);
    }
  if (maxPrice) {
  const parsedPrice = Number(maxPrice);

  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
    return NextResponse.json(
      { error: 'Invalid max_price' },
      { status: 400 }
    );
  }

  query = query.lte('price', parsedPrice);
}
    if (tag) {
      query = query.contains('tags', [tag]);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ products: data as Product[] }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
}