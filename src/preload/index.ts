import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AnswerFeedback, AssetStatus, InterviewMode, InterviewReport, SessionRecord, TranscriptTurn, BankPayload, FollowupRequest, NextAction, NextRequest, Rubric, RubricPayload, Settings, SettingsInput } from '../shared/types'

const api = {
  getBank: (): Promise<BankPayload> => ipcRenderer.invoke('content:bank'),
  assetStatus: (): Promise<AssetStatus> => ipcRenderer.invoke('assets:status'),
  downloadAsset: (asset: 'audio' | 'speechModel'): Promise<void> => ipcRenderer.invoke('assets:download', asset),
  onAssetProgress: (cb: (p: { asset: 'audio' | 'speechModel'; pct: number | null }) => void): (() => void) => {
    const h = (_: unknown, p: { asset: 'audio' | 'speechModel'; pct: number | null }): void => cb(p)
    ipcRenderer.on('assets:progress', h)
    return () => ipcRenderer.removeListener('assets:progress', h)
  },
  getRubric: (): Promise<RubricPayload> => ipcRenderer.invoke('content:rubric'),
  importRubric: (): Promise<Rubric | null> => ipcRenderer.invoke('content:import-rubric'),
  transcribe: (samples: Float32Array): Promise<string> => ipcRenderer.invoke('stt:transcribe', samples),
  requestMedia: (kind: 'microphone' | 'camera'): Promise<boolean> => ipcRenderer.invoke('media:request', kind),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (s: SettingsInput): Promise<Settings> => ipcRenderer.invoke('settings:save', s),
  testLlm: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('settings:test'),
  nextAction: (req: NextRequest): Promise<NextAction> => ipcRenderer.invoke('interview:next', req),
  interviewReport: (mode: InterviewMode, turns: TranscriptTurn[]): Promise<InterviewReport> =>
    ipcRenderer.invoke('feedback:interview', { mode, turns }),
  saveSession: (rec: Omit<SessionRecord, 'id' | 'hasVideo'>, video?: Uint8Array): Promise<SessionRecord> =>
    ipcRenderer.invoke('history:save', { rec, video }),
  setSessionReport: (id: string, report: InterviewReport): Promise<void> => ipcRenderer.invoke('history:set-report', { id, report }),
  listSessions: (): Promise<SessionRecord[]> => ipcRenderer.invoke('history:list'),
  sessionVideo: (id: string): Promise<Uint8Array | null> => ipcRenderer.invoke('history:video', id),
  deleteSession: (id: string): Promise<void> => ipcRenderer.invoke('history:delete', id),
  answerFeedback: (questionId: string, answer: string, questionText?: string): Promise<AnswerFeedback> =>
    ipcRenderer.invoke('feedback:answer', { questionId, answer, questionText }),
  practiceFollowup: (req: FollowupRequest): Promise<string | null> => ipcRenderer.invoke('practice:followup', req),
  speak: (text: string, personaId: string): Promise<Uint8Array | null> => ipcRenderer.invoke('tts:speak', { text, personaId }),
  onSttStatus: (cb: (s: { status: string; progress?: number }) => void): (() => void) => {
    const h = (_: unknown, s: { status: string; progress?: number }): void => cb(s)
    ipcRenderer.on('stt:status', h)
    return () => ipcRenderer.removeListener('stt:status', h)
  }
}

export type Api = typeof api

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
