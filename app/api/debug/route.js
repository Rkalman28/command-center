import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET() {
  try {
    // Delete the old "default" row
    await sql`DELETE FROM google_tokens WHERE id = 'default'`;
    
    // Show remaining accounts
    const { rows } = await sql`SELECT id, email, updated_at FROM google_tokens`;
    
    return NextResponse.json({
      success: true,
      message: 'Cleaned up default row',
      remainingAccounts: rows,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
