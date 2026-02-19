import { NextResponse } from 'next/server';
import { updateTask, deleteTask } from '@/lib/db';

export async function PUT(request, { params }) {
  try {
    const body = await request.json();
    const task = await updateTask(params.id, body);
    return NextResponse.json(task);
  } catch (error) {
    console.error('PUT /api/tasks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    await deleteTask(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/tasks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
