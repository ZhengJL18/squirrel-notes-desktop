import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerIpc, wireUpdateNotifier } from './ipc'
import { initUpdater } from './services/updater'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#14171A',
    title: '松鼠症笔记',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpc()
  initUpdater()

  // 把更新器事件转发到渲染进程。
  wireUpdateNotifier((data) => {
    mainWindow?.webContents.send('update:event', data)
  })

  createWindow()

  // 启动后延迟检查更新，避免干扰首屏。
  setTimeout(() => {
    const { checkUpdate } = require('./services/updater') as typeof import('./services/updater')
    checkUpdate().catch(() => {})
  }, 3000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
