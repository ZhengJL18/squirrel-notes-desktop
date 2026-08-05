import { useCallback, useEffect, useRef, useState } from 'react'
import type { Subject, Note, NoteAudio, TranscribeProgress } from '../electron/services/types'
import { NavPane } from './components/NavPane'
import { NoteEditor } from './components/NoteEditor'
import { AudioPane } from './components/AudioPane'
import { Settings } from './components/Settings'
import { Modal } from './components/Modal'
import { debounce } from './lib/markdown'

type PromptSpec = { kind: 'subject' } | { kind: 'rename-subject'; subject: Subject } | { kind: 'rename-note'; note: Note }

export default function App(): React.JSX.Element {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [notesCache, setNotesCache] = useState<Record<string, Note[]>>({})
  const [expandedSubjectId, setExpandedSubjectId] = useState<string | null>(null)
  const [currentNote, setCurrentNote] = useState<Note | null>(null)
  const [audios, setAudios] = useState<NoteAudio[]>([])
  const [navOpen, setNavOpen] = useState(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Note[]>([])

  const [editorContent, setEditorContent] = useState('')
  const [saveState, setSaveState] = useState('')
  const editorDirty = useRef(false)
  const loadingNote = useRef(false)

  const [transcribingId, setTranscribingId] = useState<string | null>(null)
  const [transcribePhase, setTranscribePhase] = useState('')
  const [transcribeFraction, setTranscribeFraction] = useState(0)
  const [generating, setGenerating] = useState(false)

  const [prompt, setPrompt] = useState<PromptSpec | null>(null)
  const [promptText, setPromptText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'subject' | 'note'; id: string; name: string } | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{ version: string; downloading: boolean; percent: number } | null>(null)

  // ── 数据加载 ──────────────────────────────────────────
  const loadSubjects = useCallback(async (): Promise<void> => {
    const list = await window.api.listSubjects()
    setSubjects(list)
    if (!expandedSubjectId && list.length) {
      setExpandedSubjectId(list[0].id)
    }
  }, [expandedSubjectId])

  const loadNotes = useCallback(async (subjectId: string): Promise<void> => {
    const list = await window.api.listNotes(subjectId)
    setNotesCache((prev) => ({ ...prev, [subjectId]: list }))
  }, [])

  useEffect(() => {
    loadSubjects()
  }, [loadSubjects])

  useEffect(() => {
    if (expandedSubjectId) loadNotes(expandedSubjectId)
  }, [expandedSubjectId, loadNotes])

  const selectNote = useCallback(async (noteId: string): Promise<void> => {
    const note = await window.api.getNote(noteId)
    if (!note) return
    loadingNote.current = true
    setCurrentNote(note)
    setEditorContent(note.content)
    const list = await window.api.listAudio(noteId)
    setAudios(list)
    setSaveState('已保存')
    loadingNote.current = false
    editorDirty.current = false
  }, [])

  // ── 自动保存 ──────────────────────────────────────────
  const saveNote = useCallback(async (content: string): Promise<void> => {
    if (loadingNote.current || !currentNote) return
    setSaveState('保存中…')
    await window.api.updateNoteContent(currentNote.id, content)
    setSaveState('已保存')
    editorDirty.current = false
  }, [currentNote])

  const saveDebounced = useRef(debounce((c: string) => void saveNote(c), 800)).current

  const onEditorChange = (content: string): void => {
    setEditorContent(content)
    editorDirty.current = true
    saveDebounced(content)
  }

  // ── 科目/笔记操作 ─────────────────────────────────────
  const addSubject = (): void => {
    setPromptText('')
    setPrompt({ kind: 'subject' })
  }

  const confirmPrompt = async (): Promise<void> => {
    if (!prompt) return
    if (prompt.kind === 'subject') {
      if (promptText.trim()) {
        const s = await window.api.createSubject(promptText)
        setExpandedSubjectId(s.id)
        await loadSubjects()
        await loadNotes(s.id)
      }
    } else if (prompt.kind === 'rename-subject') {
      if (promptText.trim()) {
        await window.api.renameSubject(prompt.subject.id, promptText)
        await loadSubjects()
      }
    } else if (prompt.kind === 'rename-note') {
      if (promptText.trim()) {
        await window.api.updateNoteMeta(prompt.note.id, { title: promptText })
        if (currentNote?.id === prompt.note.id) {
          setCurrentNote({ ...currentNote, title: promptText.trim() })
        }
        if (expandedSubjectId) await loadNotes(expandedSubjectId)
      }
    }
    setPrompt(null)
  }

  const addNote = async (subjectId: string): Promise<void> => {
    const note = await window.api.createNote(subjectId)
    await loadNotes(subjectId)
    await selectNote(note.id)
  }

  const toggleSubject = async (id: string): Promise<void> => {
    const next = expandedSubjectId === id ? null : id
    setExpandedSubjectId(next)
    if (next) await loadNotes(next)
  }

  const togglePin = async (n: Note): Promise<void> => {
    await window.api.updateNoteMeta(n.id, { pinned: !n.pinned })
    if (currentNote?.id === n.id) setCurrentNote({ ...currentNote, pinned: !n.pinned })
    if (expandedSubjectId) await loadNotes(expandedSubjectId)
  }

  const deleteConfirm = async (): Promise<void> => {
    if (!confirmDelete) return
    if (confirmDelete.kind === 'subject') {
      await window.api.deleteSubject(confirmDelete.id)
      if (currentNote?.subjectId === confirmDelete.id) {
        setCurrentNote(null)
        setAudios([])
        setEditorContent('')
      }
      setExpandedSubjectId(null)
      await loadSubjects()
    } else {
      await window.api.deleteNote(confirmDelete.id)
      if (currentNote?.id === confirmDelete.id) {
        setCurrentNote(null)
        setAudios([])
        setEditorContent('')
      }
      if (expandedSubjectId) await loadNotes(expandedSubjectId)
    }
    setConfirmDelete(null)
  }

  const exportNote = async (n: Note): Promise<void> => {
    const content = currentNote?.id === n.id ? editorContent : n.content
    try {
      const path = await window.api.exportNote(n.id, content)
      alert(`已导出到 ${path}`)
    } catch (e) {
      alert(`导出失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ── 音频 ──────────────────────────────────────────────
  const importAudio = async (): Promise<void> => {
    if (!currentNote) return
    const picked = await window.api.pickAudio()
    if (!picked) return
    const audio = await window.api.addAudio(currentNote.id, picked.path, picked.durationSec)
    setAudios((prev) => [audio, ...prev])
  }

  const transcribe = async (audioId: string): Promise<void> => {
    setTranscribingId(audioId)
    setTranscribePhase('检查模型')
    setTranscribeFraction(0)
    const off = window.api.onTranscribeProgress((p: TranscribeProgress) => {
      setTranscribePhase(p.phase)
      setTranscribeFraction(p.fraction)
    })
    try {
      const segments = await window.api.transcribe(audioId)
      const transcript = segments
        .map((s) => (s.speaker >= 0 ? `[说话人${s.speaker + 1}] ` : '') + s.text)
        .join('\n')
      await window.api.updateAudio(audioId, { transcript, status: 'done' })
      setAudios((prev) =>
        prev.map((a) => (a.id === audioId ? { ...a, transcript, status: 'done' as const } : a))
      )
    } catch (e) {
      await window.api.updateAudio(audioId, { status: 'failed' })
      alert(`转写失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      off()
      setTranscribingId(null)
    }
  }

  const generate = async (audioId: string): Promise<void> => {
    const item = audios.find((a) => a.id === audioId)
    if (!item || !item.transcript.trim()) {
      alert('请先转写这段音频')
      return
    }
    setGenerating(true)
    try {
      const result = await window.api.generateNote(audioId)
      if (result.added > 0) await loadSubjects()
      if (currentNote) {
        const updated = await window.api.getNote(currentNote.id)
        if (updated) {
          setCurrentNote(updated)
          setEditorContent(updated.content)
        }
      }
      alert(result.added > 0 ? `笔记已生成，并回填 ${result.added} 个热词` : '笔记已生成')
    } catch (e) {
      alert(`生成失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setGenerating(false)
    }
  }

  const deleteAudio = async (audioId: string): Promise<void> => {
    await window.api.deleteAudio(audioId)
    setAudios((prev) => prev.filter((a) => a.id !== audioId))
  }

  // ── 搜索 ──────────────────────────────────────────────
  const search = useCallback(
    debounce(async (q: string) => {
      setSearchQuery(q)
      if (!q.trim()) {
        setSearchResults([])
        return
      }
      const r = await window.api.searchNotes(q)
      setSearchResults(r)
    }, 300),
    []
  )

  // ── 更新 ──────────────────────────────────────────────
  useEffect(() => {
    const off = window.api.onUpdateEvent((data) => {
      const d = data as { type: string; version?: string; percent?: number }
      if (d.type === 'update-available') {
        setUpdateInfo({ version: d.version ?? '', downloading: false, percent: 0 })
      } else if (d.type === 'update-progress') {
        setUpdateInfo((prev) => prev ? { ...prev, downloading: true, percent: d.percent ?? 0 } : prev)
      } else if (d.type === 'update-downloaded') {
        setUpdateInfo((prev) => prev ? { ...prev, downloading: false } : prev)
        alert('新版已下载，重启应用即可安装')
      }
    })
    return off
  }, [])

  const downloadUpdate = (): void => {
    window.api.downloadUpdate()
    setUpdateInfo((prev) => prev ? { ...prev, downloading: true } : prev)
  }

  // ── 渲染 ──────────────────────────────────────────────
  return (
    <div className="app">
      {updateInfo && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 300 }}>
          <div className="update-banner">
            <span>⬇️ 发现新版本 v{updateInfo.version}</span>
            <span style={{ flex: 1 }} />
            {updateInfo.downloading ? (
              <span>下载中… {Math.round(updateInfo.percent)}%</span>
            ) : (
              <button className="btn primary" onClick={downloadUpdate}>
                下载
              </button>
            )}
          </div>
        </div>
      )}

      <div className="topbar">
        <button className="icon-btn" onClick={() => setNavOpen(!navOpen)}>
          {navOpen ? '◀' : '▶'}
        </button>
        <div className="app-title">
          <span className="leaf">🌿</span> 松鼠症笔记
        </div>
        <div className="spacer" />
        <button className="icon-btn" title="设置" onClick={() => setShowSettings(true)}>
          ⚙️
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {navOpen && (
          <NavPane
            subjects={subjects}
            notesCache={notesCache}
            expandedSubjectId={expandedSubjectId}
            currentNoteId={currentNote?.id ?? null}
            searchActive={searchQuery.trim().length > 0}
            searchResults={searchResults}
            onToggleSubject={(id) => void toggleSubject(id)}
            onSelectNote={(id) => void selectNote(id)}
            onAddSubject={addSubject}
            onAddNote={(sid) => void addNote(sid)}
            onRenameSubject={(s) => {
              setPromptText(s.name)
              setPrompt({ kind: 'rename-subject', subject: s })
            }}
            onDeleteSubject={(s) => setConfirmDelete({ kind: 'subject', id: s.id, name: s.name })}
            onRenameNote={(n) => {
              setPromptText(n.title)
              setPrompt({ kind: 'rename-note', note: n })
            }}
            onTogglePin={(n) => void togglePin(n)}
            onExportNote={(n) => void exportNote(n)}
            onDeleteNote={(n) => setConfirmDelete({ kind: 'note', id: n.id, name: n.title })}
            onSearch={search}
          />
        )}

        <div className="main-pane">
          <div className="editor-header">
            {currentNote ? (
              <>
                <span className="note-title">
                  {currentNote.pinned ? '📌 ' : ''}
                  {currentNote.title}
                </span>
                <span className="save-state">{saveState}</span>
                <button className="icon-btn" title="导出" onClick={() => void exportNote(currentNote)}>
                  📤
                </button>
              </>
            ) : (
              <span className="note-title" style={{ color: 'var(--text-dim)' }}>
                选择或新建一篇笔记
              </span>
            )}
          </div>
          {currentNote ? (
            <NoteEditor content={editorContent} onChange={onEditorChange} />
          ) : (
            <div className="empty-state" style={{ flex: 1 }}>
              <div className="icon">📝</div>
              <div className="title">选择或新建一篇笔记开始</div>
              <div>左边建个科目，再建一篇笔记</div>
            </div>
          )}
        </div>

        <AudioPane
          noteId={currentNote?.id ?? null}
          audios={audios}
          transcribingId={transcribingId}
          transcribePhase={transcribePhase}
          transcribeFraction={transcribeFraction}
          generating={generating}
          onImportAudio={() => void importAudio()}
          onTranscribe={(id) => void transcribe(id)}
          onGenerate={(id) => void generate(id)}
          onDeleteAudio={(id) => void deleteAudio(id)}
        />
      </div>

      {/* 弹窗 */}
      {prompt && (
        <Modal
          title={
            prompt.kind === 'subject'
              ? '新建科目'
              : prompt.kind === 'rename-subject'
                ? '重命名科目'
                : '重命名笔记'
          }
          onCancel={() => setPrompt(null)}
          onOk={() => void confirmPrompt()}
          okText="确定"
        >
          <input
            autoFocus
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void confirmPrompt()}
            placeholder="名称"
          />
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title={confirmDelete.kind === 'subject' ? `删除科目「${confirmDelete.name}」？` : `删除笔记「${confirmDelete.name}」？`}
          onCancel={() => setConfirmDelete(null)}
          onOk={() => void deleteConfirm()}
          okText="删除"
          danger
        >
          <p style={{ color: 'var(--text-dim)' }}>
            该{confirmDelete.kind === 'subject' ? '科目下的笔记' : '笔记'}及其转写记录将被删除，不可恢复。
          </p>
        </Modal>
      )}

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  )
}
