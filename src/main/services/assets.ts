import { app, BrowserWindow, net } from 'electron'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { is } from '@electron-toolkit/utils'
import type { AssetStatus } from '../../shared/types'
import { prepareTranscriber } from './stt'

const REPO = 'DigitalPineapple/ftc-judge-prep'
const audioUrl = (season: string): string => `https://github.com/${REPO}/releases/download/audio-${season}/audio-${season}.zip`

export const dataDir = (): string => (is.dev ? join(app.getAppPath(), 'data') : join(process.resourcesPath, 'data'))
const userAudioDir = (season: string): string => join(app.getPath('userData'), 'audio', season)
const hasAudio = (dir: string): boolean => existsSync(dir) && readdirSync(dir).some((f) => f.startsWith('manifest.'))

// A downloaded pack wins; the data folder is the fallback for dev builds that still have generated audio.
export function audioDir(season: string): string {
  const downloaded = userAudioDir(season)
  return hasAudio(downloaded) ? downloaded : join(dataDir(), 'audio', season)
}

export function assetStatus(season: string): AssetStatus {
  return {
    audio: hasAudio(audioDir(season)),
    speechModel: existsSync(join(app.getPath('userData'), 'models', 'Xenova', 'whisper-base.en', 'onnx', 'decoder_model_merged_quantized.onnx'))
  }
}

function progress(asset: 'audio' | 'speechModel', pct: number | null): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('assets:progress', { asset, pct })
}

export async function downloadAudio(season: string): Promise<void> {
  const res = await net.fetch(audioUrl(season))
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}). Check your internet connection and try again.`)
  const total = Number(res.headers.get('content-length')) || 0
  const chunks: Uint8Array[] = []
  let got = 0
  progress('audio', 0)
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    got += value.byteLength
    if (total) progress('audio', Math.round((got / total) * 95))
  }
  const zip = new Uint8Array(got)
  let off = 0
  for (const c of chunks) {
    zip.set(c, off)
    off += c.byteLength
  }

  const files = unzipSync(zip, { filter: (f) => /^(manifest\.[\w-]+\.json|[a-f0-9]{16}\.mp3)$/.test(f.name) })
  if (!Object.keys(files).some((n) => n.startsWith('manifest.'))) throw new Error('The audio pack is not valid.')

  // Extract beside the final folder and swap in, so a failed download never leaves a half-installed pack.
  const final = userAudioDir(season)
  const tmp = `${final}.tmp`
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
  for (const [name, bytes] of Object.entries(files)) writeFileSync(join(tmp, name), bytes)
  rmSync(final, { recursive: true, force: true })
  renameSync(tmp, final)
  progress('audio', 100)
}

export async function downloadSpeechModel(): Promise<void> {
  progress('speechModel', 0)
  await prepareTranscriber((pct) => progress('speechModel', pct))
  progress('speechModel', 100)
}
