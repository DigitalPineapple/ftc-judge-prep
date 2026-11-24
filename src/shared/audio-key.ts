import { createHash } from 'node:crypto'

// Same key is used by scripts/gen-audio.ts and the app, so a bank edit only invalidates the changed lines.
export function audioKey(text: string, voice: string, model: string): string {
  return createHash('sha1').update(`${model}|${voice}|${text}`).digest('hex').slice(0, 16)
}
