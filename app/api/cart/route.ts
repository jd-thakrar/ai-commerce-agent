import { NextRequest, NextResponse } from 'next/server';
import { getCart } from '@/lib/agent/tools';

export async function GET(request: NextRequest) {
  const sessionId = new URL(request.url).searchParams.get('session_id')?.trim();
  if (!sessionId) return NextResponse.json({ error: 'session_id is required' }, { status: 400 });

  const result = await getCart({ session_id: sessionId });
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
