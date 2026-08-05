import { autoUpdater } from 'electron-updater'
import type { UpdateInfo } from './types'

let notifyFn: ((data: unknown) => void) | null = null

export function setUpdateNotifier(fn: (data: unknown) => void): void {
  notifyFn = fn
}

function emit(data: unknown): void {
  notifyFn?.(data)
}

export function initUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    emit({
      type: 'update-available',
      version: info.version,
      notes: (info as unknown as { releaseNotes?: string }).releaseNotes ?? ''
    })
  })
  autoUpdater.on('update-not-available', () => {
    emit({ type: 'update-not-available' })
  })
  autoUpdater.on('download-progress', (p) => {
    emit({
      type: 'update-progress',
      percent: p.percent,
      transferred: p.transferred,
      total: p.total
    })
  })
  autoUpdater.on('update-downloaded', () => {
    emit({ type: 'update-downloaded' })
  })
  autoUpdater.on('error', (err) => {
    emit({ type: 'update-error', message: err.message })
  })
}

/** 检查更新（返回是否有可用更新）。 */
export async function checkUpdate(): Promise<UpdateInfo | null> {
  try {
    const result = await autoUpdater.checkForUpdates()
    if (result?.updateInfo) {
      const info = result.updateInfo
      return {
        version: info.version,
        notes: (info as unknown as { releaseNotes?: string }).releaseNotes ?? ''
      }
    }
    return null
  } catch {
    return null
  }
}

/** 下载更新。 */
export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate()
}

/** 下载完成后提示安装。 */
export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
