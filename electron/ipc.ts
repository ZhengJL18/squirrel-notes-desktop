import { ipcMain, shell, BrowserWindow, app } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import * as db from './services/db'
import * as models from './services/models'
import * as audio from './services/audio'
import * as deepseek from './services/deepseek'
import { transcribeAudio } from './services/transcription'
import { getSettings, saveSettings } from './services/settings'
import { checkUpdate, downloadUpdate, setUpdateNotifier } from './services/updater'
import type { AudioStatus } from './services/types'

export function registerIpc(): void {
  // ── 数据 ──────────────────────────────────────────────
  ipcMain.handle('db:listSubjects', () => db.listSubjects())
  ipcMain.handle('db:createSubject', (_e, name: string) => db.createSubject(name))
  ipcMain.handle('db:renameSubject', (_e, id: string, name: string) =>
    db.renameSubject(id, name)
  )
  ipcMain.handle('db:deleteSubject', (_e, id: string) => db.deleteSubject(id))

  ipcMain.handle('db:listNotes', (_e, subjectId: string) => db.listNotes(subjectId))
  ipcMain.handle('db:getNote', (_e, noteId: string) => db.getNote(noteId))
  ipcMain.handle('db:createNote', (_e, subjectId: string) => db.createNote(subjectId))
  ipcMain.handle('db:updateNoteContent', (_e, noteId: string, content: string) =>
    db.updateNoteContent(noteId, content)
  )
  ipcMain.handle(
    'db:updateNoteMeta',
    (_e, noteId: string, meta: { title?: string; pinned?: boolean }) =>
      db.updateNoteMeta(noteId, meta)
  )
  ipcMain.handle('db:appendToNote', (_e, noteId: string, text: string) =>
    db.appendToNote(noteId, text)
  )
  ipcMain.handle('db:deleteNote', (_e, noteId: string) => db.deleteNote(noteId))
  ipcMain.handle('db:searchNotes', (_e, query: string) => db.searchNotes(query))

  ipcMain.handle('db:listAudio', (_e, noteId: string) => db.listAudio(noteId))
  ipcMain.handle(
    'db:addAudio',
    (_e, noteId: string, path: string, durationSec: number) =>
      db.addAudio(noteId, path, durationSec)
  )
  ipcMain.handle(
    'db:updateAudio',
    (
      _e,
      audioId: string,
      patch: { transcript?: string; status?: string }
    ) => db.updateAudio(audioId, patch as { transcript?: string; status?: AudioStatus })
  )
  ipcMain.handle('db:deleteAudio', (_e, audioId: string) => db.deleteAudio(audioId))
  ipcMain.handle('db:addHotword', (_e, subjectId: string, word: string) =>
    db.addHotword(subjectId, word)
  )

  // ── 音频 ──────────────────────────────────────────────
  ipcMain.handle('audio:pick', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return null
    return audio.pickAudioFile(win)
  })
  ipcMain.handle('audio:duration', (_e, path: string) => audio.getAudioDuration(path))

  // ── 转写 ──────────────────────────────────────────────
  ipcMain.handle('transcribe:run', async (e, audioId: string) => {
    const segments = await transcribeAudio(audioId, (p) => {
      e.sender.send('transcribe:progress', p)
    })
    return segments
  })

  // ── 一键生成 ──────────────────────────────────────────
  ipcMain.handle('generate:run', async (_e, audioId: string) => {
    const item = db.getAudio(audioId)
    if (!item) throw new Error('音频不存在')
    const note = db.getNote(item.noteId)
    if (!note) throw new Error('笔记不存在')
    const hotwords = db.hotwordsOf(note.subjectId)

    const gen = await deepseek.generateNoteMarkdown(item.transcript, hotwords, note.title)
    if (gen.markdown.trim()) db.appendToNote(note.id, gen.markdown)
    const added = deepseek.harvestTerms(note.subjectId, gen.terms)
    return { added, terms: gen.terms }
  })

  // ── 模型 ──────────────────────────────────────────────
  ipcMain.handle('models:listPresets', () => models.listPresetInfos())
  ipcMain.handle('models:getPreset', () => {
    const p = models.presetById(models.getPresetId())
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      type: p.type,
      supportsHotwords: p.supportsHotwords
    }
  })
  ipcMain.handle('models:setPreset', (_e, id: string) => models.setPresetId(id))
  ipcMain.handle('models:status', () => models.fileStatuses())

  // ── 设置 ──────────────────────────────────────────────
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle(
    'settings:save',
    (_e, s: { deepseekKey: string; deepseekModel: string }) =>
      saveSettings({ deepseekKey: s.deepseekKey, deepseekModel: s.deepseekModel })
  )

  // ── 更新 ──────────────────────────────────────────────
  ipcMain.handle('update:check', () => checkUpdate())
  ipcMain.handle('update:download', () => downloadUpdate())

  // ── 导出 ──────────────────────────────────────────────
  ipcMain.handle('note:export', async (_e, noteId: string, content: string) => {
    const note = db.getNote(noteId)
    if (!note) throw new Error('笔记不存在')
    const dir = join(app.getPath('documents'), '松鼠症笔记')
    mkdirSync(dir, { recursive: true })
    const safeName = note.title.replace(/[\\/:*?"<>|]/g, '_')
    const path = join(dir, `${safeName}.md`)
    writeFileSync(path, `# ${note.title}\n\n${content}`, 'utf-8')
    return path
  })

  // ── 通用 ──────────────────────────────────────────────
  ipcMain.handle('shell:openPath', (_e, path: string) => shell.openPath(path))
}

export function wireUpdateNotifier(sender: (data: unknown) => void): void {
  setUpdateNotifier(sender)
}
