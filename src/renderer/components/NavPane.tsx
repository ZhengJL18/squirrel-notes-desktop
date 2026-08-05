import { useState } from 'react'
import type { Subject, Note } from '../../../electron/services/types'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { Modal } from './Modal'

interface Props {
  subjects: Subject[]
  notesCache: Record<string, Note[]>
  expandedSubjectId: string | null
  currentNoteId: string | null
  searchActive: boolean
  searchResults: Note[]
  onToggleSubject: (id: string) => void
  onSelectNote: (id: string) => void
  onAddSubject: () => void
  onAddNote: (subjectId: string) => void
  onRenameSubject: (s: Subject) => void
  onDeleteSubject: (s: Subject) => void
  onRenameNote: (n: Note) => void
  onTogglePin: (n: Note) => void
  onExportNote: (n: Note) => void
  onDeleteNote: (n: Note) => void
  onSearch: (q: string) => void
}

export function NavPane(props: Props): React.JSX.Element {
  const [menu, setMenu] = useState<{
    x: number
    y: number
    items: MenuItem[]
  } | null>(null)

  const openMenu = (e: React.MouseEvent, items: MenuItem[]): void => {
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  return (
    <div className="nav-pane" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="nav-search">
        <input
          placeholder="搜索笔记…"
          onChange={(e) => props.onSearch(e.target.value)}
        />
      </div>
      <div className="nav-tree">
        {props.searchActive ? (
          props.searchResults.length === 0 ? (
            <div className="empty-state">
              <div className="icon">🔍</div>
              <div>没有匹配的笔记</div>
            </div>
          ) : (
            props.searchResults.map((n) => (
              <div
                key={n.id}
                className={`note-row${n.id === props.currentNoteId ? ' active' : ''}`}
                onClick={() => props.onSelectNote(n.id)}
              >
                <span className="pin">{n.pinned ? '📌' : '📄'}</span>
                <span className="title">{n.title}</span>
              </div>
            ))
          )
        ) : props.subjects.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📚</div>
            <div className="title">还没有科目</div>
            <div>建一个科目，比如「方剂学」</div>
            <button className="btn primary" onClick={props.onAddSubject}>
              + 新建科目
            </button>
          </div>
        ) : (
          props.subjects.map((s) => {
            const expanded = props.expandedSubjectId === s.id
            const notes = props.notesCache[s.id] ?? []
            return (
              <div key={s.id}>
                <div className="subject-row" onClick={() => props.onToggleSubject(s.id)}>
                  <span className="folder">📁</span>
                  <span className="name">{s.name}</span>
                  <span className="count">{s.hotwords.length}</span>
                  <button
                    className="menu-btn"
                    onClick={(e) =>
                      openMenu(e, [
                        { label: '重命名', icon: '✏️', action: () => props.onRenameSubject(s) },
                        { label: '删除科目', icon: '🗑️', danger: true, action: () => props.onDeleteSubject(s) }
                      ])
                    }
                  >
                    ⋯
                  </button>
                </div>
                {expanded && (
                  <>
                    {notes.map((n) => (
                      <div
                        key={n.id}
                        className={`note-row${n.id === props.currentNoteId ? ' active' : ''}`}
                        onClick={() => props.onSelectNote(n.id)}
                      >
                        <span className="pin">{n.pinned ? '📌' : '📄'}</span>
                        <span className="title">{n.title}</span>
                        <button
                          className="menu-btn"
                          onClick={(e) =>
                            openMenu(e, [
                              { label: '重命名', icon: '✏️', action: () => props.onRenameNote(n) },
                              { label: n.pinned ? '取消置顶' : '置顶', icon: '📌', action: () => props.onTogglePin(n) },
                              { label: '导出 Markdown', icon: '📤', action: () => props.onExportNote(n) },
                              { label: '删除', icon: '🗑️', danger: true, action: () => props.onDeleteNote(n) }
                            ])
                          }
                        >
                          ⋯
                        </button>
                      </div>
                    ))}
                    <button className="btn text" style={{ marginLeft: 28 }} onClick={() => props.onAddNote(s.id)}>
                      + 新建笔记
                    </button>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>
      {props.subjects.length > 0 && (
        <div style={{ padding: 8 }}>
          <button className="btn" style={{ width: '100%' }} onClick={props.onAddSubject}>
            + 新建科目
          </button>
        </div>
      )}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      )}
    </div>
  )
}
