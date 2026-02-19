import { NextResponse } from 'next/server';
import { exchangeCodeForTokens, saveTokens, getUserEmail } from '@/lib/google-auth';

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

    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}?auth_success=true`);
  } catch (err) {
    console.error('Auth callback error:', err);
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}?auth_error=token_exchange_failed`);
  }
}
