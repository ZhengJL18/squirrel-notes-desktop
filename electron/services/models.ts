import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, createWriteStream, existsSync, statSync } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { AsrPresetInfo } from './types'
import { getSettings, saveSettings } from './settings'

export interface ModelFileDef {
  key: string
  url: string
  localName: string
  description: string
}

export interface AsrPresetDef extends AsrPresetInfo {
  language: string
  files: ModelFileDef[]
}

// 固定通用件（VAD + 说话人分离）。
const COMMON_FILES: ModelFileDef[] = [
  {
    key: 'vad',
    url: 'https://huggingface.co/R4kSo1997/sherpa-onnx-silero-vad-v5/resolve/main/silero_vad.onnx',
    localName: 'silero_vad.onnx',
    description: '语音活动检测（VAD，约 2MB）'
  },
  {
    key: 'segmentation',
    url: 'https://huggingface.co/csukuangfj/sherpa-onnx-pyannote-segmentation-3-0/resolve/main/model.int8.onnx',
    localName: 'pyannote_seg.int8.onnx',
    description: '说话人分割（Pyannote，约 80MB）'
  },
  {
    key: 'embedding',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/nemo_en_titanet_large.onnx',
    localName: 'nemo_titanet_large.onnx',
    description: '说话人嵌入（NeMo Titanet-Large，约 30MB）'
  }
]

export const ASR_PRESETS: AsrPresetDef[] = [
  {
    id: 'paraformer-zh-large',
    name: '中文标准（默认）',
    description: 'Paraformer 中文大模型，转写最准，支持热词纠偏',
    type: 'paraformer',
    language: '',
    supportsHotwords: true,
    files: [
      {
        key: 'asr',
        url: 'https://huggingface.co/csukuangfj/sherpa-onnx-paraformer-zh-2023-09-14/resolve/main/model.int8.onnx',
        localName: 'paraformer-zh-large.int8.onnx',
        description: 'Paraformer 中文大模型（int8，约 900MB）'
      },
      {
        key: 'tokens',
        url: 'https://huggingface.co/csukuangfj/sherpa-onnx-paraformer-zh-2023-09-14/resolve/main/tokens.txt',
        localName: 'paraformer-zh-large-tokens.txt',
        description: 'Paraformer 词表'
      }
    ]
  },
  {
    id: 'paraformer-zh-small',
    name: '中文轻量',
    description: 'Paraformer 中文小模型，更快，体积更小，支持热词',
    type: 'paraformer',
    language: '',
    supportsHotwords: true,
    files: [
      {
        key: 'asr',
        url: 'https://huggingface.co/csukuangfj/sherpa-onnx-paraformer-zh-small-2024-03-09/resolve/main/model.int8.onnx',
        localName: 'paraformer-zh-small.int8.onnx',
        description: 'Paraformer 中文小模型（int8）'
      },
      {
        key: 'tokens',
        url: 'https://huggingface.co/csukuangfj/sherpa-onnx-paraformer-zh-small-2024-03-09/resolve/main/tokens.txt',
        localName: 'paraformer-zh-small-tokens.txt',
        description: 'Paraformer 小模型词表'
      }
    ]
  },
  {
    id: 'paraformer-bilingual-zh-en',
    name: '中英双语',
    description: 'Paraformer 中英混合，适合英文夹杂的课，支持热词',
    type: 'paraformer',
    language: '',
    supportsHotwords: true,
    files: [
      {
        key: 'asr',
        url: 'https://huggingface.co/csukuangfj/sherpa-onnx-paraformer-bilingual-zh-en/resolve/main/model.int8.onnx',
        localName: 'paraformer-bilingual.int8.onnx',
        description: 'Paraformer 中英双语模型（int8）'
      },
      {
        key: 'tokens',
        url: 'https://huggingface.co/csukuangfj/sherpa-onnx-paraformer-bilingual-zh-en/resolve/main/tokens.txt',
        localName: 'paraformer-bilingual-tokens.txt',
        description: 'Paraformer 双语词表'
      }
    ]
  },
  {
    id: 'sensevoice-zh',
    name: '轻快·带标点',
    description: 'SenseVoiceSmall（中英日韩粤），自带标点，速度最快，约 250MB，无热词',
    type: 'senseVoice',
    language: 'zh',
    supportsHotwords: false,
    files: [
      {
        key: 'asr',
        url: 'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.onnx',
        localName: 'sensevoice.model.onnx',
        description: 'SenseVoiceSmall（约 250MB）'
      },
      {
        key: 'tokens',
        url: 'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/tokens.txt',
        localName: 'sensevoice-tokens.txt',
        description: 'SenseVoice 词表'
      }
    ]
  },
  {
    id: 'whisper-small',
    name: '多语言通用（小）',
    description: 'Whisper-small，99 语言自动识别，约 500MB，无热词',
    type: 'whisper',
    language: '',
    supportsHotwords: false,
    files: [
      {
        key: 'encoder',
        url: 'https://huggingface.co/csukuangfj/sherpa-onnx-whisper-small/resolve/main/small-encoder.int8.onnx',
        localName: 'whisper-small-encoder.int8.onnx',
        description: 'Whisper-small 编码器'
      },
      {
        key: 'decoder',
        url: 'https://huggingface.co/csukuangfj/sherpa-onnx-whisper-small/resolve/main/small-decoder.int8.onnx',
        localName: 'whisper-small-decoder.int8.onnx',
        description: 'Whisper-small 解码器'
      },
      {
        key: 'tokens',
        url: 'https://huggingface.co/csukuangfj/sherpa-onnx-whisper-small/resolve/main/small-tokens.txt',
        localName: 'whisper-small-tokens.txt',
        description: 'Whisper-small 词表'
      }
    ]
  },
  {
    id: 'whisper-large',
    name: '多语言最强（大）',
    description: 'Whisper-large，99 语言，约 3GB，无热词',
    type: 'whisper',
    language: '',
    supportsHotwords: false,
    files: [
      {
        key: 'encoder',
        url: 'https://huggingface.co/csukuangfj/sherpa-onnx-whisper-large/resolve/main/large-encoder.int8.onnx',
        localName: 'whisper-large-encoder.int8.onnx',
        description: 'Whisper-large 编码器'
      },
      {
        key: 'decoder',
        url: 'https://huggingface.co/csukuangfj/sherpa-onnx-whisper-large/resolve/main/large-decoder.int8.onnx',
        localName: 'whisper-large-decoder.int8.onnx',
        description: 'Whisper-large 解码器'
      },
      {
        key: 'tokens',
        url: 'https://huggingface.co/csukuangfj/sherpa-onnx-whisper-large/resolve/main/large-tokens.txt',
        localName: 'whisper-large-tokens.txt',
        description: 'Whisper-large 词表'
      }
    ]
  }
]

