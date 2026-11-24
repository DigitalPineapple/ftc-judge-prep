import { useEffect, useState } from 'react'
import type { AssetStatus, InteractionMode } from '../../shared/types'

type Asset = 'audio' | 'speechModel'
const INFO: Record<Asset, { name: string; size: string; why: string }> = {
  speechModel: { name: 'Speech recognition model', size: '~75 MB', why: 'Transcribes your spoken answers on this computer.' },
  audio: { name: 'Judge voice pack', size: '~115 MB', why: 'Spoken questions for Audio mode.' }
}

export function DownloadsBanner({ interaction, onAudioReady }: { interaction: InteractionMode; onAudioReady: () => void }): React.JSX.Element | null {
  const [status, setStatus] = useState<AssetStatus | null>(null)
  const [busy, setBusy] = useState<Asset | null>(null)
  const [pct, setPct] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void window.api.assetStatus().then(setStatus)
    return window.api.onAssetProgress((p) => p.asset === busy && setPct(p.pct))
  }, [busy])

  if (!status) return null
  const missing = (['speechModel', ...(interaction === 'audio' ? ['audio'] : [])] as Asset[]).filter((a) => !(a === 'audio' ? status.audio : status.speechModel))
  if (missing.length === 0) return null

  const download = async (a: Asset): Promise<void> => {
    setError('')
    setBusy(a)
    setPct(0)
    try {
      await window.api.downloadAsset(a)
      setStatus(await window.api.assetStatus())
      if (a === 'audio') onAudioReady()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card">
      <h3>One-time downloads</h3>
      {missing.map((a) => (
        <div key={a} className="crit">
          <div style={{ flex: 1 }}>
            <strong>{INFO[a].name}</strong> <span className="muted">{INFO[a].size}</span>
            <div className="muted">{INFO[a].why}</div>
          </div>
          <button className="btn primary" disabled={busy !== null} onClick={() => download(a)}>
            {busy === a ? `Downloading… ${pct ?? 0}%` : 'Download'}
          </button>
        </div>
      ))}
      {error && <div className="error">{error}</div>}
    </div>
  )
}
