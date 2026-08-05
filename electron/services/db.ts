import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import type { Subject, Note, NoteAudio, AudioStatus } from './types'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  const dir = join(app.getPath('userData'))
  mkdirSync(dir, { recursive: true })
  db = new Database(join(dir, 'lecture.db'))
  db.pragma('journal_mode = WAL')
  migrate(db)
  return db
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS lecture_subjects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lecture_hotwords (
      subject_id TEXT NOT NULL,
      word TEXT NOT NULL,
      PRIMARY KEY (subject_id, word)
    );
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS note_audio (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL,
      path TEXT NOT NULL,
      duration_sec INTEGER NOT NULL DEFAULT 0,
      transcript TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ready',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_subject ON notes(subject_id);
    CREATE INDEX IF NOT EXISTS idx_note_audio_note ON note_audio(note_id);
  `)
  // FTS5 笔记搜索（不可用时降级 LIKE，这里捕获错误）。
  try {
    d.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        title, content,
        content='notes', content_rowid='rowid'
      );
      CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
        INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
        INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
      END;
      CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes
      WHEN (old.title IS NOT new.title OR old.content IS NOT new.content) BEGIN
        INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
        INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
      END;
    `)
  } catch {
    // FTS5 不可用，走 LIKE 搜索。
  }
}

// ── 科目 ──────────────────────────────────────────────

export function listSubjects(): Subject[] {
  const d = getDb()
  const rows = d
    .prepare('SELECT * FROM lecture_subjects ORDER BY created_at ASC')
    .all() as Record<string, unknown>[]
  const hotwordStmt = d.prepare(
    'SELECT word FROM lecture_hotwords WHERE subject_id = ?'
  )
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    createdAt: r.created_at as number,
    hotwords: (hotwordStmt.all(r.id) as { word: string }[]).map((h) => h.word)
  }))
}

export function createSubject(name: string): Subject {
  const d = getDb()
  const trimmed = name.trim()
  if (!trimmed) throw new Error('科目名不能为空')
  const existing = d
    .prepare('SELECT id FROM lecture_subjects WHERE name = ?')
    .get(trimmed) as { id: string } | undefined
  if (existing) {
    return listSubjects().find((s) => s.id === existing.id)!
  }
  const id = String(Date.now())
  d.prepare(
    'INSERT INTO lecture_subjects (id, name, created_at) VALUES (?, ?, ?)'
  ).run(id, trimmed, Date.now())
  return { id, name: trimmed, hotwords: [], createdAt: Date.now() }
}

export function renameSubject(id: string, newName: string): void {
  const d = getDb()
  d.prepare('UPDATE lecture_subjects SET name = ? WHERE id = ?').run(
    newName.trim(),
    id
  )
}

export function deleteSubject(id: string): void {
  const d = getDb()
  d.prepare('DELETE FROM lecture_hotwords WHERE subject_id = ?').run(id)
  d.prepare('DELETE FROM lecture_subjects WHERE id = ?').run(id)
}

export function addHotword(subjectId: string, word: string): boolean {
  const d = getDb()
  const w = word.trim()
  if (!w) return false
  const result = d
    .prepare(
      'INSERT OR IGNORE INTO lecture_hotwords (subject_id, word) VALUES (?, ?)'
    )
    .run(subjectId, w)
  return result.changes > 0
}

export function hotwordsOf(subjectId: string): string[] {
  const d = getDb()
  return (
    d
      .prepare('SELECT word FROM lecture_hotwords WHERE subject_id = ?')
      .all(subjectId) as { word: string }[]
  ).map((h) => h.word)
}

// ── 笔记 ──────────────────────────────────────────────

function noteFromRow(r: Record<string, unknown>): Note {
  return {
    id: r.id as string,
    subjectId: r.subject_id as string,
    title: r.title as string,
    content: r.content as string,
    pinned: (r.pinned as number) === 1,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number
  }
}

export function listNotes(subjectId: string): Note[] {
  const d = getDb()
  return (
    d
      .prepare(
        'SELECT * FROM notes WHERE subject_id = ? ORDER BY pinned DESC, updated_at DESC'
      )
      .all(subjectId) as Record<string, unknown>[]
  ).map(noteFromRow)
}

export function getNote(noteId: string): Note | null {
  const d = getDb()
  const r = d.prepare('SELECT * FROM notes WHERE id = ?').get(noteId) as
    | Record<string, unknown>
    | undefined
  return r ? noteFromRow(r) : null
}

export function createNote(subjectId: string): Note {
  const d = getDb()
  const now = Date.now()
  const id = String(now)
  d.prepare(
    'INSERT INTO notes (id, subject_id, title, content, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)'
  ).run(id, subjectId, '未命名笔记', '', now, now)
  return { id, subjectId, title: '未命名笔记', content: '', pinned: false, createdAt: now, updatedAt: now }
}

