import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/google-auth';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

// GET - Fetch calendar events
export async function GET(request) {
  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated', events: [] }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const timeMin = searchParams.get('timeMin') || new Date().toISOString();
    const timeMax = searchParams.get('timeMax');
    const calendarIds = searchParams.get('calendars')?.split(',') || ['primary'];

    // Fetch events from all requested calendars
    const allEvents = [];

    for (const calendarId of calendarIds) {
      const params = new URLSearchParams({
        timeMin,
        ...(timeMax && { timeMax }),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '100',
      });

      const res = await fetch(
        `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (res.ok) {
        const data = await res.json();
        const events = (data.items || []).map(event => ({
          id: event.id,
          calendarId,
          title: event.summary || '(No title)',
          description: event.description || '',
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          allDay: !event.start?.dateTime,
          location: event.location || '',
          color: event.colorId || null,
          htmlLink: event.htmlLink,
          status: event.status,
        }));
        allEvents.push(...events);
      } else {
        console.error(`Failed to fetch calendar ${calendarId}:`, await res.text());
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
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const calendarId = body.calendarId || 'primary';

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
