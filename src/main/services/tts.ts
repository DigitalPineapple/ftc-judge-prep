import type { Persona } from '../../shared/types'

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export interface SpeechConfig {
  endpoint: string
  key?: string
  bearer?: string // dev/test only
}

// On-the-fly voice for follow-ups that are not in the pre-generated bank audio.
export async function synthesize(cfg: SpeechConfig, persona: Persona, text: string): Promise<Uint8Array> {
  if (!cfg.endpoint || (!cfg.key && !cfg.bearer)) throw new Error('Speech is not configured')
  const auth: Record<string, string> = cfg.key ? { 'Ocp-Apim-Subscription-Key': cfg.key } : { Authorization: `Bearer ${cfg.bearer}` }
  const res = await fetch(`${cfg.endpoint.replace(/\/$/, '')}/tts/cognitiveservices/v1`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-160kbitrate-mono-mp3' },
    body: `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${persona.locale}"><voice name="${persona.voice}">${persona.voice.startsWith('en-') ? esc(text) : `<lang xml:lang="en-US">${esc(text)}</lang>`}</voice></speak>`
  })
  if (!res.ok) throw new Error(`Speech failed (${res.status})`)
  return new Uint8Array(await res.arrayBuffer())
}
