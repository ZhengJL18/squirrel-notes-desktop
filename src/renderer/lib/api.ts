import type {
  Subject,
  Note,
  NoteAudio,
  TranscriptSegment,
  AsrPresetInfo,
  TranscribeProgress
} from '../../../electron/services/types'

export interface Settings {
  asrPresetId: string
  deepseekKey: string
  deepseekModel: string
}

export interface Api {
  listSubjects: () => Promise<Subject[]>
  createSubject: (name: string) => Promise<Subject>
  renameSubject: (id: string, name: string) => Promise<void>
  deleteSubject: (id: string) => Promise<void>

  listNotes: (subjectId: string) => Promise<Note[]>
  getNote: (noteId: string) => Promise<Note | null>
  createNote: (subjectId: string) => Promise<Note>
  updateNoteContent: (noteId: string, content: string) => Promise<void>
  updateNoteMeta: (
    noteId: string,
    meta: { title?: string; pinned?: boolean }
  ) => Promise<void>
  appendToNote: (noteId: string, text: string) => Promise<void>
  deleteNote: (noteId: string) => Promise<void>
  searchNotes: (query: string) => Promise<Note[]>

  listAudio: (noteId: string) => Promise<NoteAudio[]>
  addAudio: (noteId: string, path: string, durationSec: number) => Promise<NoteAudio>
  updateAudio: (
    audioId: string,
    patch: { transcript?: string; status?: string }
  ) => Promise<void>
  deleteAudio: (audioId: string) => Promise<void>
  addHotword: (subjectId: string, word: string) => Promise<boolean>

  pickAudio: () => Promise<{ path: string; durationSec: number } | null>
  getAudioDuration: (path: string) => Promise<number>

  transcribe: (audioId: string) => Promise<TranscriptSegment[]>
  onTranscribeProgress: (cb: (p: TranscribeProgress) => void) => () => void

  generateNote: (audioId: string) => Promise<{ added: number; terms: string[] }>

  listPresets: () => Promise<AsrPresetInfo[]>
  getPreset: () => Promise<{ id: string; name: string; description: string; supportsHotwords: boolean }>
  setPreset: (id: string) => Promise<void>
  modelStatus: () => Promise<{ name: string; done: boolean; sizeHint: string }[]>

  getSettings: () => Promise<Settings>
  saveSettings: (s: { deepseekKey: string; deepseekModel: string }) => Promise<Settings>

  checkUpdate: () => Promise<{ version: string; notes: string } | null>
  downloadUpdate: () => Promise<void>
  onUpdateEvent: (cb: (data: unknown) => void) => () => void

  exportNote: (noteId: string, content: string) => Promise<string>

  openPath: (path: string) => Promise<string>
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
