import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pdf from 'pdf-parse/lib/pdf-parse.js'

interface Item {
  text: string
  sourceText?: string
}
interface Question extends Item {
  id: string
  followups?: Item[]
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

async function main(): Promise<void> {
  const season = process.argv[2] ?? '2026-27'
  const root = process.cwd()
  const bank = JSON.parse(readFileSync(join(root, 'data/bank', season, 'questions.json'), 'utf8'))
  const pdfText = norm((await pdf(readFileSync(join(root, 'data/sources', season, 'question-bank.pdf')))).text)

  const errors: string[] = []
  const ids = new Set<string>()
  for (const q of bank.questions as Question[]) {
    if (ids.has(q.id)) errors.push(`duplicate id ${q.id}`)
    ids.add(q.id)
    for (const it of [q, ...(q.followups ?? [])]) {
      const needle = norm(it.sourceText ?? it.text)
      if (!pdfText.includes(needle)) errors.push(`${q.id}: not found in PDF: "${it.sourceText ?? it.text}"`)
    }
  }
  if (errors.length) {
    console.error(errors.join('\n'))
    process.exit(1)
  }
  console.log(`OK: ${bank.questions.length} questions verified against the ${season} PDF`)
}

main()
