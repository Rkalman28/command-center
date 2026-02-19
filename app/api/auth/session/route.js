import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET() {
  try {
    const { rows } = await sql`SELECT email, updated_at FROM google_tokens WHERE id = 'default'`;
    if (rows.length === 0) {
      return NextResponse.json({ connected: false });
    }
    return NextResponse.json({ connected: true, email: rows[0].email, connectedAt: rows[0].updated_at });
  } catch (err) {
    return NextResponse.json({ connected: false, error: err.message });
  }
}
