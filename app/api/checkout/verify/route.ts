import { NextRequest, NextResponse } from 'next/server';
import { audit, razorpaySignature, safeEqual, sessionForRazorpayOrder } from '@/lib/commerce';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orderId = typeof body.razorpay_order_id === 'string' ? body.razorpay_order_id.trim() : '';
    const paymentId = typeof body.razorpay_payment_id === 'string' ? body.razorpay_payment_id.trim() : '';
    const signature = typeof body.razorpay_signature === 'string' ? body.razorpay_signature.trim() : '';
    if (!orderId || !paymentId || !signature) return NextResponse.json({ error: 'Incomplete payment response.' }, { status: 400 });

    const expected = razorpaySignature(orderId, paymentId);
    if (!safeEqual(expected, signature)) return NextResponse.json({ error: 'Payment signature verification failed.' }, { status: 400 });

    const { data: order, error } = await supabaseAdmin.from('orders').update({
      razorpay_payment_id: paymentId,
      status: 'paid',
    }).eq('razorpay_order_id', orderId).neq('status', 'paid').select('id,razorpay_order_id,razorpay_payment_id,amount,currency,status').maybeSingle();

    if (error || !order) return NextResponse.json({ error: 'Order not found or already processed.' }, { status: 404 });
    const sessionId = await sessionForRazorpayOrder(orderId);
    if (sessionId) await audit(sessionId, 'PAYMENT_SUCCESS', 'Razorpay payment verified', { order_id: order.id, razorpay_order_id: orderId, payment_id: paymentId, amount: order.amount, provider: 'razorpay' });

    if (sessionId) {
      const { data: cart, error: cartLookupError } = await supabaseAdmin
        .from('carts')
        .select('id')
        .eq('session_id', sessionId)
        .eq('status', 'active')
        .maybeSingle();

      if (cartLookupError) throw cartLookupError;
      if (cart) {
        const { error: itemDeleteError } = await supabaseAdmin
          .from('cart_items')
          .delete()
          .eq('cart_id', cart.id);
        if (itemDeleteError) throw itemDeleteError;

        const { error: cartUpdateError } = await supabaseAdmin
          .from('carts')
          .update({ status: 'checked_out' })
          .eq('id', cart.id);
        if (cartUpdateError) throw cartUpdateError;
      }
    }

    return NextResponse.json({ success: true, order });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Payment verification failed.' }, { status: 400 });
  }
}
