import { useEffect, useRef, useState } from 'react'
import type { BankPayload, InteractionMode, RubricPayload, Topic } from '../../shared/types'
import { PracticeView } from './PracticeView'
import { InterviewView } from './InterviewView'
import { SettingsView } from './SettingsView'
import { HistoryView } from './HistoryView'
import { DownloadsBanner } from './DownloadsBanner'

type View = 'interview' | 'practice' | 'history' | 'bank' | 'rubric' | 'settings'

const TOPIC_LABELS: Record<Topic | 'all', string> = {
  all: 'All',
  control: 'Control',
  design: 'Design',
  innovate: 'Innovate',
  connect: 'Connect',
  reach: 'Reach',
  sustain: 'Sustain',
  think: 'Think',
  judges_choice: "Judges' Choice"
}

function App(): React.JSX.Element {
  const [view, setView] = useState<View>('practice')
  const [bank, setBank] = useState<BankPayload | null>(null)
  const [rubric, setRubric] = useState<RubricPayload | null>(null)
  const [interaction, setInteractionState] = useState<InteractionMode>(() => (localStorage.getItem('interaction') === 'text' ? 'text' : 'audio'))
  const setInteraction = (m: InteractionMode): void => (setInteractionState(m), localStorage.setItem('interaction', m))

  useEffect(() => {
    window.api.getBank().then(setBank)
    window.api.getRubric().then(setRubric)
  }, [])

  return (
    <div className="app">
      <header className="top">
        <h1>
          <span className="logo">🎙</span>
          FTC Judge Prep
          <span className="muted">{bank ? `Season ${bank.season}` : ''}</span>
        </h1>
        <nav title="Audio: questions are spoken, bank questions only. Text: questions are shown as text and the judge can ask AI follow-ups.">
          <button className={interaction === 'audio' ? 'active' : ''} onClick={() => setInteraction('audio')}>
            🔊 Audio
          </button>
          <button className={interaction === 'text' ? 'active' : ''} onClick={() => setInteraction('text')}>
            💬 Text
          </button>
        </nav>
        <nav>
          <button className={view === 'interview' ? 'active' : ''} onClick={() => setView('interview')}>
            Mock interview
          </button>
          <button className={view === 'practice' ? 'active' : ''} onClick={() => setView('practice')}>
            Random question
          </button>
          <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>
            History
          </button>
          <button className={view === 'bank' ? 'active' : ''} onClick={() => setView('bank')}>
            Question bank
          </button>
          <button className={view === 'rubric' ? 'active' : ''} onClick={() => setView('rubric')}>
            Rubric
          </button>
          <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}>
            Settings
          </button>
        </nav>
      </header>
      <main>
        <div className="content">
          <DownloadsBanner interaction={interaction} onAudioReady={() => window.api.getBank().then(setBank)} />
          {view === 'interview' && bank && <InterviewView bank={bank} interaction={interaction} />}
          {view === 'practice' && bank && <PracticeView bank={bank} interaction={interaction} />}
          {view === 'history' && <HistoryView />}
          {view === 'settings' && <SettingsView />}
          {view === 'bank' && bank && <BankView bank={bank} />}
          {view === 'rubric' && rubric && <RubricView rubric={rubric} onChange={setRubric} />}
        </div>
      </main>
    </div>
  )
}

function BankView({ bank }: { bank: BankPayload }): React.JSX.Element {
  const [topic, setTopic] = useState<Topic | 'all'>('all')
  const audio = useRef<HTMLAudioElement | null>(null)
  const [persona, setPersona] = useState(bank.personas[0]?.id ?? '')
  const files = bank.audio[persona] ?? {}

  const play = (text: string): void => {
    const file = files[text]
    if (!file) return
    audio.current?.pause()
    audio.current = new Audio(`ftc-audio://${file}`)
    void audio.current.play()
  }

  const topics = Object.keys(TOPIC_LABELS) as (Topic | 'all')[]
  const shown = bank.questions.filter((q) => topic === 'all' || q.topic === topic)

  return (
    <>
      <div className="tabs">
        {topics.map((t) => (
          <button key={t} className={`pill${t === topic ? ' active' : ''}`} onClick={() => setTopic(t)}>
            {TOPIC_LABELS[t]}
          </button>
        ))}
      </div>
      <p className="muted">
        {shown.length} questions
        {bank.personas.length > 0 && (
          <select style={{ marginLeft: 12 }} value={persona} onChange={(e) => setPersona(e.target.value)}>
            {bank.personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        )}
      </p>
      {shown.map((q) => (
        <div className="card" key={q.id}>
          <div className="q">
            <span>
              {q.text}
              {q.notForInitialInterview && <span className="badge">pit only</span>}
              {q.audience && <span className="badge">{q.audience.replace('_', ' ')}</span>}
            </span>
            <button className="btn play" disabled={!files[q.text]} onClick={() => play(q.text)}>
              ▶
            </button>
          </div>
          {q.followups && (
            <ul>
              {q.followups.map((f) => (
                <li key={f.text}>
                  {f.text}{' '}
                  {files[f.text] && (
                    <button className="btn play" onClick={() => play(f.text)}>
                      ▶
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {q.note && <p className="muted">Note: {q.note}</p>}
        </div>
      ))}
    </>
  )
}

function RubricView({
  rubric,
  onChange
}: {
  rubric: RubricPayload
  onChange: (r: RubricPayload) => void
}): React.JSX.Element {
  const [error, setError] = useState('')

  const doImport = async (): Promise<void> => {
    setError('')
    try {
      if (await window.api.importRubric()) onChange(await window.api.getRubric())
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <p>
        Season {rubric.season}, revision {rubric.revision} ({rubric.source}){' '}
        <button className="btn" onClick={doImport}>
          Import rubric file…
        </button>
      </p>
      {error && <div className="notice">{error}</div>}
      {Object.entries(rubric.awards).map(([id, award]) => (
        <div className="card" key={id}>
          <strong>{award.name}</strong>
          {award.note && <p className="muted">{award.note}</p>}
          <ul>
            {award.criteria.map((c) => (
              <li key={c.id}>
                <em>{c.kind}</em>: {c.text}
                {c.evaluatedInInitialInterview === false && <span className="badge">not in interview</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

export default App
