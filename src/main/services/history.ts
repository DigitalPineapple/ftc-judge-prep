import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { InterviewReport, SessionRecord } from '../../shared/types'

const dir = (): string => {
  const d = join(app.getPath('userData'), 'sessions')
  mkdirSync(d, { recursive: true })
  return d
}
const jsonPath = (id: string): string => join(dir(), `${id}.json`)
const videoPath = (id: string): string => join(dir(), `${id}.webm`)
const safeId = (id: string): string => {
  if (!/^[\w-]+$/.test(id)) throw new Error('Invalid session id')
  return id
}

export function saveSession(rec: Omit<SessionRecord, 'id' | 'hasVideo'>, video?: Uint8Array): SessionRecord {
  const id = `${rec.startedAt.replace(/[^\d]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`
  const full: SessionRecord = { ...rec, id, hasVideo: !!video && video.byteLength > 0 }
  if (full.hasVideo) writeFileSync(videoPath(id), video!)
  writeFileSync(jsonPath(id), JSON.stringify(full, null, 2))
  return full
}

export function setSessionReport(id: string, report: InterviewReport): void {
  const rec = getSession(id)
  if (rec) writeFileSync(jsonPath(safeId(id)), JSON.stringify({ ...rec, report }, null, 2))
}

export function getSession(id: string): SessionRecord | null {
  const p = jsonPath(safeId(id))
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as SessionRecord) : null
}

export function listSessions(): SessionRecord[] {
  return readdirSync(dir())
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir(), f), 'utf8')) as SessionRecord
      } catch {
        return null
      }
    })
    .filter((r): r is SessionRecord => !!r)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function sessionVideo(id: string): Uint8Array | null {
  const p = videoPath(safeId(id))
  return existsSync(p) ? readFileSync(p) : null
}

export function deleteSession(id: string): void {
  rmSync(jsonPath(safeId(id)), { force: true })
  rmSync(videoPath(id), { force: true })
}
