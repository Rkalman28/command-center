import { NextResponse } from 'next/server';
import { updateNote, deleteNote } from '@/lib/db';

export async function PUT(request, { params }) {
  try {
    const body = await request.json();
    const note = await updateNote(params.id, body);
    return NextResponse.json(note);
  } catch (error) {
    console.error('PUT /api/notes/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    await deleteNote(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/notes/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
  }
}
