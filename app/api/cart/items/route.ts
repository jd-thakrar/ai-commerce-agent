import { NextRequest, NextResponse } from 'next/server';
import { addToCart } from '@/lib/agent/tools';
import { audit } from '@/lib/commerce';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
    const productId = typeof body.product_id === 'string' ? body.product_id.trim() : '';
    const quantity = Number(body.quantity ?? 1);
    if (!sessionId || !productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) return NextResponse.json({ error: 'A valid session, product, and quantity are required.' }, { status: 400 });
    const result = await addToCart({ session_id: sessionId, product_id: productId, quantity });
    if (!result.success) return NextResponse.json(result, { status: 400 });
    await audit(sessionId, 'CART_ITEM_ADDED', 'Product added to cart', { product_id: productId, quantity });
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update cart.' }, { status: 500 }); }
}
