import { NextResponse } from 'next/server';
import { exchangeCodeForTokens, saveTokens, getUserEmail } from '@/lib/google-auth';
import { sql } from '@vercel/postgres';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}?auth_error=${error}`);
  }

  if (!code) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}?auth_error=no_code`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const email = await getUserEmail(tokens.access_token);
    await saveTokens(tokens, email);

    // Migrate old "default" row if it exists — give it the proper email key
    try {
      const { rows } = await sql`SELECT * FROM google_tokens WHERE id = 'default' AND email IS NOT NULL`;
      if (rows.length > 0 && rows[0].email) {
        const oldEmail = rows[0].email;
        // Only migrate if the email-keyed row doesn't already exist
        const { rows: existing } = await sql`SELECT id FROM google_tokens WHERE id = ${oldEmail}`;
        if (existing.length === 0) {
          await sql`UPDATE google_tokens SET id = ${oldEmail} WHERE id = 'default'`;
        } else {
          await sql`DELETE FROM google_tokens WHERE id = 'default'`;
        }
      }
    } catch (migrationErr) {
      console.error('Migration error (non-fatal):', migrationErr);
    }

    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}?auth_success=true`);
  } catch (err) {
    console.error('Auth callback error:', err);
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}?auth_error=token_exchange_failed`);
  }
}
