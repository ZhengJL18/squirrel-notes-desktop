import { app, dialog, BrowserWindow } from 'electron'
import { join, extname, basename } from 'path'
import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { execFileSync } from 'child_process'
// @ts-ignore
import ffmpegPath from 'ffmpeg-static'

const AUDIO_EXTS = ['m4a', 'mp3', 'wav', 'flac', 'aac', 'ogg', 'amr']

export function audioDir(): string {
  const dir = join(app.getPath('userData'), 'audio')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** 弹出文件选择框，把选中的音频拷贝进应用数据目录。 */
export async function pickAudioFile(
  win: BrowserWindow
): Promise<{ path: string; durationSec: number } | null> {
  const result = await dialog.showOpenDialog(win, {
    title: '选择课堂录音',
    properties: ['openFile'],
    filters: [{ name: '音频', extensions: AUDIO_EXTS }]
  })
  if (result.canceled || !result.filePaths.length) return null
  const src = result.filePaths[0]
  const dst = join(audioDir(), `${Date.now()}${extname(src)}`)
  copyFileSync(src, dst)
  return { path: dst, durationSec: getAudioDuration(dst) }
}

/** 用 ffmpeg 解析音频时长（秒）。 */
export function getAudioDuration(path: string): number {
  try {
    const out = execFileSync(ffmpegPath as string, ['-i', path], {
      encoding: 'utf-8',
      stdio: ['ignore', 'ignore', 'pipe']
    })
    return parseDuration(out)
  } catch (err) {
    // ffmpeg -i 对无输出文件的调用会返回非0，但 stderr 含时长信息。
    const stderr = (err as { stderr?: Buffer | string }).stderr
    const text = Buffer.isBuffer(stderr) ? stderr.toString('utf-8') : String(stderr ?? '')
    return parseDuration(text)
  }
}

function parseDuration(ffmpegOutput: string): number {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(ffmpegOutput)
  if (!m) return 0
  return (
    Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(parseFloat(m[3]))
  )
}

export function friendlyName(path: string): string {
  return basename(path)
}

export function exists(path: string): boolean {
  return existsSync(path)
}
