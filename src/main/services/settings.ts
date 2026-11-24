import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings, SettingsInput } from '../../shared/types'

interface Stored extends Omit<Settings, 'hasApiKey' | 'hasSpeechKey'> {
  apiKeyEnc?: string
  speechKeyEnc?: string
}

const DEFAULTS: Stored = {
  provider: 'azure',
  endpoint: '',
  interviewModel: 'gpt-6-luna',
  feedbackModel: 'gpt-6.1-sol',
  speechEndpoint: ''
}

const file = (): string => join(app.getPath('userData'), 'settings.json')

function read(): Stored {
  if (!existsSync(file())) return { ...DEFAULTS }
  const saved = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Stored>
  const merged = { ...DEFAULTS, ...saved }
  for (const k of ['endpoint', 'interviewModel', 'feedbackModel', 'speechEndpoint'] as const) {
    if (!saved[k]?.trim()) merged[k] = DEFAULTS[k]
  }
  return merged
}

function encrypt(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure key storage is not available on this computer')
  return safeStorage.encryptString(plain).toString('base64')
}

const decrypt = (enc?: string): string | undefined => (enc ? safeStorage.decryptString(Buffer.from(enc, 'base64')) : undefined)

export function getSettings(): Settings {
  const { apiKeyEnc, speechKeyEnc, ...rest } = read()
  return { ...rest, hasApiKey: !!apiKeyEnc, hasSpeechKey: !!speechKeyEnc }
}

export function saveSettings(input: SettingsInput): Settings {
  const { apiKey, speechKey, ...rest } = input
  const cur = read()
  const next: Stored = { ...cur, ...rest }
  if (apiKey) next.apiKeyEnc = encrypt(apiKey)
  if (speechKey) next.speechKeyEnc = encrypt(speechKey)
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(file(), JSON.stringify(next, null, 2))
  return getSettings()
}

// Main-process only: the renderer never receives the keys.
export function getSecrets(): { settings: Settings; apiKey?: string; speechKey?: string } {
  const s = read()
  return { settings: getSettings(), apiKey: decrypt(s.apiKeyEnc), speechKey: decrypt(s.speechKeyEnc) }
}
