import { useEffect, useRef, useState } from 'react'
import { INTERVIEW_LIMIT_SEC, MODE_TOPICS } from '../../shared/types'
import type { BankPayload, InteractionMode, InterviewMode, InterviewReport, Persona, TranscriptTurn } from '../../shared/types'
import { ReportCard } from './Feedback'
import { playUrl, speakWithSystemVoice, toWhisperSamples } from './audio'

const TOPIC_NAMES: Record<string, string> = {
  control: 'Control',
  design: 'Design',
  innovate: 'Innovate',
  connect: 'Connect',
  reach: 'Reach',
  sustain: 'Sustain'
}

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]
const fmt = (s: number): string => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

type Phase = 'setup' | 'running' | 'done'
type Step = 'thinking' | 'judge' | 'answering' | 'transcribing'

export function InterviewView({ bank, interaction }: { bank: BankPayload; interaction: InteractionMode }): React.JSX.Element {
  const [mode, setMode] = useState<InterviewMode>({ kind: 'full' })
  const [withVideo, setWithVideo] = useState(false) // opt-in every time
  const [phase, setPhase] = useState<Phase>('setup')
  const [step, setStep] = useState<Step>('thinking')
  const [elapsed, setElapsed] = useState(0)
  const [question, setQuestion] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [turns, setTurns] = useState<TranscriptTurn[]>([])
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [report, setReport] = useState<InterviewReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')
  const [sessionMode, setSessionMode] = useState<InteractionMode>(interaction) // fixed for the whole session

  const limit = mode.kind === 'full' ? INTERVIEW_LIMIT_SEC.full : INTERVIEW_LIMIT_SEC.topic
  const stream = useRef<MediaStream | null>(null)
  const videoRec = useRef<MediaRecorder | null>(null)
  const videoChunks = useRef<Blob[]>([])
  const player = useRef<HTMLAudioElement | null>(null)
  const preview = useRef<HTMLVideoElement | null>(null)
  const timer = useRef<number | null>(null)
  const aborted = useRef(false)
  const answerDone = useRef<(() => void) | null>(null)
  const savedId = useRef<string | null>(null)

  useEffect(
    () => () => {
      aborted.current = true
      cleanup()
    },
    []
  )

  const cleanup = (): void => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    if (timer.current) window.clearInterval(timer.current)
    player.current?.pause()
    speechSynthesis.cancel()
  }

  const speak = async (text: string, persona: Persona): Promise<void> => {
    const file = bank.audio[persona.id]?.[text]
    if (file) return playUrl(`ftc-audio://${file}`, player)
    const bytes = await window.api.speak(text, persona.id)
    if (bytes) {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'audio/mpeg' }))
      await playUrl(url, player)
      URL.revokeObjectURL(url)
    } else {
      await speakWithSystemVoice(text)
    }
  }

  const recordAnswer = async (): Promise<string> => {
    const s = stream.current
    if (!s) return ''
    const chunks: Blob[] = []
    const rec = new MediaRecorder(new MediaStream(s.getAudioTracks()))
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.start()
    setStep('answering')
    await new Promise<void>((resolve) => (answerDone.current = resolve))
    await new Promise<void>((resolve) => ((rec.onstop = () => resolve()), rec.stop()))
    if (aborted.current) return ''
    setStep('transcribing')
    return window.api.transcribe(await toWhisperSamples(new Blob(chunks, { type: rec.mimeType })))
  }

  const begin = async (): Promise<void> => {
    setError('')
    try {
      if (!(await window.api.requestMedia('microphone'))) throw new Error('Microphone access was denied. Enable it in system settings.')
      if (withVideo && !(await window.api.requestMedia('camera'))) throw new Error('Camera access was denied. Enable it in system settings.')
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo })
    } catch (e) {
      setError((e as Error).message)
      return
    }

    aborted.current = false
    const audioMode = interaction === 'audio'
    setSessionMode(interaction)
    const persona = audioMode ? pick(bank.personas) : undefined
    const all: TranscriptTurn[] = []
    const startedAt = Date.now()
    const secs = (): number => Math.floor((Date.now() - startedAt) / 1000)
    setTurns([])
    setReport(null)
    setReportError('')
    setElapsed(0)
    setVideoUrl(null)
    setPhase('running')
    timer.current = window.setInterval(() => setElapsed(secs()), 1000)

    videoRec.current = null
    if (withVideo && stream.current) {
      videoChunks.current = []
      const v = new MediaRecorder(stream.current)
      v.ondataavailable = (e) => e.data.size && videoChunks.current.push(e.data)
      v.start()
      videoRec.current = v
      requestAnimationFrame(() => preview.current && (preview.current.srcObject = new MediaStream(stream.current!.getVideoTracks())))
    }

    try {
      while (!aborted.current) {
        setStep('thinking')
        const next = await window.api.nextAction({ mode, elapsedSec: secs(), limitSec: limit, turns: all, dynamic: !audioMode })
        if (next.action === 'end' || aborted.current) break
        all.push({
          role: 'judge',
          text: next.text,
          questionId: next.action === 'bank' ? next.questionId : undefined,
          followup: next.action === 'followup'
        })
        setTurns([...all])
        setQuestion(next.text)
        setRevealed(!audioMode)
        if (persona) {
          setStep('judge')
          await speak(next.text, persona)
        }
        if (aborted.current) break
        const answer = await recordAnswer()
        if (aborted.current) break
        all.push({ role: 'student', text: answer || '(no answer)' })
        setTurns([...all])
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      const v = videoRec.current
      let videoBytes: Uint8Array | undefined
      if (v && v.state !== 'inactive') {
        await new Promise<void>((resolve) => ((v.onstop = () => resolve()), v.stop()))
        const blob = new Blob(videoChunks.current, { type: v.mimeType })
        setVideoUrl(URL.createObjectURL(blob))
        videoBytes = new Uint8Array(await blob.arrayBuffer())
      }
      cleanup()
      setPhase('done')
      if (all.some((t) => t.role === 'student' && t.text !== '(no answer)')) {
        savedId.current = null
        try {
          const rec = await window.api.saveSession(
            { startedAt: new Date(startedAt).toISOString(), mode, interaction, durationSec: Math.min(secs(), limit + 60), turns: all, report: null },
            videoBytes
          )
          savedId.current = rec.id
        } catch {
          // History is best-effort; the report still shows.
        }
        void loadReport(all, mode)
      }
    }
  }

  const loadReport = async (t: TranscriptTurn[], m: InterviewMode): Promise<void> => {
    setReport(null)
    setReportError('')
    setReportLoading(true)
    try {
      const r = await window.api.interviewReport(m, t)
      setReport(r)
      if (savedId.current) void window.api.setSessionReport(savedId.current, r)
    } catch (e) {
      setReportError((e as Error).message)
    } finally {
      setReportLoading(false)
    }
  }

  const endNow = (): void => {
    aborted.current = true
    player.current?.pause()
    speechSynthesis.cancel()
    answerDone.current?.()
  }

  if (phase === 'setup') {
    const label = mode.kind === 'full' ? 'Full interview · 5 min' : `${TOPIC_NAMES[mode.topic]} pit interview · 3 min`
    return (
      <>
        <div className="tabs">
          <button className={`pill${mode.kind === 'full' ? ' active' : ''}`} onClick={() => setMode({ kind: 'full' })}>
            Full interview
          </button>
          {MODE_TOPICS.map((t) => (
            <button key={t} className={`pill${mode.kind === 'topic' && mode.topic === t ? ' active' : ''}`} onClick={() => setMode({ kind: 'topic', topic: t })}>
              {TOPIC_NAMES[t]} pit
            </button>
          ))}
        </div>
        <div className="card hero">
          <h2 style={{ margin: '0 0 8px', fontSize: 26 }}>{label}</h2>
          <p>
            {interaction === 'audio'
              ? 'The judge asks bank questions out loud. Answer out loud and click "Done answering" after each answer. The interview ends when time is up.'
              : 'Questions appear as text. Answer out loud and click "Done answering". The judge can ask AI follow-ups based on your answers and the rubric. The interview ends when time is up.'}
          </p>
          <label className="check" style={{ justifyContent: 'center', margin: '0 0 20px' }}>
            <input type="checkbox" checked={withVideo} onChange={(e) => setWithVideo(e.target.checked)} />
            Record video (stays on this computer)
          </label>
          <div>
            <button className="btn primary" onClick={begin} disabled={interaction === 'audio' && bank.personas.length === 0}>
              Start interview
            </button>
          </div>
        </div>
        {error && <div className="error">{error}</div>}
      </>
    )
  }

  if (phase === 'done') {
    return (
      <>
        <div className="card">
          <h3>Interview finished · {fmt(elapsed)}</h3>
          {error && <div className="error">{error}</div>}
          {videoUrl && <video src={videoUrl} controls style={{ maxWidth: 480, marginBottom: 12 }} />}
        </div>
        {reportLoading && <div className="card"><p className="status">Preparing your feedback…</p></div>}
        {reportError && (
          <div className="error">
            Couldn&apos;t generate feedback: {reportError}{' '}
            <button className="btn" onClick={() => loadReport(turns, mode)}>Try again</button>
          </div>
        )}
        {report && <ReportCard report={report} />}
        <div className="card">
          <h3>Transcript</h3>
          {turns.map((t, i) => (
            <p key={i} className={t.role === 'judge' ? 'turn judge' : 'turn'}>
              <strong>{t.role === 'judge' ? 'Judge' : 'You'}:</strong> {t.text}
            </p>
          ))}
        </div>
        <button className="btn primary" onClick={() => setPhase('setup')}>
          New interview
        </button>
      </>
    )
  }

  const left = Math.max(0, limit - elapsed)
  const status: Record<Step, string> = {
    thinking: 'Judge is thinking…',
    judge: 'Judge is speaking…',
    answering: left === 0 ? "Time's up. Finish your answer." : 'Your turn. Answer out loud.',
    transcribing: 'Transcribing…'
  }

  return (
    <>
      <div className="card question">
        <div className="actions" style={{ marginBottom: 16 }}>
          <span className="chip">{mode.kind === 'full' ? 'Full interview' : `${TOPIC_NAMES[mode.topic]} pit`}</span>
          <span className="spacer" />
          <strong style={{ fontSize: 20 }}>{fmt(left)}</strong>
        </div>
        <div className="reveal" onClick={() => setRevealed(true)} style={{ cursor: revealed ? undefined : 'pointer', minHeight: 70 }}>
          {question && <h2 key={question} className={revealed ? '' : 'blurred'}>{question}</h2>}
          {question && sessionMode === 'audio' && !revealed && <span className="reveal-hint">Click the question to reveal the text.</span>}
        </div>
        <p className="status">{status[step]}</p>
        <div className="actions">
          {step === 'answering' && (
            <button className="btn record live" onClick={() => answerDone.current?.()}>
              ■ Done answering
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={endNow}>
            End interview
          </button>
        </div>
      </div>
      <video ref={preview} autoPlay muted style={{ display: withVideo ? 'block' : 'none', maxWidth: 240 }} />
      {error && <div className="error">{error}</div>}
    </>
  )
}
