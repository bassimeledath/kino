import { app, BrowserWindow, ipcMain, screen, desktopCapturer } from 'electron'
import { join } from 'path'
import { Channels } from '../shared/channels'

let mainWindow: BrowserWindow | null = null

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  mainWindow = createMainWindow()

  // IPC: List capture sources
  ipcMain.handle(Channels.SOURCES_LIST, async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
    })
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnailDataURL: s.thumbnail.toDataURL(),
      display_id: s.display_id,
    }))
  })

  // IPC: Check permissions
  ipcMain.handle(Channels.PERMISSIONS_CHECK, async (_event, type: string) => {
    const { systemPreferences } = await import('electron')
    switch (type) {
      case 'microphone':
        return systemPreferences.getMediaAccessStatus('microphone')
      case 'camera':
        return systemPreferences.getMediaAccessStatus('camera')
      case 'screen':
        return 'unknown' // ScreenCaptureKit check would go here
      default:
        return 'unknown'
    }
  })

  // IPC: Recording controls (stubs for now)
  ipcMain.on(Channels.RECORDING_START, (_event, _config) => {
    mainWindow?.webContents.send(Channels.RECORDING_STATUS, 'recording')
  })

  ipcMain.on(Channels.RECORDING_STOP, () => {
    mainWindow?.webContents.send(Channels.RECORDING_STATUS, 'idle')
  })

  // IPC: Export (stub)
  ipcMain.on(Channels.EXPORT_START, (_event, _config) => {
    mainWindow?.webContents.send(Channels.EXPORT_PROGRESS, 0)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
