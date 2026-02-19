import { NextResponse } from 'next/server';
import { getNotes, createNote } from '@/lib/db';

export async function GET() {
  try {
    const notes = await getNotes();
    return NextResponse.json(notes);
  } catch (error) {
    console.error('GET /api/notes error:', error);
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const note = await createNote(body);
    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error('POST /api/notes error:', error);
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
  }
}
