import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET() {
  try {
    const { rows } = await sql`SELECT id, email, updated_at FROM google_tokens ORDER BY created_at`;
    if (rows.length === 0) {
      return NextResponse.json({ connected: false, accounts: [] });
    }
    const accounts = rows.map(r => ({ id: r.id, email: r.email, connectedAt: r.updated_at }));
    return NextResponse.json({ connected: true, accounts });
  } catch (err) {
    return NextResponse.json({ connected: false, accounts: [], error: err.message });
  }
}
