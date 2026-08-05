import { useEffect, useState } from 'react'
import type { AsrPresetInfo } from '../../../electron/services/types'
import type { Settings as SettingsType } from '../lib/api'
import { Modal } from './Modal'

interface Props {
  onClose: () => void
}

export function Settings({ onClose }: Props): React.JSX.Element {
  const [presets, setPresets] = useState<AsrPresetInfo[]>([])
  const [currentId, setCurrentId] = useState('')
  const [settings, setSettings] = useState<SettingsType>({
    asrPresetId: '',
    deepseekKey: '',
    deepseekModel: 'deepseek-chat'
  })

  useEffect(() => {
    window.api.listPresets().then(setPresets)
    window.api.getPreset().then((p) => setCurrentId(p.id))
    window.api.getSettings().then(setSettings)
  }, [])

  const current = presets.find((p) => p.id === currentId)

  const save = async (): Promise<void> => {
    await window.api.saveSettings({
      deepseekKey: settings.deepseekKey,
      deepseekModel: settings.deepseekModel
    })
    onClose()
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose()
    }}>
      <div className="modal" style={{ width: 420 }}>
        <h3>设置</h3>

        <div style={{ marginBottom: 12 }}>
          <label style={{ color: 'var(--text-dim)', fontSize: 12 }}>语音转写模型</label>
          <select
            style={{
              width: '100%',
              background: 'var(--surface-high)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 10px',
              marginTop: 4
            }}
            value={currentId}
            onChange={(e) => {
              setCurrentId(e.target.value)
              window.api.setPreset(e.target.value)
            }}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {current && (
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 6 }}>
              {current.description}
              {current.supportsHotwords
                ? ' · 支持热词纠偏'
                : ' · 无热词，但一键生成仍会用科目热词纠偏'}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ color: 'var(--text-dim)', fontSize: 12 }}>DeepSeek API Key</label>
          <input
            type="password"
            style={{ marginTop: 4 }}
            value={settings.deepseekKey}
            onChange={(e) => setSettings({ ...settings, deepseekKey: e.target.value })}
            placeholder="sk-..."
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ color: 'var(--text-dim)', fontSize: 12 }}>DeepSeek 模型</label>
          <input
            style={{ marginTop: 4 }}
            value={settings.deepseekModel}
            onChange={(e) => setSettings({ ...settings, deepseekModel: e.target.value })}
            placeholder="deepseek-chat"
          />
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
