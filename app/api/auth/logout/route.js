import { NextResponse } from 'next/server';
import { deleteTokens } from '@/lib/google-auth';

export async function POST() {
  try {
    await deleteTokens();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err);
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}
