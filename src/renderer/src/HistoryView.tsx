import { useEffect, useState } from 'react'
import type { SessionRecord } from '../../shared/types'
import { ReportCard } from './Feedback'

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

const title = (r: SessionRecord): string =>
  r.mode.kind === 'full' ? 'Full interview' : `${r.mode.topic[0].toUpperCase()}${r.mode.topic.slice(1)} pit interview`

function Detail({ rec, onBack, onDeleted }: { rec: SessionRecord; onBack: () => void; onDeleted: () => void }): React.JSX.Element {
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    let url: string | null = null
    if (rec.hasVideo) {
      window.api.sessionVideo(rec.id).then((b) => {
        if (b) setVideoUrl((url = URL.createObjectURL(new Blob([b as BlobPart], { type: 'video/webm' }))))
      })
    }
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [rec.id, rec.hasVideo])

  return (
    <>
      <div className="actions" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={onBack}>
          ← All sessions
        </button>
        <span className="spacer" />
        {confirming ? (
          <>
            <span className="muted">Delete this session{rec.hasVideo ? ' and its video' : ''}?</span>
            <button
              className="btn"
              onClick={async () => {
                await window.api.deleteSession(rec.id)
                onDeleted()
              }}
            >
              Yes, delete
            </button>
            <button className="btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button className="btn" onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
      </div>
      <div className="card">
        <h3>
          {title(rec)} · {new Date(rec.startedAt).toLocaleString()}
        </h3>
        <p className="muted">
          {fmt(rec.durationSec)} · {rec.interaction === 'audio' ? 'Audio mode' : 'Text mode'}
        </p>
        {videoUrl && <video src={videoUrl} controls style={{ maxWidth: 480 }} />}
      </div>
      {rec.report ? <ReportCard report={rec.report} /> : <div className="card muted">No feedback was generated for this session.</div>}
      <div className="card">
        <h3>Transcript</h3>
        {rec.turns.map((t, i) => (
          <p key={i} className={t.role === 'judge' ? 'turn judge' : 'turn'}>
            <strong>{t.role === 'judge' ? 'Judge' : 'You'}:</strong> {t.text}
          </p>
        ))}
      </div>
    </>
  )
}

export function HistoryView(): React.JSX.Element {
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = (): void => void window.api.listSessions().then(setSessions)
  useEffect(load, [])

  const open = sessions?.find((s) => s.id === openId)
  if (open)
    return (
      <Detail
        rec={open}
        onBack={() => setOpenId(null)}
        onDeleted={() => {
          setOpenId(null)
          load()
        }}
      />
    )

  if (!sessions) return <div className="card muted">Loading…</div>
  if (sessions.length === 0)
    return (
      <div className="card hero">
        <h2 style={{ margin: '0 0 8px' }}>No sessions yet</h2>
        <p>Finish a mock interview and it will be saved here with its feedback.</p>
      </div>
    )

  return (
    <div className="card">
      <h3>Past interviews</h3>
      {sessions.map((s) => {
        const rated = s.report?.criteria.filter((c) => c.level !== 'not_addressed') ?? []
        const strong = rated.filter((c) => ['observed', 'solid', 'exemplary'].includes(c.level)).length
        return (
          <div key={s.id} className="history-row" onClick={() => setOpenId(s.id)}>
            <div>
              <strong>{title(s)}</strong>
              <div className="muted">
                {new Date(s.startedAt).toLocaleString()} · {fmt(s.durationSec)} · {s.interaction === 'audio' ? 'Audio' : 'Text'}
                {s.hasVideo ? ' · 🎥' : ''}
              </div>
            </div>
            <span className="spacer" />
            {rated.length > 0 && <span className="chip">{strong}/{rated.length} criteria met</span>}
          </div>
        )
      })}
    </div>
  )
}
