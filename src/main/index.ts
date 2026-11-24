import { app, shell, BrowserWindow, ipcMain, session, systemPreferences } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  importRubric,
  loadBank,
  loadRubric,
  registerAudioProtocol,
  registerAudioScheme
} from './services/content'
import { transcribe } from './services/stt'
import { getSecrets, getSettings, saveSettings } from './services/settings'
import { chatJson, type LlmConfig } from './services/llm'
import { nextAction, practiceFollowup } from './services/interview'
import { answerFeedback, interviewReport } from './services/feedback'
import { deleteSession, listSessions, saveSession, sessionVideo, setSessionReport } from './services/history'
import { assetStatus, downloadAudio, downloadSpeechModel } from './services/assets'
import { synthesize } from './services/tts'
import type { FollowupRequest, InterviewMode, InterviewReport, NextRequest, SessionRecord, SettingsInput, Topic, TranscriptTurn } from '../shared/types'

function llmConfig(): { cfg: LlmConfig; settings: ReturnType<typeof getSettings> } {
  const { settings, apiKey } = getSecrets()
  return { cfg: { provider: settings.provider, endpoint: settings.endpoint, apiKey }, settings }
}

registerAudioScheme()

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('org.vibeorbits.ftcjudgeprep')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerAudioProtocol()
  ipcMain.handle('content:bank', () => loadBank())
  ipcMain.handle('assets:status', () => assetStatus(loadBank().season))
  ipcMain.handle('assets:download', async (_e, asset: 'audio' | 'speechModel') => {
    if (asset === 'audio') await downloadAudio(loadBank().season)
    else await downloadSpeechModel()
  })
  ipcMain.handle('content:rubric', () => loadRubric())
  ipcMain.handle('content:import-rubric', () => importRubric())
  ipcMain.handle('stt:transcribe', (_e, samples: Float32Array) => transcribe(samples))
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:save', (_e, input: SettingsInput) => saveSettings(input))
  ipcMain.handle('settings:test', async () => {
    try {
      const { cfg, settings } = llmConfig()
      await chatJson(cfg, settings.interviewModel, 'Reply with JSON only.', '{"ping":true}')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })
  ipcMain.handle('feedback:answer', (_e, a: { questionId: string; answer: string; questionText?: string }) => {
    const { cfg, settings } = llmConfig()
    const base = loadBank().questions.find((q) => q.id === a.questionId)
    if (!base) throw new Error('Unknown question')
    // Follow-ups keep the topic of the bank question they came from.
    const question = a.questionText ? { ...base, text: a.questionText } : base
    return answerFeedback(cfg, settings.feedbackModel || settings.interviewModel, loadRubric(), question, a.answer)
  })
  ipcMain.handle('feedback:interview', (_e, a: { mode: InterviewMode; turns: TranscriptTurn[] }) => {
    const { cfg, settings } = llmConfig()
    const bank = loadBank()
    const topics =
      a.mode.kind === 'topic'
        ? [a.mode.topic]
        : [...new Set(a.turns.map((t) => bank.questions.find((q) => q.id === t.questionId)?.topic).filter((t): t is Topic => !!t))]
    const turns = a.turns.map((t) => ({ role: t.role, text: t.text }))
    return interviewReport(cfg, settings.feedbackModel || settings.interviewModel, loadRubric(), topics, turns)
  })
  ipcMain.handle('history:save', (_e, a: { rec: Omit<SessionRecord, 'id' | 'hasVideo'>; video?: Uint8Array }) => saveSession(a.rec, a.video))
  ipcMain.handle('history:set-report', (_e, a: { id: string; report: InterviewReport }) => setSessionReport(a.id, a.report))
  ipcMain.handle('history:list', () => listSessions())
  ipcMain.handle('history:video', (_e, id: string) => sessionVideo(id))
  ipcMain.handle('history:delete', (_e, id: string) => deleteSession(id))
  ipcMain.handle('interview:next', (_e, req: NextRequest) => {
    const { cfg, settings } = llmConfig()
    return nextAction(cfg, settings.interviewModel, loadBank(), loadRubric(), req)
  })
  ipcMain.handle('practice:followup', (_e, req: FollowupRequest) => {
    const { cfg, settings } = llmConfig()
    return practiceFollowup(cfg, settings.interviewModel, loadBank(), loadRubric(), req)
  })
  // Returns null when on-the-fly speech is unavailable; the renderer then falls back to the system voice.
  ipcMain.handle('tts:speak', async (_e, a: { text: string; personaId: string }) => {
    const { settings, apiKey, speechKey } = getSecrets()
    const persona = loadBank().personas.find((p) => p.id === a.personaId)
    const endpoint = settings.speechEndpoint || (settings.provider === 'azure' ? settings.endpoint : '')
    const key = speechKey || (settings.provider === 'azure' ? apiKey : undefined)
    if (!persona || !endpoint || !key) return null
    try {
      return await synthesize({ endpoint, key }, persona, a.text)
    } catch (e) {
      console.error('tts fallback:', (e as Error).message)
      return null
    }
  })
  ipcMain.handle('media:request', async (_e, kind: 'microphone' | 'camera') =>
    process.platform === 'darwin' ? systemPreferences.askForMediaAccess(kind) : true
  )
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) =>
    cb(permission === 'media')
  )

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
