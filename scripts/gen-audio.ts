import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { audioKey } from '../src/shared/audio-key'
import type { Persona, QuestionBank } from '../src/shared/types'

// Pre-generates mp3 for every bank question/follow-up, once per judge persona (data/personas.json).
// Azure Speech: SPEECH_ENDPOINT (e.g. https://<your-resource>.cognitiveservices.azure.com)
// Auth: SPEECH_KEY, or leave unset to use `az account get-access-token` (needs the Speech User role).
// Usage: npm run gen-audio [season] [personaId...]

const season = process.argv[2] ?? '2026-27'
const only = process.argv.slice(3)
const endpoint = (process.env.SPEECH_ENDPOINT ?? '').replace(/\/$/, '')
if (!endpoint) {
  console.error('Set SPEECH_ENDPOINT')
  process.exit(1)
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function authHeaders(): Record<string, string> {
  if (process.env.SPEECH_KEY) return { 'Ocp-Apim-Subscription-Key': process.env.SPEECH_KEY }
  const token = execSync('az account get-access-token --resource https://cognitiveservices.azure.com --query accessToken -o tsv')
    .toString()
    .trim()
  return { Authorization: `Bearer ${token}` }
}

async function synth(p: Persona, text: string, headers: Record<string, string>): Promise<Buffer> {
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${p.locale}"><voice name="${p.voice}">${p.voice.startsWith('en-') ? esc(text) : `<lang xml:lang="en-US">${esc(text)}</lang>`}</voice></speak>`
  const res = await fetch(`${endpoint}/tts/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-160kbitrate-mono-mp3'
    },
    body: ssml
  })
  if (!res.ok) throw new Error(`TTS failed for ${p.voice} (${res.status}): ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
}

async function main(): Promise<void> {
  const root = process.cwd()
  const bank: QuestionBank = JSON.parse(readFileSync(join(root, 'data/bank', season, 'questions.json'), 'utf8'))
  const personas: Persona[] = JSON.parse(readFileSync(join(root, 'data/personas.json'), 'utf8')).personas
  const outDir = join(root, 'data/audio', season)
  mkdirSync(outDir, { recursive: true })

  const texts = new Set<string>()
  for (const q of bank.questions) {
    texts.add(q.text)
    q.followups?.forEach((f) => texts.add(f.text))
  }

  const headers = authHeaders()
  for (const p of personas.filter((x) => only.length === 0 || only.includes(x.id))) {
    const manifest: Record<string, string> = {}
    let created = 0
    for (const text of texts) {
      const file = `${audioKey(text, p.voice, 'azure-speech')}.mp3`
      manifest[text] = file
      if (existsSync(join(outDir, file))) continue
      writeFileSync(join(outDir, file), await synth(p, text, headers))
      created++
    }
    writeFileSync(join(outDir, `manifest.${p.id}.json`), JSON.stringify({ persona: p.id, voice: p.voice, files: manifest }, null, 2))
    console.log(`${p.id}: ${texts.size} lines (${created} new, ${texts.size - created} cached)`)
  }
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