export const DEFAULT_PRESET_ID = 'paraformer-zh-large'

export function presetById(id: string): AsrPresetDef {
  return ASR_PRESETS.find((p) => p.id === id) ?? ASR_PRESETS[0]
}

export function listPresetInfos(): AsrPresetInfo[] {
  return ASR_PRESETS.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    type: p.type,
    supportsHotwords: p.supportsHotwords,
    files: p.files.map((f) => ({
      key: f.key,
      localName: f.localName,
      description: f.description
    }))
  }))
}

export function getPresetId(): string {
  return getSettings().asrPresetId
}

export function setPresetId(id: string): void {
  saveSettings({ asrPresetId: id })
}

function modelsDir(): string {
  const dir = join(app.getPath('userData'), 'models')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function filePath(localName: string): string {
  return join(modelsDir(), localName)
}

function isDownloaded(def: ModelFileDef): boolean {
  const p = filePath(def.localName)
  try {
    return existsSync(p) && statSync(p).size > 0
  } catch {
    return false
  }
}

function allFiles(preset: AsrPresetDef): ModelFileDef[] {
  return [...COMMON_FILES, ...preset.files]
}

/** 所有文件是否就绪。 */
export function allReady(preset?: AsrPresetDef): boolean {
  const p = preset ?? presetById(getPresetId())
  return allFiles(p).every(isDownloaded)
}

/** 各文件下载状态（供 UI 展示）。 */
export function fileStatuses(preset?: AsrPresetDef): {
  name: string
  done: boolean
  sizeHint: string
}[] {
  const p = preset ?? presetById(getPresetId())
  return allFiles(p).map((f) => ({
    name: f.localName,
    done: isDownloaded(f),
    sizeHint: f.description
  }))
}

export type DownloadProgressCb = (
  doneBytes: number,
  totalBytes: number,
  localName: string,
  index: number,
  count: number
) => void

/** 下载缺失模型文件。 */
export async function ensureDownloaded(
  preset: AsrPresetDef,
  onProgress?: DownloadProgressCb
): Promise<void> {
  const files = allFiles(preset)
  const total = files.length
  for (let i = 0; i < total; i++) {
    const f = files[i]
    if (isDownloaded(f)) {
      onProgress?.(-1, -1, f.localName, i + 1, total)
      continue
    }
    const target = filePath(f.localName)
    await downloadFile(f.url, target, (done, totalBytes) => {
      onProgress?.(done, totalBytes, f.localName, i + 1, total)
    })
  }
}

async function downloadFile(
  url: string,
  target: string,
  onProgress: (done: number, total: number) => void
): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`下载失败：HTTP ${response.status} (${url})`)
  }
  const total = Number(response.headers.get('content-length') ?? 0)
  const writer = createWriteStream(target)
  let done = 0
  const reader = response.body.getReader()
  const source = new Readable({
    async read() {
      const { done: d, value } = await reader.read()
      if (d) {
        this.push(null)
      } else {
        done += value.length
        onProgress(done, total)
        this.push(value)
      }
    }
  })
  await pipeline(source, writer)
}
