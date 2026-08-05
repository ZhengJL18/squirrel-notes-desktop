export interface Subject {
  id: string
  name: string
  hotwords: string[]
  createdAt: number
}

export interface Note {
  id: string
  subjectId: string
  title: string
  content: string
  pinned: boolean
  createdAt: number
  updatedAt: number
}

export type AudioStatus = 'ready' | 'transcribing' | 'done' | 'failed'

export interface NoteAudio {
  id: string
  noteId: string
  path: string
  durationSec: number
  transcript: string
  status: AudioStatus
  createdAt: number
}

export interface TranscriptSegment {
  speaker: number
  startMs: number
  endMs: number
  text: string
}

export interface AsrPresetInfo {
  id: string
  name: string
  description: string
  type: 'paraformer' | 'senseVoice' | 'whisper'
  supportsHotwords: boolean
  files: { key: string; localName: string; description: string }[]
}

export interface TranscribeProgress {
  phase: string
  fraction: number
}

export interface UpdateInfo {
  version: string
  notes: string
}
