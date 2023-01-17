console.log("######################")
const ipcRenderer = {
  invoke: (name, ...args) => {
    console.log("invoke", name, args)
    return fetch("/ipc", {
      method: "post",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        args
      })
    }).then((res) => {
      return res.json()
    })
  }
}
window.es = new EventSource("/stream");
window.electronAPI = {
  sync: (rpc) => {
    return ipcRenderer.invoke('sync', rpc)
  },
  del: (filenames) => {
    if (Array.isArray(filenames)) {
      return ipcRenderer.invoke("del", filenames)
    } else {
      return ipcRenderer.invoke("del", [filenames])
    }
  },
  startDrag: (fileNames) => {
//    ipcRenderer.send('ondragstart', fileNames)
  },
  onMsg: (callback) => {
    es.addEventListener('message', (event) => {
      console.log("e", event.data)
      callback(event, JSON.parse(JSON.parse(event.data)))
    })
  },
  select: () => {
    return ipcRenderer.invoke("select")
  },
  copy: (text) => {
    return ipcRenderer.invoke("copy", text)
  },
  defaults: () => {
    return ipcRenderer.invoke("defaults")
  },
  gm: (rpc) => {
    return ipcRenderer.invoke("gm", rpc)
  },
  open: (file_path) => {
    return ipcRenderer.invoke("open", file_path)
  },
  xmp: (file_path) => {
    return ipcRenderer.invoke("xmp", file_path)
  },
//  zoom: (ratio) => {
//    // ratio 50 - 200
//    if (ratio >= 50 && ratio <= 200) {
//      webFrame.setZoomFactor(ratio/100)
//    }
//  },
//  getzoom: () => {
//    // ratio 50 - 200
//    return webFrame.getZoomFactor()
//  },
  docs: () => {
    ipcRenderer.invoke("docs")
  },
  theme: (val) => {
    ipcRenderer.invoke("theme", val)
  },
  debug: () => {
    ipcRenderer.invoke("debug")
  }
}
