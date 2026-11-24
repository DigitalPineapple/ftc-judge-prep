import type { BankQuestion, FollowupRequest, NextAction, NextRequest, QuestionBank, Rubric, RubricCriterion } from '../../shared/types'
import { chatJson, type LlmConfig } from './llm'

const MAX_FOLLOWUPS_PER_QUESTION = 2

const SYSTEM = (guardrails: string[], dynamic: boolean): string => `You are a FIRST Tech Challenge (FTC) judge running a practice judging interview with a student team. You decide the next thing the judge says.

Reply with JSON only, in exactly one of these shapes:
{"action":"bank","questionId":"<id from the candidate list>"}
{"action":"followup","text":"<one short spoken follow-up question>"}
{"action":"end"}

Rules:
- Ask a follow-up when the student's last answer was vague, mentioned something interesting worth exploring, or skipped part of the question. Otherwise move to a new bank question.
${
  dynamic
    ? `- A follow-up must be a single short sentence, based on what the student actually said, and must not repeat an earlier question. Prefer probing a rubric criterion the answer has not yet shown evidence for (see rubricCriteria). When a suggested follow-up from the bank fits, use its exact text.`
    : `- A follow-up MUST be copied exactly, word for word, from suggestedFollowupsForLastQuestion. If none fits, choose a new bank question instead. Never invent a follow-up.`
}
- Never ask more than ${MAX_FOLLOWUPS_PER_QUESTION} follow-ups in a row about the same question.
- In a full interview, spread questions across different topics and avoid asking two questions of the same topic in a row.
- Be a neutral, friendly judge. Do not praise, score, or give advice during the interview.
- Never ask about: ${guardrails.join('; ')}.
- Choose "end" only if no candidate questions remain.`

const interviewCriteria = (rubric: Rubric, topic?: string): Pick<RubricCriterion, 'id' | 'kind' | 'text'>[] =>
  (topic ? rubric.awards[topic]?.criteria ?? [] : [])
    .filter((c) => c.evaluatedInInitialInterview !== false)
    .map(({ id, kind, text }) => ({ id, kind, text }))

function eligible(bank: QuestionBank, req: NextRequest): BankQuestion[] {
  const asked = new Set(req.turns.filter((t) => t.role === 'judge' && t.questionId && !t.followup).map((t) => t.questionId))
  return bank.questions.filter((q) => {
    if (asked.has(q.id)) return false
    if (req.mode.kind === 'topic') return q.topic === req.mode.topic
    return !q.notForInitialInterview
  })
}

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]

function consecutiveFollowups(req: NextRequest): number {
  let n = 0
  for (let i = req.turns.length - 1; i >= 0; i--) {
    const t = req.turns[i]
    if (t.role === 'student') continue
    if (!t.followup) break
    n++
  }
  return n
}

export async function nextAction(cfg: LlmConfig, model: string, bank: QuestionBank, rubric: Rubric, req: NextRequest): Promise<NextAction> {
  if (req.elapsedSec >= req.limitSec) return { action: 'end' }
  const pool = eligible(bank, req)
  const firstTurn = req.turns.length === 0
  const toBank = (q: BankQuestion): NextAction => ({ action: 'bank', questionId: q.id, text: q.text })
  if (firstTurn) return pool.length ? toBank(pick(pool)) : { action: 'end' }
  if (pool.length === 0) return { action: 'end' }

  const lastBank = [...req.turns].reverse().find((t) => t.role === 'judge' && !t.followup)
  const lastQuestion = bank.questions.find((q) => q.id === lastBank?.questionId)
  const mustMoveOn = consecutiveFollowups(req) >= MAX_FOLLOWUPS_PER_QUESTION

  const topicCounts: Record<string, number> = {}
  for (const t of req.turns) {
    const q = t.role === 'judge' && !t.followup ? bank.questions.find((x) => x.id === t.questionId) : undefined
    if (q) topicCounts[q.topic] = (topicCounts[q.topic] ?? 0) + 1
  }

  const askedFollowups = new Set(req.turns.filter((t) => t.role === 'judge' && t.followup).map((t) => t.text.trim().toLowerCase()))
  const suggested = (lastQuestion?.followups ?? []).map((f) => f.text).filter((t) => !askedFollowups.has(t.trim().toLowerCase()))

  const user = JSON.stringify({
    mode: req.mode,
    secondsLeft: Math.max(0, req.limitSec - req.elapsedSec),
    mustAskNewBankQuestion: mustMoveOn,
    questionsAskedPerTopic: topicCounts,
    suggestedFollowupsForLastQuestion: suggested,
    ...(req.dynamic ? { rubricCriteria: interviewCriteria(rubric, lastQuestion?.topic) } : {}),
    conversationSoFar: req.turns.map((t) => `${t.role === 'judge' ? 'JUDGE' : 'STUDENT'}: ${t.text}`),
    candidateQuestions: pool.map((q) => ({ id: q.id, topic: q.topic, text: q.text }))
  })

  try {
    const out = await chatJson<{ action?: string; questionId?: string; text?: string }>(cfg, model, SYSTEM(bank.guardrails, req.dynamic), user)
    const text = out.text?.trim()
    if (out.action === 'followup' && !mustMoveOn && text) {
      if (req.dynamic) return { action: 'followup', text }
      const match = suggested.find((t) => t.trim().toLowerCase() === text.toLowerCase())
      if (match) return { action: 'followup', text: match }
    }
    if (out.action === 'bank') {
      const q = pool.find((x) => x.id === out.questionId)
      if (q) return toBank(q)
    }
  } catch (e) {
    // Config problems must surface; a flaky network call should not kill a session.
    if ((e as Error).message.startsWith('No ')) throw e
    console.error('interview engine fallback:', (e as Error).message)
  }
  return toBank(pick(pool))
}

const MAX_PRACTICE_FOLLOWUPS = 2

const FOLLOWUP_SYSTEM = (guardrails: string[]): string => `You are a FIRST Tech Challenge (FTC) judge in a practice interview. Given the exchange so far, decide whether to ask a follow-up, and if so write it.
Reply with JSON only: {"text":"<the follow-up question>"} or {"text":null} when no follow-up is needed.
- Real judges ask follow-ups sparingly, so default to {"text":null}. Ask one only when the last answer was vague, skipped a key part of the question, or left a specific claim unexplained. If the answer was reasonably clear and detailed, reply {"text":null}.
- The follow-up must refer to something specific the student actually said (or clearly failed to say) about the question asked. Never change the subject, and do not introduce topics the student did not raise. One short sentence. Do not repeat an earlier question. Do not praise, score, or give advice.
- Never ask about: ${guardrails.join('; ')}.`

// Returns null when the judge has nothing more to ask. The cap keeps practice from turning into an interrogation.
export async function practiceFollowup(cfg: LlmConfig, model: string, bank: QuestionBank, rubric: Rubric, req: FollowupRequest): Promise<string | null> {
  if (req.exchanges.length > MAX_PRACTICE_FOLLOWUPS) return null
  const q = bank.questions.find((x) => x.id === req.questionId)
  const user = JSON.stringify({
    award: rubric.awards[q?.topic ?? '']?.name ?? q?.topic,
    rubricCriteria: interviewCriteria(rubric, q?.topic),
    suggestedFollowups: q?.followups?.map((f) => f.text) ?? [],
    exchanges: req.exchanges
  })
  const out = await chatJson<{ text?: string | null }>(cfg, model, FOLLOWUP_SYSTEM(bank.guardrails), user)
  return out.text?.trim() || null
}
