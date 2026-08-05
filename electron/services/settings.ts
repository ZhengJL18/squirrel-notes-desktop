import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

export interface AppSettings {
  asrPresetId: string
  deepseekKey: string
  deepseekModel: string
}

const DEFAULTS: AppSettings = {
  asrPresetId: 'paraformer-zh-large',
  deepseekKey: '',
  deepseekModel: 'deepseek-chat'
}

function settingsPath(): string {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'settings.json')
}

export function getSettings(): AppSettings {
  try {
    const raw = readFileSync(settingsPath(), 'utf-8')
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf-8')
  return next
}
