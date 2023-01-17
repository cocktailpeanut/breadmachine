//const {app, shell, BrowserWindow, ipcMain, dialog, session, clipboard } = require('electron')
const {app, shell, BrowserWindow, dialog, session, clipboard } = require('electron')
const contextMenu = require('electron-context-menu');
const Server = require('./server')
const is_mac = process.platform.startsWith("darwin")
contextMenu({ showSaveImageAs: true });
var mainWindow;
var theme = "default";
const titleBarOverlay = (theme) => {
  if (is_mac) {
    return false
  } else {
    if (theme === "dark") {
      return {
        color: "#111",
        symbolColor: "white"
      }
    } else if (theme === "default") {
      return {
        color: "white",
        symbolColor: "black"
      }
    }
    return {
      color: "white",
      symbolColor: "black"
    }
  }
}
function createWindow (port) {
  mainWindow = new BrowserWindow({
		titleBarStyle : "hidden",
		titleBarOverlay : titleBarOverlay(),
    webPreferences: {
//      preload: path.join(__dirname, 'preload.js')
    },
  })
  // mainWindow.webContents.openDevTools()
  mainWindow.loadURL(`http://localhost:${port}`)
  mainWindow.maximize();


  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}
const server = new Server();
app.whenReady().then(async () => {
  await server.init({ theme })
  server.ipc.handle("theme", (event, _theme) => {
    server.ipc.theme = _theme
    if (mainWindow.setTitleBarOverlay) {
      mainWindow.setTitleBarOverlay(titleBarOverlay(server.ipc.theme))
    }
  })
  server.ipc.handle('debug', (event) => {
    mainWindow.webContents.openDevTools()
  })
//  session.defaultSession.clearStorageData()   // for testing freshly every time

  createWindow(server.port)
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(server.port)
  })

})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})
