import type { NoteAudio } from '../../../electron/services/types'
import { formatDuration } from '../lib/markdown'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { useState } from 'react'

interface Props {
  noteId: string | null
  audios: NoteAudio[]
  transcribingId: string | null
  transcribePhase: string
  transcribeFraction: number
  generating: boolean
  onImportAudio: () => void
  onTranscribe: (audioId: string) => void
  onGenerate: (audioId: string) => void
  onDeleteAudio: (audioId: string) => void
}

const STATUS_ICON: Record<string, string> = {
  ready: '🎙️',
  transcribing: '⏳',
  done: '✅',
  failed: '⚠️'
}

const STATUS_LABEL: Record<string, string> = {
  ready: '待转写',
  transcribing: '转写中…',
  done: '已转写',
  failed: '转写失败'
}

export function AudioPane(props: Props): React.JSX.Element {
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[]; id: string } | null>(null)

  return (
    <div className="audio-pane">
      <div className="audio-header">
        <span className="title">音频</span>
        <button className="icon-btn" title="导入音频" onClick={props.onImportAudio}>
          🎵
        </button>
      </div>
      <div className="audio-list">
        {!props.noteId ? (
          <div className="empty-state">
            <div className="icon">🎧</div>
            <div>选中一篇笔记后导入音频</div>
          </div>
        ) : props.audios.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📊</div>
            <div className="title">还没有音频</div>
            <div>点右上角导入录音文件</div>
          </div>
        ) : (
          props.audios.map((a, i) => {
            const isTranscribing = props.transcribingId === a.id
            return (
              <div className="audio-card" key={a.id}>
                <div className="top">
                  <div className="badge">{STATUS_ICON[a.status] ?? '🎙️'}</div>
                  <div className="info">
                    <div className="name">录音 {i + 1}</div>
                    <div className="meta">
                      {[formatDuration(a.durationSec), a.status === 'done' && a.transcript ? `已转写 ${a.transcript.length} 字` : STATUS_LABEL[a.status] ?? '']
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <button
                    className="menu-btn"
                    style={{ visibility: 'visible' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenu({
                        x: e.clientX,
                        y: e.clientY,
                        id: a.id,
                        items: [
                          { label: '删除这段录音', icon: '🗑️', danger: true, action: () => props.onDeleteAudio(a.id) }
                        ]
                      })
                    }}
                  >
                    ⋯
                  </button>
                </div>
                {isTranscribing && (
                  <>
                    <div
                      style={{
                        height: 4,
                        background: 'var(--surface-high)',
                        borderRadius: 2,
                        marginTop: 8,
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.round((props.transcribeFraction || 0) * 100)}%`,
                          background: 'var(--accent)',
                          transition: 'width 0.2s'
                        }}
                      />
                    </div>
                    <div className="meta" style={{ marginTop: 4 }}>
                      {props.transcribePhase}
                    </div>
                  </>
                )}
                <div className="actions">
                  <button
                    className="btn"
                    disabled={isTranscribing}
                    onClick={() => props.onTranscribe(a.id)}
                  >
                    转写
                  </button>
                  <button
                    className="btn primary"
                    disabled={isTranscribing || props.generating}
                    onClick={() => props.onGenerate(a.id)}
                  >
                    {props.generating ? '生成中…' : '一键生成'}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      )}
    </div>
  )
}
