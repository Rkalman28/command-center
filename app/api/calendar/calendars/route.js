import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/google-auth';

export async function GET() {
  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated', calendars: [] }, { status: 401 });
    }

    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch calendars: ${await res.text()}`);
    }

    const data = await res.json();
    const calendars = (data.items || []).map(cal => ({
      id: cal.id,
      name: cal.summary,
      description: cal.description || '',
      color: cal.backgroundColor || '#4285f4',
      primary: cal.primary || false,
      selected: cal.selected || false,
    }));

    return NextResponse.json({ calendars });
  } catch (err) {
    console.error('Calendar list error:', err);
    return NextResponse.json({ error: 'Failed to fetch calendars', calendars: [] }, { status: 500 });
  }
}
