import { NextResponse } from 'next/server';
import { getAllValidAccessTokens } from '@/lib/google-auth';

export async function GET() {
  try {
    const accountTokens = await getAllValidAccessTokens();
    if (accountTokens.length === 0) {
      return NextResponse.json({ error: 'Not authenticated', calendars: [] }, { status: 401 });
    }

    const allCalendars = [];

    for (const { email: accountEmail, accessToken } of accountTokens) {
      const res = await fetch(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!res.ok) continue;

      const data = await res.json();
      const calendars = (data.items || []).map(cal => ({
        id: cal.id,
        name: cal.summary,
        description: cal.description || '',
        color: cal.backgroundColor || '#4285f4',
        primary: cal.primary || false,
        selected: cal.selected || false,
        accountEmail,
      }));
      allCalendars.push(...calendars);
    }

    return NextResponse.json({ calendars: allCalendars });
  } catch (err) {
    console.error('Calendar list error:', err);
    return NextResponse.json({ error: 'Failed to fetch calendars', calendars: [] }, { status: 500 });
  }
}
