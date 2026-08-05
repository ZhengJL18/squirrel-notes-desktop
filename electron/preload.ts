import { contextBridge, ipcRenderer } from 'electron'

// 暴露给渲染进程的 API。
const api = {
  // 数据
  listSubjects: () => ipcRenderer.invoke('db:listSubjects'),
  createSubject: (name: string) => ipcRenderer.invoke('db:createSubject', name),
  renameSubject: (id: string, name: string) =>
    ipcRenderer.invoke('db:renameSubject', id, name),
  deleteSubject: (id: string) => ipcRenderer.invoke('db:deleteSubject', id),

  listNotes: (subjectId: string) => ipcRenderer.invoke('db:listNotes', subjectId),
  getNote: (noteId: string) => ipcRenderer.invoke('db:getNote', noteId),
  createNote: (subjectId: string) => ipcRenderer.invoke('db:createNote', subjectId),
  updateNoteContent: (noteId: string, content: string) =>
    ipcRenderer.invoke('db:updateNoteContent', noteId, content),
  updateNoteMeta: (noteId: string, meta: { title?: string; pinned?: boolean }) =>
    ipcRenderer.invoke('db:updateNoteMeta', noteId, meta),
  appendToNote: (noteId: string, text: string) =>
    ipcRenderer.invoke('db:appendToNote', noteId, text),
  deleteNote: (noteId: string) => ipcRenderer.invoke('db:deleteNote', noteId),
  searchNotes: (query: string) => ipcRenderer.invoke('db:searchNotes', query),

  listAudio: (noteId: string) => ipcRenderer.invoke('db:listAudio', noteId),
  addAudio: (noteId: string, path: string, durationSec: number) =>
    ipcRenderer.invoke('db:addAudio', noteId, path, durationSec),
  updateAudio: (
    audioId: string,
    patch: { transcript?: string; status?: string }
  ) => ipcRenderer.invoke('db:updateAudio', audioId, patch),
  deleteAudio: (audioId: string) => ipcRenderer.invoke('db:deleteAudio', audioId),

  addHotword: (subjectId: string, word: string) =>
    ipcRenderer.invoke('db:addHotword', subjectId, word),

  // 音频导入/录音
  pickAudio: () => ipcRenderer.invoke('audio:pick'),
  getAudioDuration: (path: string) => ipcRenderer.invoke('audio:duration', path),

  // 转写
  transcribe: (audioId: string) => ipcRenderer.invoke('transcribe:run', audioId),
  onTranscribeProgress: (cb: (data: unknown) => void) => {
    const handler = (_e: unknown, data: unknown) => cb(data)
    ipcRenderer.on('transcribe:progress', handler)
    return () => ipcRenderer.removeListener('transcribe:progress', handler)
  },

  // 一键生成
  generateNote: (audioId: string) => ipcRenderer.invoke('generate:run', audioId),

  // 模型
  listPresets: () => ipcRenderer.invoke('models:listPresets'),
  getPreset: () => ipcRenderer.invoke('models:getPreset'),
  setPreset: (id: string) => ipcRenderer.invoke('models:setPreset', id),
  modelStatus: () => ipcRenderer.invoke('models:status'),

  // 设置
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: { deepseekKey: string; deepseekModel: string }) =>
    ipcRenderer.invoke('settings:save', settings),

  // 更新
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  onUpdateEvent: (cb: (data: unknown) => void) => {
    const handler = (_e: unknown, data: unknown) => cb(data)
    ipcRenderer.on('update:event', handler)
    return () => ipcRenderer.removeListener('update:event', handler)
  },

  // 导出
  exportNote: (noteId: string, content: string) =>
    ipcRenderer.invoke('note:export', noteId, content),

  // 通用
  openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
