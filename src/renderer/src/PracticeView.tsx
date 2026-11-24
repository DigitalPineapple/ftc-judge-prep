import { useEffect, useRef, useState } from 'react'
import { MODE_TOPICS } from '../../shared/types'
import type { AnswerFeedback, BankPayload, BankQuestion, InteractionMode, Topic } from '../../shared/types'
import { FeedbackCard } from './Feedback'

import { toWhisperSamples } from './audio'

const TOPIC_NAMES: Record<string, string> = {
  any: 'Any topic',
  control: 'Control',
  design: 'Design',
  innovate: 'Innovate',
  connect: 'Connect',
  reach: 'Reach',
  sustain: 'Sustain'
}

const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)]
const MAX_FOLLOWUPS = 2 // matches the cap in the main-process engine

function useStored(key: string, fallback: string): [string, (v: string) => void] {
  const [v, setV] = useState(() => localStorage.getItem(key) ?? fallback)
  return [v, (n) => (setV(n), localStorage.setItem(key, n))]
}

export function PracticeView({ bank, interaction }: { bank: BankPayload; interaction: InteractionMode }): React.JSX.Element {
  const [topic, setTopic] = useStored('practice.topic', 'any')
  const [current, setCurrent] = useState('') // accent is picked at random per question, not user-selectable
  const [revealed, setRevealed] = useState(false)
  const [question, setQuestion] = useState<BankQuestion | null>(null)
  const [followupText, setFollowupText] = useState<string | null>(null) // text mode: AI follow-up replacing the bank question
  const [thread, setThread] = useState<{ question: string; answer: string }[]>([])
  const [fuLoading, setFuLoading] = useState(false)
  const [pendingFollowup, setPendingFollowup] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null)
  const [fbLoading, setFbLoading] = useState(false)
  const [withVideo, setWithVideo] = useState(false) // opt-in every time, never remembered
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)

  const stream = useRef<MediaStream | null>(null)
  const audioRec = useRef<MediaRecorder | null>(null)
  const mediaRec = useRef<MediaRecorder | null>(null)
  const audioChunks = useRef<Blob[]>([])
  const mediaChunks = useRef<Blob[]>([])
  const player = useRef<HTMLAudioElement | null>(null)
  const preview = useRef<HTMLVideoElement | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    const off = window.api.onSttStatus((s) => {
      if (s.status === 'downloading') setStatus(`Downloading speech model… ${Math.round(s.progress ?? 0)}% (first time only)`)
      else if (s.status === 'transcribing') setStatus('Transcribing…')
      else setStatus('')
    })
    return () => {
      off()
      stopStream()
      player.current?.pause()
    }
  }, [])

  const stopStream = (): void => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    if (timer.current) window.clearInterval(timer.current)
  }

  const eligible = bank.questions.filter((q) => (topic === 'any' ? MODE_TOPICS.includes(q.topic) : q.topic === topic))

  const resetAttempt = (): void => {
    if (mediaUrl) URL.revokeObjectURL(mediaUrl)
    setMediaUrl(null)
    setTranscript(null)
    setFeedback(null)
    setFbLoading(false)
    setPendingFollowup(null)
    setError('')
  }

  const ask = (q: BankQuestion): void => {
    resetAttempt()
    setThread([])
    setFollowupText(null)
    setRevealed(false)
    setQuestion(q)
    player.current?.pause()
    if (!audioMode) return
    const chosen = bank.personas.length ? pick(bank.personas) : undefined
    setCurrent(chosen?.id ?? '')
    const file = chosen && bank.audio[chosen.id]?.[q.text]
    if (file) {
      player.current = new Audio(`ftc-audio://${file}`)
      void player.current.play()
    }
  }

  const next = (): void => {
    if (eligible.length === 0) return
    const others = eligible.length > 1 ? eligible.filter((q) => q.id !== question?.id) : eligible
    ask(pick(others))
  }

  const replay = (): void => {
    if (!question) return
    player.current?.pause()
    const file = bank.audio[current]?.[question.text]
    if (file) {
      player.current = new Audio(`ftc-audio://${file}`)
      void player.current.play()
    }
  }

  const start = async (): Promise<void> => {
    setError('')
    player.current?.pause()
    try {
      if (!(await window.api.requestMedia('microphone'))) throw new Error('Microphone access was denied. Enable it in system settings.')
      if (withVideo && !(await window.api.requestMedia('camera'))) throw new Error('Camera access was denied. Enable it in system settings.')
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo })
      stream.current = s
      resetAttempt()

      audioChunks.current = []
      const a = new MediaRecorder(new MediaStream(s.getAudioTracks()))
      a.ondataavailable = (e) => e.data.size && audioChunks.current.push(e.data)
      audioRec.current = a
      a.start()

      mediaRec.current = null
      if (withVideo) {
        mediaChunks.current = []
        const m = new MediaRecorder(s)
        m.ondataavailable = (e) => e.data.size && mediaChunks.current.push(e.data)
        mediaRec.current = m
        m.start()
        if (preview.current) preview.current.srcObject = new MediaStream(s.getVideoTracks())
      }
      setSeconds(0)
      timer.current = window.setInterval(() => setSeconds((x) => x + 1), 1000)
      setRecording(true)
    } catch (e) {
      stopStream()
      setError((e as Error).message)
    }
  }

  const stop = async (): Promise<void> => {
    const a = audioRec.current
    const m = mediaRec.current
    if (!a) return
    setRecording(false)
    const finished = (r: MediaRecorder): Promise<void> => new Promise((res) => ((r.onstop = () => res()), r.stop()))
    await Promise.all([finished(a), m ? finished(m) : Promise.resolve()])
    stopStream()
    if (preview.current) preview.current.srcObject = null

    const audioBlob = new Blob(audioChunks.current, { type: a.mimeType })
    const playback = m ? new Blob(mediaChunks.current, { type: m.mimeType }) : audioBlob
    setMediaUrl(URL.createObjectURL(playback))
    try {
      setStatus('Transcribing…')
      const text = await window.api.transcribe(await toWhisperSamples(audioBlob))
      setTranscript(text)
      setStatus('')
      if (interaction === 'text' && text.trim() && thread.length < MAX_FOLLOWUPS) {
        setFuLoading(true)
        // The judge's follow-up is a bonus; failures here (e.g. no API key yet) should not disturb the answer review.
        const exchanges = [...thread, { question: followupText ?? question?.text ?? '', answer: text }]
        const fu = await window.api.practiceFollowup({ questionId: question?.id ?? '', exchanges }).catch(() => null)
        setPendingFollowup(fu)
      }
    } catch (e) {
      setError(`Transcription failed: ${(e as Error).message}`)
    } finally {
      setStatus('')
      setFuLoading(false)
    }
  }

  const audioMode = interaction === 'audio'
  const hidden = audioMode && !revealed
  const shownText = question ? (followupText ?? question.text) : ''

  const getFeedback = async (): Promise<void> => {
    if (!question || !transcript) return
    setError('')
    setFbLoading(true)
    try {
      setFeedback(await window.api.answerFeedback(question.id, transcript, followupText ?? undefined))
    } catch (e) {
      setError(`Could not get feedback: ${(e as Error).message}`)
    } finally {
      setFbLoading(false)
    }
  }

  const answerFollowup = (): void => {
    if (!pendingFollowup || !transcript) return
    const exchanges = [...thread, { question: shownText, answer: transcript }]
    resetAttempt()
    setThread(exchanges)
    setFollowupText(pendingFollowup)
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <>
      <div className="tabs">
        <select value={topic} onChange={(e) => setTopic(e.target.value)} disabled={recording}>
          {Object.entries(TOPIC_NAMES).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={withVideo} disabled={recording} onChange={(e) => setWithVideo(e.target.checked)} />
          Record video (stays on this computer)
        </label>
      </div>

      {!question ? (
        <div className="card hero">
          <h2 style={{ margin: '0 0 8px', fontSize: 26 }}>Ready for a judge question?</h2>
          <p>
            A random {topic === 'any' ? '' : TOPIC_NAMES[topic].toLowerCase() + ' '}question is {audioMode ? 'read aloud' : 'shown as text'}. Answer
            out loud, then review your transcript{audioMode ? '' : ' and ask for an AI follow-up'}.
          </p>
          <button className="btn primary" onClick={next} disabled={eligible.length === 0}>
            Ask me a question
          </button>
        </div>
      ) : (
        <div className="card question">
          <span key={`c${question.id}`} className={`chip${hidden ? ' blurred' : ''}`}>{TOPIC_NAMES[question.topic as Topic] ?? question.topic}</span>
          {question.notForInitialInterview && <span key={`b${question.id}`} className={`badge${hidden ? ' blurred' : ''}`}>pit only</span>}
          {thread.length > 0 && (
            <div className="thread">
              {thread.map((t, i) => (
                <p key={i} className="muted">
                  <strong>Judge:</strong> {t.question}
                  <br />
                  <strong>You:</strong> {t.answer}
                </p>
              ))}
            </div>
          )}
          <div key={`q${question.id}${thread.length}`} className="reveal" onClick={() => setRevealed(true)} style={{ cursor: hidden ? 'pointer' : undefined }}>
            <h2 className={hidden ? 'blurred' : ''}>{shownText}</h2>
            {hidden && <span className="reveal-hint">Click the question to reveal the text.</span>}
          </div>
          <div className="actions">
            {!recording ? (
              <button className="btn record" onClick={start}>
                ● Start answering
              </button>
            ) : (
              <button className="btn record live" onClick={stop}>
                ■ Stop · {mm}:{ss}
              </button>
            )}
            {audioMode && (
              <button className="btn" onClick={replay} disabled={recording}>
                ▶ Replay question
              </button>
            )}
            <span className="spacer" />
            <button className="btn" onClick={next} disabled={recording}>
              Next question →
            </button>
          </div>
        </div>
      )}

      <video ref={preview} autoPlay muted style={{ display: recording && withVideo ? 'block' : 'none', maxWidth: 320, marginBottom: 12 }} />
      {error && <div className="error">{error}</div>}
      {status && <p className="status">{status}</p>}
      {mediaUrl && (
        <div className="card">
          <h3>Your answer</h3>
          {withVideo ? <video src={mediaUrl} controls style={{ maxWidth: 480 }} /> : <audio src={mediaUrl} controls />}
          {transcript !== null && <p className="transcript">{transcript || '(no speech detected)'}</p>}
          {transcript && (
            <div className="actions">
              {!feedback && (
                <button className="btn primary" onClick={getFeedback} disabled={fbLoading || fuLoading}>
                  {fbLoading ? 'Getting feedback…' : 'Get feedback'}
                </button>
              )}
              {fuLoading && <span className="muted">Judge is thinking…</span>}
            </div>
          )}
          {pendingFollowup && (
            <div className="followup">
              <span className="muted">The judge has a follow-up:</span>
              <h3>{pendingFollowup}</h3>
              <button className="btn primary" onClick={answerFollowup}>
                Answer follow-up →
              </button>
            </div>
          )}
        </div>
      )}
      {feedback && <FeedbackCard fb={feedback} />}
    </>
  )
}
