import { useEffect, useState } from 'react'
import type { Settings } from '../../shared/types'

export function SettingsView(): React.JSX.Element {
  const [s, setS] = useState<Settings | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [speechKey, setSpeechKey] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    window.api.getSettings().then(setS)
  }, [])
  if (!s) return <></>

  const set = <K extends keyof Settings>(k: K, v: Settings[K]): void => setS({ ...s, [k]: v })

  const save = async (): Promise<void> => {
    try {
      setS(await window.api.saveSettings({ ...s, apiKey, speechKey }))
      setApiKey('')
      setSpeechKey('')
      setMsg('Saved.')
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  const test = async (): Promise<void> => {
    setMsg('Testing…')
    const r = await window.api.testLlm()
    setMsg(r.ok ? 'Connection works.' : `Failed: ${r.error}`)
  }

  const azure = s.provider === 'azure'
  return (
    <div className="card form">
      <h3>AI provider (bring your own key)</h3>
      <label>
        Provider
        <select value={s.provider} onChange={(e) => set('provider', e.target.value as Settings['provider'])}>
          <option value="azure">Azure OpenAI</option>
          <option value="openai">OpenAI</option>
        </select>
      </label>
      {azure && (
        <label>
          Endpoint
          <input value={s.endpoint} placeholder="https://your-resource.cognitiveservices.azure.com" onChange={(e) => set('endpoint', e.target.value)} />
        </label>
      )}
      <label>
        API key {s.hasApiKey && <span className="muted">(saved, leave blank to keep)</span>}
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      </label>
      <label>
        Interview model {azure ? '(deployment name)' : ''}
        <input value={s.interviewModel} placeholder={azure ? 'gpt-6-luna' : 'gpt-4o-mini'} onChange={(e) => set('interviewModel', e.target.value)} />
      </label>
      <label>
        Feedback model {azure ? '(deployment name)' : ''}
        <input value={s.feedbackModel} placeholder={azure ? 'gpt-6.1-sol' : 'gpt-4o'} onChange={(e) => set('feedbackModel', e.target.value)} />
      </label>

      <h3 style={{ marginTop: 22 }}>Judge voice for new follow-up questions (optional)</h3>
      <p className="muted">
        Bank questions use bundled audio. Follow-ups the AI makes up are spoken with Azure Speech. Leave blank to reuse your Azure endpoint and
        key; if neither is available the system voice is used.
      </p>
      <label>
        Speech endpoint
        <input value={s.speechEndpoint} onChange={(e) => set('speechEndpoint', e.target.value)} />
      </label>
      <label>
        Speech key {s.hasSpeechKey && <span className="muted">(saved)</span>}
        <input type="password" value={speechKey} onChange={(e) => setSpeechKey(e.target.value)} />
      </label>

      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={save}>
          Save
        </button>
        <button className="btn" onClick={test}>
          Test connection
        </button>
        <span className="muted">{msg}</span>
      </div>

      <h3 style={{ marginTop: 28 }}>About</h3>
      <p className="muted">
        FTC Judge Prep is an unofficial practice tool and is not affiliated with or endorsed by FIRST. Questions and feedback are
        based on public FTC judging materials and are for practice only; they do not predict how real judges will score. Real
        judging interviews do not allow recording, so use recordings from this app for practice at home only. Your recordings and
        transcripts stay on this computer; only text sent to your configured AI service leaves it.
      </p>
    </div>
  )
}
