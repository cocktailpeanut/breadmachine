class API {
  constructor(config) {
    this.es = new EventSource("/stream");
    this.config = config
  }
  sync (rpc) {
    return this.request('sync', rpc)
  }
  del (filenames) {
    if (Array.isArray(filenames)) {
      return this.request("del", filenames)
    } else {
      return this.request("del", [filenames])
    }
  }
  defaults () {
    return this.request("defaults")
  }
  gm (rpc) {
    return this.request("gm", rpc)
  }
  xmp (file_path) {
    return this.request("xmp", file_path)
  }
  theme (val) {
    return this.request("theme", val)
  }


  startDrag (fileNames) {
    if (window.electronAPI) {
      window.electronAPI.startDrag(fileNames)
    }
//    ipcRenderer.send('ondragstart', fileNames)
  }
  listen (callback) {
    this.es.addEventListener('message', (event) => {
      console.log("e", event.data)
      callback(event, JSON.parse(JSON.parse(event.data)))
    })
  }
  select () {
    return this.request("select")
  }
  //copy (text) {
  //  return this.request("copy", text)
  //}
  copy(str) {

    const element = document.createElement('textarea');
    const previouslyFocusedElement = document.activeElement;

    element.value = str;

    // Prevent keyboard from showing on mobile
    element.setAttribute('readonly', '');

    element.style.contain = 'strict';
    element.style.position = 'absolute';
    element.style.left = '-9999px';
    element.style.fontSize = '12pt';

    const selection = document.getSelection();
    const originalRange = selection.rangeCount > 0 && selection.getRangeAt(0);

    document.body.append(element);
    element.select();

    element.selectionStart = 0;
    element.selectionEnd = str.length;

    let isSuccess = false;
    try {
      isSuccess = document.execCommand('copy');
    } catch {}

    element.remove();

    if (originalRange) {
      selection.removeAllRanges();
      selection.addRange(originalRange);
    }

    // Get the focus back on the previously focused element, if any
    if (previouslyFocusedElement) {
      previouslyFocusedElement.focus();
    }

    return isSuccess;
  }
  open (file_path) {
    console.log("open", file_path, this.config.agent)
    if (this.config.agent === "web") {
      window.open(`/file?file=${encodeURIComponent(file_path)}`, "_blank")
    } else {
      return this.request("open", file_path)
    }
  }
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
  debug () {
    this.request("debug")
  }



  request(name, ...args) {
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
