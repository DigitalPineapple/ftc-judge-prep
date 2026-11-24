import { app, dialog, net, protocol } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { audioDir, dataDir } from './assets'
import type { BankPayload, Persona, QuestionBank, Rubric } from '../../shared/types'

export const AUDIO_SCHEME = 'ftc-audio'

export function registerAudioScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: AUDIO_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true } }
  ])
}

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T
const userRubricPath = (): string => join(app.getPath('userData'), 'rubric.override.json')

function activeSeason(): string {
  return readJson<{ active: string }>(join(dataDir(), 'rubrics/manifest.json')).active
}

export function loadBank(): BankPayload {
  const season = activeSeason()
  const bank = readJson<QuestionBank>(join(dataDir(), 'bank', season, 'questions.json'))
  const personas = readJson<{ personas: Persona[] }>(join(dataDir(), 'personas.json')).personas
  const audio: BankPayload['audio'] = {}
  for (const p of personas) {
    const manifestPath = join(audioDir(season), `manifest.${p.id}.json`)
    if (existsSync(manifestPath)) audio[p.id] = readJson<{ files: Record<string, string> }>(manifestPath).files
  }
  return { ...bank, personas: personas.filter((p) => audio[p.id]), audio }
}

// A rubric imported from Settings wins over the bundled one, so a new season needs no rebuild.
export function loadRubric(): Rubric & { source: 'bundled' | 'imported' } {
  const override = userRubricPath()
  if (existsSync(override)) return { ...readJson<Rubric>(override), source: 'imported' }
  return { ...readJson<Rubric>(join(dataDir(), 'rubrics', activeSeason(), 'rubric.json')), source: 'bundled' }
}

export async function importRubric(): Promise<Rubric | null> {
  const pick = await dialog.showOpenDialog({ filters: [{ name: 'Rubric JSON', extensions: ['json'] }], properties: ['openFile'] })
  if (pick.canceled || !pick.filePaths[0]) return null
  const candidate = readJson<Rubric>(pick.filePaths[0])
  if (!candidate.season || !candidate.awards || !candidate.scales) throw new Error('Not a valid rubric file')
  mkdirSync(app.getPath('userData'), { recursive: true })
  copyFileSync(pick.filePaths[0], userRubricPath())
  return candidate
}

export function registerAudioProtocol(): void {
  protocol.handle(AUDIO_SCHEME, (request) => {
    const file = new URL(request.url).hostname
    if (!/^[a-f0-9]{16}\.mp3$/.test(file)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(join(audioDir(activeSeason()), file)).toString())
  })
}
