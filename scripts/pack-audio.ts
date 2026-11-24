// Builds dist/audio-<season>.zip from data/audio/<season>, the asset students download in the app.
// Publish with: gh release create audio-<season> dist/audio-<season>.zip
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { zipSync } from 'fflate'

const season = process.argv[2] ?? '2026-27'
const dir = join('data', 'audio', season)
const files: Record<string, [Uint8Array, { level: 0 }]> = {}
for (const f of readdirSync(dir)) if (/^(manifest\.[\w-]+\.json|[a-f0-9]{16}\.mp3)$/.test(f)) files[f] = [readFileSync(join(dir, f)), { level: 0 }]
mkdirSync('dist', { recursive: true })
const out = join('dist', `audio-${season}.zip`)
writeFileSync(out, zipSync(files))
console.log(`${Object.keys(files).length} files -> ${out}`)