export function updateNoteContent(noteId: string, content: string): void {
  const d = getDb()
  d.prepare(
    'UPDATE notes SET content = ?, updated_at = ? WHERE id = ?'
  ).run(content, Date.now(), noteId)
}

export function updateNoteMeta(
  noteId: string,
  meta: { title?: string; pinned?: boolean }
): void {
  const d = getDb()
  const fields: string[] = []
  const args: unknown[] = []
  if (meta.title !== undefined) {
    fields.push('title = ?')
    args.push(meta.title.trim())
  }
  if (meta.pinned !== undefined) {
    fields.push('pinned = ?')
    args.push(meta.pinned ? 1 : 0)
  }
  if (fields.length === 0) return
  fields.push('updated_at = ?')
  args.push(Date.now())
  args.push(noteId)
  d.prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`).run(...args)
}

export function appendToNote(noteId: string, text: string): void {
  const d = getDb()
  const r = d.prepare('SELECT content FROM notes WHERE id = ?').get(noteId) as
    | { content: string }
    | undefined
  if (!r) return
  const content = r.content.trim() === ''
    ? text
    : `${r.content}\n\n${text}`
  updateNoteContent(noteId, content)
}

export function deleteNote(noteId: string): void {
  const d = getDb()
  d.prepare('DELETE FROM note_audio WHERE note_id = ?').run(noteId)
  d.prepare('DELETE FROM notes WHERE id = ?').run(noteId)
}

export function searchNotes(query: string): Note[] {
  const d = getDb()
  const q = query.trim()
  if (!q) return []
  // 先试 FTS5。
  try {
    const sanitized = q
      .slice(0, 2048)
      .replace(/[^\p{L}\p{N}\s"']/gu, ' ')
      .trim()
    if (sanitized) {
      const rows = d
        .prepare(
          `SELECT n.* FROM notes n JOIN notes_fts f ON f.rowid = n.rowid
           WHERE notes_fts MATCH ? ORDER BY n.pinned DESC, n.updated_at DESC`
        )
        .all(sanitized) as Record<string, unknown>[]
      if (rows.length) return rows.map(noteFromRow)
    }
  } catch {
    // 降级 LIKE。
  }
  const like = `%${q}%`
  return (
    d
      .prepare(
        `SELECT * FROM notes WHERE title LIKE ? OR content LIKE ?
         ORDER BY pinned DESC, updated_at DESC`
      )
      .all(like, like) as Record<string, unknown>[]
  ).map(noteFromRow)
}

// ── 音频 ──────────────────────────────────────────────

function audioFromRow(r: Record<string, unknown>): NoteAudio {
  return {
    id: r.id as string,
    noteId: r.note_id as string,
    path: r.path as string,
    durationSec: r.duration_sec as number,
    transcript: r.transcript as string,
    status: r.status as AudioStatus,
    createdAt: r.created_at as number
  }
}

export function listAudio(noteId: string): NoteAudio[] {
  const d = getDb()
  return (
    d
      .prepare(
        'SELECT * FROM note_audio WHERE note_id = ? ORDER BY created_at DESC'
      )
      .all(noteId) as Record<string, unknown>[]
  ).map(audioFromRow)
}

export function addAudio(
  noteId: string,
  path: string,
  durationSec: number
): NoteAudio {
  const d = getDb()
  const id = String(Date.now())
  d.prepare(
    'INSERT INTO note_audio (id, note_id, path, duration_sec, transcript, status, created_at) VALUES (?, ?, ?, ?, \'\', \'ready\', ?)'
  ).run(id, noteId, path, durationSec, Date.now())
  return { id, noteId, path, durationSec, transcript: '', status: 'ready', createdAt: Date.now() }
}

export function getAudio(audioId: string): NoteAudio | null {
  const d = getDb()
  const r = d.prepare('SELECT * FROM note_audio WHERE id = ?').get(audioId) as
    | Record<string, unknown>
    | undefined
  return r ? audioFromRow(r) : null
}

export function updateAudio(
  audioId: string,
  patch: { transcript?: string; status?: AudioStatus }
): void {
  const d = getDb()
  const fields: string[] = []
  const args: unknown[] = []
  if (patch.transcript !== undefined) {
    fields.push('transcript = ?')
    args.push(patch.transcript)
  }
  if (patch.status !== undefined) {
    fields.push('status = ?')
    args.push(patch.status)
  }
  if (fields.length === 0) return
  args.push(audioId)
  d.prepare(`UPDATE note_audio SET ${fields.join(', ')} WHERE id = ?`).run(...args)
}

export function deleteAudio(audioId: string): void {
  const d = getDb()
  d.prepare('DELETE FROM note_audio WHERE id = ?').run(audioId)
}
