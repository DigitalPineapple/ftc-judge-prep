import type { AnswerFeedback, CriterionLevel, InterviewReport } from '../../shared/types'

const LEVEL_LABEL: Record<CriterionLevel, string> = {
  observed: 'Observed',
  not_observed: 'Not observed',
  developing: 'Developing',
  solid: 'Solid',
  exemplary: 'Exemplary',
  not_addressed: 'Not covered in this answer'
}

export function FeedbackCard({ fb }: { fb: AnswerFeedback }): React.JSX.Element {
  const rated = fb.criteria.filter((c) => c.level !== 'not_addressed')
  const unrated = fb.criteria.filter((c) => c.level === 'not_addressed')
  return (
    <div className="card feedback">
      <h3>Feedback</h3>
      {fb.strengths.length > 0 && (
        <>
          <h4>What worked</h4>
          <ul>
            {fb.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
      {fb.missing.length > 0 && (
        <>
          <h4>What a judge would still want to hear</h4>
          <ul>
            {fb.missing.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
      {fb.tip && (
        <>
          <h4>Try this next time</h4>
          <p>{fb.tip}</p>
        </>
      )}
      {fb.strongerAnswer && (
        <>
          <h4>A stronger version</h4>
          <p className="transcript">{fb.strongerAnswer}</p>
        </>
      )}
      {rated.length > 0 && (
        <>
          <h4>Rubric check</h4>
          {rated.map((c) => (
            <div className="crit" key={c.id}>
              <span className={`level ${c.level}`}>{LEVEL_LABEL[c.level]}</span>
              <div>
                <div>{c.text}</div>
                <div className="muted">{c.evidence}</div>
              </div>
            </div>
          ))}
        </>
      )}
      {unrated.length > 0 && <p className="muted">Not covered in this answer: {unrated.map((c) => c.id).join(', ')}</p>}
    </div>
  )
}

function List({ title, items }: { title: string; items: string[] }): React.JSX.Element | null {
  if (items.length === 0) return null
  return (
    <>
      <h4>{title}</h4>
      <ul>
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </>
  )
}

export function ReportCard({ report }: { report: InterviewReport }): React.JSX.Element {
  const rated = report.criteria.filter((c) => c.level !== 'not_addressed')
  const unrated = report.criteria.filter((c) => c.level === 'not_addressed')
  return (
    <div className="card feedback">
      <h3>Interview feedback</h3>
      <p>{report.summary}</p>
      <List title="What worked" items={report.strengths} />
      <List title="What to improve" items={report.improvements} />
      <List title="Practice next" items={report.practiceNext} />
      {rated.length > 0 && (
        <>
          <h4>Rubric check</h4>
          {rated.map((c) => (
            <div className="crit" key={c.id}>
              <span className={`level ${c.level}`}>{LEVEL_LABEL[c.level]}</span>
              <div>
                <div>{c.text}</div>
                <div className="muted">{c.evidence}</div>
              </div>
            </div>
          ))}
        </>
      )}
      {unrated.length > 0 && <p className="muted">Not covered in this interview: {unrated.map((c) => c.id).join(', ')}</p>}
    </div>
  )
}
