import { utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'path'
import { ensureDownloaded, presetById, getPresetId, filePath } from './models'
import { getAudio, updateAudio, getNote, hotwordsOf } from './db'
import type { TranscriptSegment, TranscribeProgress } from './types'

let worker: UtilityProcess | null = null

function getWorker(): UtilityProcess {
  if (worker) return worker
  worker = utilityProcess.fork(join(__dirname, 'transcribe-worker.js'))
  return worker
}

interface WorkerMessage {
  type: 'progress' | 'result' | 'error'
  phase?: string
  fraction?: number
  segments?: TranscriptSegment[]
  message?: string
}

/** 对一段音频执行转写（VAD → ASR → 说话人分离）。 */
export async function transcribeAudio(
  audioId: string,
  onProgress?: (p: TranscribeProgress) => void
): Promise<TranscriptSegment[]> {
  const audio = getAudio(audioId)
  if (!audio) throw new Error('音频不存在')
  const note = getNote(audio.noteId)
  if (!note) throw new Error('笔记不存在')
  const subjectHotwords = hotwordsOf(note.subjectId)

  updateAudio(audioId, { status: 'transcribing' })
  const preset = presetById(getPresetId())

  // 确保模型已下载。
  await ensureDownloaded(preset, (done, total, name, index, count) => {
    onProgress?.({
      phase: `下载模型 ${name}（${index}/${count}）`,
      fraction: done > 0 && total > 0 ? done / total : 0
    })
  })

  // 汇总模型路径。
  const modelOf = (key: string): string => {
    const def = preset.files.find((f) => f.key === key)
    return def ? filePath(def.localName) : ''
  }
  const models = {
    asr: modelOf('asr'),
    tokens: modelOf('tokens'),
    encoder: modelOf('encoder'),
    decoder: modelOf('decoder'),
    vad: filePath('silero_vad.onnx'),
    segmentation: filePath('pyannote_seg.int8.onnx'),
    embedding: filePath('nemo_titanet_large.onnx')
  }

  const w = getWorker()
  return new Promise<TranscriptSegment[]>((resolve, reject) => {
    const handler = (msg: WorkerMessage): void => {
      if (msg.type === 'progress') {
        onProgress?.({ phase: msg.phase ?? '', fraction: msg.fraction ?? 0 })
      } else if (msg.type === 'result') {
        cleanup()
        resolve(msg.segments ?? [])
      } else if (msg.type === 'error') {
        cleanup()
        reject(new Error(msg.message ?? '转写失败'))
      }
    }
    const cleanup = (): void => {
      w.off('message', handler)
    }
    w.on('message', handler)
    w.postMessage({
      type: 'transcribe',
      job: {
        audioPath: audio.path,
        models,
        asrType: preset.type,
        language: preset.language,
        hotwords: preset.supportsHotwords ? subjectHotwords : []
      }
    })
  })
}
