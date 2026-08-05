// 转写 worker：在独立 utilityProcess 中执行 sherpa-onnx（同步 API），不阻塞主进程。
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
// @ts-ignore -- sherpa-onnx-node 无类型定义
import * as sherpa_onnx from 'sherpa-onnx-node'

// @ts-ignore -- ffmpeg-static 无类型定义
import ffmpegPath from 'ffmpeg-static'

interface ModelPaths {
  asr: string
  tokens: string
  encoder: string
  decoder: string
  vad: string
  segmentation: string
  embedding: string
}

interface TranscribeJob {
  audioPath: string
  models: ModelPaths
  asrType: 'paraformer' | 'senseVoice' | 'whisper'
  language: string
  hotwords: string[]
}

interface OutputSegment {
  speaker: number
  startMs: number
  endMs: number
  text: string
}

function post(msg: unknown): void {
  // utilityProcess 子进程通过 process.parentPort 与主进程通信。
  // @ts-ignore
  process.parentPort?.postMessage(msg)
}

function toWav(src: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'sq-'))
  const wav = join(dir, 'audio.wav')
  const ff = ffmpegPath as string
  execFileSync(ff, [
    '-y',
    '-i',
    src,
    '-ar',
    '16000',
    '-ac',
    '1',
    '-sample_fmt',
    's16',
    wav
  ])
  return wav
}

function buildRecognizer(
  job: TranscribeJob
): InstanceType<typeof sherpa_onnx.OfflineRecognizer> {
  const m = job.models
  const modelConfig: Record<string, unknown> = {
    numThreads: 4,
    provider: 'cpu'
  }
  if (job.asrType === 'paraformer') {
    modelConfig.paraformer = { model: m.asr }
  } else if (job.asrType === 'senseVoice') {
    modelConfig.senseVoice = {
      model: m.asr,
      language: job.language || 'zh',
      useInverseTextNormalization: true
    }
  } else {
    modelConfig.whisper = {
      encoder: m.encoder,
      decoder: m.decoder,
      language: '',
      task: 'transcribe'
    }
  }
  const config: Record<string, unknown> = {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      tokens: m.tokens,
      ...modelConfig
    }
  }
  // Paraformer 热词：写入临时 hotwords 文件，通过 config.hotwordsFile 生效。
  if (job.asrType === 'paraformer' && job.hotwords.length) {
    const dir = mkdtempSync(join(tmpdir(), 'sq-hw-'))
    const hwFile = join(dir, 'hotwords.txt')
    writeFileSync(hwFile, job.hotwords.join('\n'), 'utf-8')
    config.hotwordsFile = hwFile
    config.hotwordsScore = 1.5
  }
  return new sherpa_onnx.OfflineRecognizer(config)
}

function buildVad(model: string): InstanceType<typeof sherpa_onnx.Vad> {
  const config = {
    sileroVad: {
      model,
      threshold: 0.5,
      minSpeechDuration: 0.25,
      minSilenceDuration: 0.5,
      maxSpeechDuration: 20,
      windowSize: 512
    },
    sampleRate: 16000,
    numThreads: 1
  }
  return new sherpa_onnx.Vad(config, 60)
}

function buildDiarization(job: TranscribeJob): InstanceType<typeof sherpa_onnx.OfflineSpeakerDiarization> {
  const config = {
    segmentation: { pyannote: { model: job.models.segmentation } },
    embedding: { model: job.models.embedding },
    clustering: { numClusters: -1, threshold: 0.5 },
    minDurationOn: 0.2,
    minDurationOff: 0.5
  }
  return new sherpa_onnx.OfflineSpeakerDiarization(config)
}

function runTranscribe(job: TranscribeJob): OutputSegment[] {
  post({ type: 'progress', phase: '转换音频', fraction: 0.02 })
  const wavPath = toWav(job.audioPath)
  const wave = sherpa_onnx.readWave(wavPath)

  // VAD 切段。
  post({ type: 'progress', phase: '切分语音', fraction: 0.1 })
  const recognizer = buildRecognizer(job)
  const vad = buildVad(job.models.vad)
  const windowSize = vad.config.sileroVad.windowSize
  const vadSegs: { start: number; samples: Float32Array }[] = []
  for (let i = 0; i < wave.samples.length; i += windowSize) {
    vad.acceptWaveform(wave.samples.subarray(i, i + windowSize))
    while (!vad.isEmpty()) {
      const seg = vad.front()
      vad.pop()
      if (seg.samples.length > 0) {
        vadSegs.push({ start: seg.start, samples: seg.samples })
      }
    }
  }
  vadSegs.sort((a, b) => a.start - b.start)

  // 逐段转写。
  const recognized: { start: number; text: string }[] = []
  for (let i = 0; i < vadSegs.length; i++) {
    const seg = vadSegs[i]
    const stream = recognizer.createStream(
      job.asrType === 'paraformer' && job.hotwords.length ? job.hotwords.join(' ') : ''
    )
    stream.acceptWaveform({ sampleRate: 16000, samples: seg.samples })
    recognizer.decode(stream)
    const result = recognizer.getResult(stream)
    const text = result.text.trim()
    if (text) {
      recognized.push({ start: seg.start / 16000 * 1000, text })
    }
    post({
      type: 'progress',
      phase: `转写中 ${i + 1}/${vadSegs.length}`,
      fraction: 0.1 + 0.7 * ((i + 1) / vadSegs.length)
    })
  }
  vad.free()

  // 说话人分离。
  post({ type: 'progress', phase: '说话人分离', fraction: 0.85 })
  const sd = buildDiarization(job)
  const sdSegs = sd.process(wave.samples) as { start: number; end: number; speaker: number }[]
  sd.free()

  // 按时间重叠把转写段分配给说话人。
  const out: OutputSegment[] = []
  for (const r of recognized) {
    const startMs = r.start
    const endMs = r.start + 1000
    let best = -1
    let bestOverlap = 0
    for (const s of sdSegs) {
      const sStart = s.start * 1000
      const sEnd = s.end * 1000
      const overlap = Math.min(endMs, sEnd) - Math.max(startMs, sStart)
      if (overlap > bestOverlap) {
        bestOverlap = overlap
        best = s.speaker
      }
    }
    out.push({
      speaker: best,
      startMs,
      endMs,
      text: r.text
    })
  }

  rmSync(wavPath, { recursive: true, force: true })
  return out
}

// @ts-ignore
process.parentPort?.on('message', async (e: { data: unknown }) => {
  const msg = e.data as { type: string; job?: TranscribeJob }
  if (msg.type !== 'transcribe' || !msg.job) return
  try {
    const result = runTranscribe(msg.job)
    post({ type: 'result', segments: result })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
})
