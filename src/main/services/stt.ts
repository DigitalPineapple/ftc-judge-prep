import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

// Local speech-to-text: Whisper (ONNX) via transformers.js. The model downloads on first use, then runs offline.
const MODEL = 'Xenova/whisper-base.en'

type Transcriber = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string }>
let loading: Promise<Transcriber> | null = null

function notify(msg: { status: string; progress?: number }): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('stt:status', msg)
}

function getTranscriber(onProgress?: (pct: number) => void): Promise<Transcriber> {
  loading ??= (async () => {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.cacheDir = join(app.getPath('userData'), 'models')
    const seen = new Map<string, number>()
    const pipe = await pipeline('automatic-speech-recognition', MODEL, {
      dtype: 'q8',
      progress_callback: (p: { status: string; file?: string; progress?: number }) => {
        if (p.status === 'progress' && p.file && typeof p.progress === 'number') {
          seen.set(p.file, p.progress)
          const avg = [...seen.values()].reduce((a, b) => a + b, 0) / seen.size
          notify({ status: 'downloading', progress: avg })
          onProgress?.(Math.round(avg))
        }
      }
    })
    notify({ status: 'ready' })
    return pipe as unknown as Transcriber
  })().catch((e) => {
    loading = null
    throw e
  })
  return loading
}

// `samples` must be mono 16 kHz float PCM.
export async function transcribe(samples: Float32Array): Promise<string> {
  const t = await getTranscriber()
  notify({ status: 'transcribing' })
  const out = await t(samples, { chunk_length_s: 30, stride_length_s: 5 })
  notify({ status: 'ready' })
  return out.text.trim()
}

export async function prepareTranscriber(onProgress: (pct: number) => void): Promise<void> {
  await getTranscriber(onProgress)
}
