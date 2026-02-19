import { NextResponse } from 'next/server';
import { getSession } from '@/lib/google-auth';

export async function GET() {
  try {
    const session = await getSession();
    return NextResponse.json({ connected: !!session, ...session });
  } catch (err) {
    console.error('Session check error:', err);
    return NextResponse.json({ connected: false });
  }
}
