import { sql } from '@vercel/postgres';

// ── Ensure tables exist (runs on first API call) ──
let tablesReady = false;

export async function ensureTables() {
  if (tablesReady) return;

  await sql`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Untitled',
      content TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'wrapmate',
      tags TEXT[] DEFAULT '{}',
      archived BOOLEAN DEFAULT false,
      project_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      completed BOOLEAN DEFAULT false,
      due_date TIMESTAMPTZ,
      due_time TEXT,
      priority TEXT,
      category TEXT NOT NULL DEFAULT 'wrapmate',
      tags TEXT[] DEFAULT '{}',
      parent_note_id TEXT,
      project_id TEXT,
      task_notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Add columns if they don't exist (for existing databases)
  try { await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_time TEXT`; } catch (e) {}
  try { await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_notes TEXT DEFAULT ''`; } catch (e) {}

  await sql`
    CREATE TABLE IF NOT EXISTS deleted_items (
      id TEXT PRIMARY KEY,
      item_type TEXT NOT NULL,
      data JSONB NOT NULL,
      deleted_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  tablesReady = true;
}

// ── Notes ──

export async function getNotes() {
  await ensureTables();
  const { rows } = await sql`SELECT * FROM notes ORDER BY updated_at DESC`;
  return rows.map(rowToNote);
}

export async function createNote(note) {
  await ensureTables();
  const id = note.id || Date.now().toString();
  const now = new Date().toISOString();
  const tags = note.tags || [];

  await sql`
    INSERT INTO notes (id, title, content, category, tags, archived, project_id, created_at, updated_at)
    VALUES (${id}, ${note.title || 'Untitled'}, ${note.content || ''}, ${note.category || 'wrapmate'}, ${tags}, ${note.archived || false}, ${note.projectId || null}, ${now}, ${now})
  `;

  return { ...note, id, createdAt: now, updatedAt: now, tags };
}

export async function updateNote(id, updates) {
  await ensureTables();
  const now = new Date().toISOString();
  const tags = updates.tags || [];

  await sql`
    UPDATE notes
    SET title = ${updates.title || 'Untitled'},
        content = ${updates.content || ''},
        category = ${updates.category || 'wrapmate'},
        tags = ${tags},
        archived = ${updates.archived || false},
        project_id = ${updates.projectId || null},
        updated_at = ${now}
    WHERE id = ${id}
  `;

  return { ...updates, id, updatedAt: now, tags };
}

export async function deleteNote(id) {
  await ensureTables();
  // Get note data first for soft delete
  const { rows } = await sql`SELECT * FROM notes WHERE id = ${id}`;
  if (rows.length > 0) {
    const note = rowToNote(rows[0]);
    await sql`
      INSERT INTO deleted_items (id, item_type, data, deleted_at)
      VALUES (${id + '-' + Date.now()}, 'note', ${JSON.stringify(note)}, NOW())
    `;
    // Unlink tasks from this note
    await sql`UPDATE tasks SET parent_note_id = NULL WHERE parent_note_id = ${id}`;
  }
  await sql`DELETE FROM notes WHERE id = ${id}`;
}

// ── Tasks ──

export async function getTasks() {
  await ensureTables();
  const { rows } = await sql`SELECT * FROM tasks ORDER BY due_date ASC NULLS LAST, created_at DESC`;
  return rows.map(rowToTask);
}

export async function createTask(task) {
  await ensureTables();
  const id = task.id || Date.now().toString();
  const tags = task.tags || [];

  await sql`
    INSERT INTO tasks (id, text, completed, due_date, due_time, priority, category, tags, parent_note_id, project_id, task_notes, created_at)
    VALUES (${id}, ${task.text}, ${task.completed || false}, ${task.dueDate || null}, ${task.dueTime || null}, ${task.priority || null}, ${task.category || 'wrapmate'}, ${tags}, ${task.parentNoteId || null}, ${task.projectId || null}, ${task.taskNotes || ''}, ${task.createdAt || new Date().toISOString()})
  `;

  return { ...task, id, tags };
}

export async function updateTask(id, updates) {
  await ensureTables();
  const tags = updates.tags || [];

  await sql`
    UPDATE tasks
    SET text = ${updates.text},
        completed = ${updates.completed || false},
        due_date = ${updates.dueDate || null},
        due_time = ${updates.dueTime || null},
        priority = ${updates.priority || null},
        category = ${updates.category || 'wrapmate'},
        tags = ${tags},
        parent_note_id = ${updates.parentNoteId || null},
        project_id = ${updates.projectId || null},
        task_notes = ${updates.taskNotes || ''}
    WHERE id = ${id}
  `;

  return { ...updates, id, tags };
}

export async function deleteTask(id) {
  await ensureTables();
  const { rows } = await sql`SELECT * FROM tasks WHERE id = ${id}`;
  if (rows.length > 0) {
    const task = rowToTask(rows[0]);
    await sql`
      INSERT INTO deleted_items (id, item_type, data, deleted_at)
      VALUES (${id + '-' + Date.now()}, 'task', ${JSON.stringify(task)}, NOW())
    `;
  }
  await sql`DELETE FROM tasks WHERE id = ${id}`;
}

// ── Row mappers (DB snake_case → JS camelCase) ──

function rowToNote(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    tags: row.tags || [],
    archived: row.archived,
    projectId: row.project_id,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  };
}

function rowToTask(row) {
  return {
    id: row.id,
    text: row.text,
    completed: row.completed,
    dueDate: row.due_date?.toISOString?.() || row.due_date,
    dueTime: row.due_time || null,
    priority: row.priority,
    category: row.category,
    tags: row.tags || [],
    parentNoteId: row.parent_note_id,
    projectId: row.project_id,
    taskNotes: row.task_notes || '',
    createdAt: row.created_at?.toISOString?.() || row.created_at,
  };
}
