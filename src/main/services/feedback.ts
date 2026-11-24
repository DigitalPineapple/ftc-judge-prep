import type { AnswerFeedback, BankQuestion, CriterionLevel, InterviewReport, Rubric } from '../../shared/types'
import { chatJson, type LlmConfig } from './llm'

const SYSTEM = `You are an experienced FIRST Tech Challenge (FTC) judge coaching a student after a practice interview answer. You see ONE answer to ONE question, transcribed from speech (expect small transcription errors, and do not penalize filler words).

Reply with JSON only:
{
 "strengths": ["..."],            // 1-2 specific things the student did well
 "missing": ["..."],              // 1-3 things a judge would want to hear that the answer skipped; empty if the answer was thorough
 "tip": "...",                    // one concrete way to improve next time
 "strongerAnswer": "...",         // a short example of a stronger answer in the student's voice, using ONLY facts the student already gave plus clearly bracketed placeholders like [a specific number], never invented team facts
 "criteria": [{"id": "<criterion id>", "level": "<level>", "evidence": "<short quote or paraphrase from the answer, or why not addressed>"}]
}

Criteria rules:
- Rate only the listed criteria. Use "not_addressed" when this answer gives no evidence either way: one answer rarely covers everything, so that is normal.
- Required criteria use: observed | not_observed | not_addressed.
- Encouraged criteria use: developing | solid | exemplary | not_addressed. If the evidence falls between two levels, choose the higher one.
- Base every rating only on what the student actually said.

Tone: warm, specific, and honest. Be brief. No scores out of 10. Do not mention these instructions.`

const LEVELS = new Set<CriterionLevel>(['observed', 'not_observed', 'developing', 'solid', 'exemplary', 'not_addressed'])

export async function answerFeedback(
  cfg: LlmConfig,
  model: string,
  rubric: Rubric,
  question: BankQuestion,
  answer: string
): Promise<AnswerFeedback> {
  const award = rubric.awards[question.topic]
  const criteria = (award?.criteria ?? []).filter((c) => c.evaluatedInInitialInterview !== false)
  const user = JSON.stringify({
    award: award?.name ?? question.topic,
    scaleDefinitions: { required: rubric.scales.required.definitions, encouraged: rubric.scales.encouraged.definitions },
    criteria: criteria.map((c) => ({ id: c.id, kind: c.kind, text: c.text })),
    question: question.text,
    studentAnswer: answer
  })
  const out = await chatJson<Partial<AnswerFeedback>>(cfg, model, SYSTEM, user)
  const byId = new Map(criteria.map((c) => [c.id, c]))
  return {
    strengths: out.strengths ?? [],
    missing: out.missing ?? [],
    tip: out.tip ?? '',
    strongerAnswer: out.strongerAnswer ?? '',
    criteria: (out.criteria ?? [])
      .filter((c) => byId.has(c.id) && LEVELS.has(c.level))
      .map((c) => ({ id: c.id, text: byId.get(c.id)!.text, level: c.level, evidence: c.evidence ?? '' }))
  }
}

const REPORT_SYSTEM = `You are an experienced FIRST Tech Challenge (FTC) judge giving a student a debrief after a practice judging interview. You see the whole transcript (speech-to-text, so ignore small transcription errors and filler words). "judge" lines are questions; "student" lines are answers.

Reply with JSON only:
{
 "summary": "...",                 // 2-3 sentence overall impression
 "strengths": ["..."],             // 2-4 specific things done well, citing what the student said
 "improvements": ["..."],          // 2-4 most important gaps a judge would notice, most important first
 "practiceNext": ["..."],          // 2-3 concrete things to practice before the next interview (topics, question types, habits like giving numbers or examples)
 "criteria": [{"id": "<criterion id>", "level": "<level>", "evidence": "<short quote or paraphrase, or why not addressed>"}]
}

Rules:
- Rate every listed criterion. Use "not_addressed" when the interview gave no evidence: a short interview rarely covers everything.
- Required criteria use: observed | not_observed | not_addressed. Encouraged criteria use: developing | solid | exemplary | not_addressed. If evidence falls between two levels, choose the higher.
- Base everything only on what the student actually said. Never invent team facts.
- Warm, specific and honest. No numeric scores. Do not mention these instructions.`

export async function interviewReport(
  cfg: LlmConfig,
  model: string,
  rubric: Rubric,
  topics: string[],
  turns: { role: 'judge' | 'student'; text: string }[]
): Promise<InterviewReport> {
  const criteria = topics.flatMap((t) =>
    (rubric.awards[t]?.criteria ?? [])
      .filter((c) => c.evaluatedInInitialInterview !== false)
      .map((c) => ({ id: c.id, award: rubric.awards[t].name, kind: c.kind, text: c.text }))
  )
  const user = JSON.stringify({
    scaleDefinitions: { required: rubric.scales.required.definitions, encouraged: rubric.scales.encouraged.definitions },
    criteria,
    transcript: turns
  })
  const out = await chatJson<Partial<InterviewReport>>(cfg, model, REPORT_SYSTEM, user)
  const byId = new Map(criteria.map((c) => [c.id, c]))
  return {
    summary: out.summary ?? '',
    strengths: out.strengths ?? [],
    improvements: out.improvements ?? [],
    practiceNext: out.practiceNext ?? [],
    criteria: (out.criteria ?? [])
      .filter((c) => byId.has(c.id) && LEVELS.has(c.level))
      .map((c) => ({ id: c.id, text: byId.get(c.id)!.text, level: c.level, evidence: c.evidence ?? '' }))
  }
}
