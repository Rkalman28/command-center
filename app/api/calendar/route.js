import { NextResponse } from 'next/server';
import { getAllValidAccessTokens } from '@/lib/google-auth';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

// GET - Fetch calendar events from ALL connected accounts
export async function GET(request) {
  try {
    const accountTokens = await getAllValidAccessTokens();
    if (accountTokens.length === 0) {
      return NextResponse.json({ error: 'Not authenticated', events: [] }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const timeMin = searchParams.get('timeMin') || new Date().toISOString();
    const timeMax = searchParams.get('timeMax');
    const filterCalendars = searchParams.get('calendars')?.split(',') || null;

    const allEvents = [];

    // Fetch from each connected account
    for (const { email: accountEmail, accessToken } of accountTokens) {
      // First get this account's calendar list
      const listRes = await fetch(
        `${GOOGLE_CALENDAR_API}/users/me/calendarList`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!listRes.ok) continue;

      const listData = await listRes.json();
      const calendars = (listData.items || []);

      for (const cal of calendars) {
        // If filter is set, only fetch selected calendars
        if (filterCalendars && !filterCalendars.includes(cal.id)) continue;

        const params = new URLSearchParams({
          timeMin,
          ...(timeMax && { timeMax }),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '100',
        });

        const res = await fetch(
          `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (res.ok) {
          const data = await res.json();
          const events = (data.items || []).filter(event => event.summary).map(event => ({
            id: event.id,
            calendarId: cal.id,
            calendarName: cal.summary,
            accountEmail,
            title: event.summary,
            description: event.description || '',
            start: event.start?.dateTime || event.start?.date,
            end: event.end?.dateTime || event.end?.date,
            allDay: !event.start?.dateTime,
            location: event.location || '',
            color: cal.backgroundColor || '#4285f4',
            htmlLink: event.htmlLink,
            status: event.status,
          }));
          allEvents.push(...events);
        }
      }
    }

    // Sort all events by start time
    allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

    return NextResponse.json({ events: allEvents });
  } catch (err) {
    console.error('Calendar fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch events', events: [] }, { status: 500 });
  }
}

// POST - Create a new calendar event
export async function POST(request) {
  try {
    const body = await request.json();
    const calendarId = body.calendarId || 'primary';
    const accountEmail = body.accountEmail;

    // Get the right access token for the target account
    const accountTokens = await getAllValidAccessTokens();
    let accessToken;

    if (accountEmail) {
      const account = accountTokens.find(a => a.email === accountEmail);
      accessToken = account?.accessToken;
    }
    if (!accessToken && accountTokens.length > 0) {
      accessToken = accountTokens[0].accessToken;
    }
    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const event = {
      summary: body.title,
      description: body.description || '',
      location: body.location || '',
      start: body.allDay
        ? { date: body.startDate }
        : { dateTime: body.start, timeZone: body.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone },
      end: body.allDay
        ? { date: body.endDate || body.startDate }
        : { dateTime: body.end, timeZone: body.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone },
    };

    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to create event: ${err}`);
    }

    const created = await res.json();
    return NextResponse.json({
      id: created.id,
      title: created.summary,
      start: created.start?.dateTime || created.start?.date,
      end: created.end?.dateTime || created.end?.date,
      htmlLink: created.htmlLink,
    }, { status: 201 });
  } catch (err) {
    console.error('Calendar create error:', err);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
