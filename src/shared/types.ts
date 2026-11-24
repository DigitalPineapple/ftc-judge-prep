export type Topic =
  | 'think'
  | 'connect'
  | 'reach'
  | 'sustain'
  | 'innovate'
  | 'control'
  | 'design'
  | 'judges_choice'

// Topics offered as stand-alone pit-interview modes; think and judges_choice only feed the full interview.
export const MODE_TOPICS: Topic[] = ['control', 'design', 'innovate', 'connect', 'reach', 'sustain']

export interface BankItem {
  text: string
  sourceText?: string
}

export interface BankQuestion extends BankItem {
  id: string
  topic: Topic
  followups?: BankItem[]
  notForInitialInterview?: boolean
  audience?: 'new_team' | 'experienced_team'
  note?: string
}

export interface QuestionBank {
  season: string
  revision: string
  guardrails: string[]
  questions: BankQuestion[]
}

export type RequiredLevel = 'not_observed' | 'observed'
export type EncouragedLevel = 'n/a' | 'developing' | 'solid' | 'exemplary'

export interface RubricCriterion {
  id: string
  kind: 'required' | 'encouraged'
  text: string
  evaluatedInInitialInterview?: boolean
}

export interface RubricAward {
  name: string
  group: string
  note?: string
  criteria: RubricCriterion[]
}

export interface Rubric {
  season: string
  revision: string
  scales: {
    required: { levels: RequiredLevel[]; definitions: Record<string, string> }
    encouraged: { levels: EncouragedLevel[]; definitions: Record<string, string> }
    tieBreak: string
  }
  awards: Record<string, RubricAward>
}

export interface Persona {
  id: string
  label: string
  locale: string
  voice: string
}

export type BankPayload = QuestionBank & {
  personas: Persona[]
  // personaId -> question text -> mp3 file
  audio: Record<string, Record<string, string>>
}
export type RubricPayload = Rubric & { source: 'bundled' | 'imported' }

export interface Settings {
  provider: 'azure' | 'openai'
  endpoint: string // Azure OpenAI / Foundry resource endpoint (unused for openai)
  interviewModel: string // Azure deployment name, or OpenAI model id
  feedbackModel: string
  speechEndpoint: string // Azure Speech endpoint for on-the-fly voice; falls back to `endpoint`
  hasApiKey: boolean
  hasSpeechKey: boolean
}

export interface SettingsInput extends Omit<Settings, 'hasApiKey' | 'hasSpeechKey'> {
  apiKey?: string // omitted/empty = keep the stored key
  speechKey?: string
}

export type InterviewMode = { kind: 'full' } | { kind: 'topic'; topic: Topic }

export interface TranscriptTurn {
  role: 'judge' | 'student'
  text: string
  questionId?: string
  followup?: boolean
}

export interface NextRequest {
  mode: InterviewMode
  elapsedSec: number
  limitSec: number
  turns: TranscriptTurn[]
  // Text mode: the judge may ask free-form follow-ups. Audio mode: only bank questions/follow-ups (they have recorded audio).
  dynamic: boolean
}

export type InteractionMode = 'audio' | 'text'

export interface FollowupRequest {
  questionId: string
  exchanges: { question: string; answer: string }[]
}

export type NextAction =
  | { action: 'bank'; questionId: string; text: string }
  | { action: 'followup'; text: string }
  | { action: 'end' }

export const INTERVIEW_LIMIT_SEC = { full: 300, topic: 180 }

export type CriterionLevel = 'observed' | 'not_observed' | 'developing' | 'solid' | 'exemplary' | 'not_addressed'

export interface AnswerFeedback {
  strengths: string[]
  missing: string[]
  tip: string
  strongerAnswer: string
  criteria: { id: string; text: string; level: CriterionLevel; evidence: string }[]
}

export interface InterviewReport {
  summary: string
  strengths: string[]
  improvements: string[]
  practiceNext: string[]
  criteria: AnswerFeedback['criteria']
}

export interface SessionRecord {
  id: string
  startedAt: string
  mode: InterviewMode
  interaction: InteractionMode
  durationSec: number
  turns: TranscriptTurn[]
  report: InterviewReport | null
  hasVideo: boolean
}

export interface AssetStatus {
  audio: boolean
  speechModel: boolean
}
