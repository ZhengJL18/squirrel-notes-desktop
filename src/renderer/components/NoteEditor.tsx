import { useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import { renderMarkdown } from '../lib/markdown'

interface Props {
  content: string
  onChange: (content: string) => void
}

const cmTheme = EditorView.theme(
  {
    '&': { backgroundColor: '#14171a', color: '#e8eaec', height: '100%' },
    '.cm-content': { caretColor: '#5fa88a' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#5fa88a' },
    '&.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: '#213b32' },
    '.cm-gutters': {
      backgroundColor: '#1b1f23',
      color: '#4a535c',
      border: 'none'
    }
  },
  { dark: true }
)

export function NoteEditor({ content, onChange }: Props): React.JSX.Element {
  const [mode, setMode] = useState<'write' | 'read'>('write')

  const mdHtml = useMemo(() => renderMarkdown(content), [content])

  return (
    <div className="editor-body">
      <div className="editor-toolbar">
        <div className="seg">
          <button className={mode === 'write' ? 'active' : ''} onClick={() => setMode('write')}>
            编辑
          </button>
          <button className={mode === 'read' ? 'active' : ''} onClick={() => setMode('read')}>
            预览
          </button>
        </div>
        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
          {content.length} 字
        </span>
      </div>
      {mode === 'write' ? (
        <div className="editor-write">
          <CodeMirror
            value={content}
            height="100%"
            theme={[oneDark, cmTheme]}
            extensions={[markdown({ base: markdownLanguage })]}
            onChange={(val) => onChange(val)}
          />
        </div>
      ) : (
        <div className="editor-read">
          {content.trim() ? (
            <div className="md-body" dangerouslySetInnerHTML={{ __html: mdHtml }} />
          ) : (
            <div className="empty-state">
              <div className="icon">📝</div>
              <div className="title">空笔记</div>
              <div>切到「编辑」开始写，或点右侧「一键生成」</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
