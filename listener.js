const chokidar = require('chokidar');
const Diffusionbee = require('./crawler/diffusionbee')
const Standard = require('./crawler/standard')
const path = require('path');
class Events {
  MAX = 100
  chain = []
  constructor(listener, session) {
    this.listener = listener
    this.session = session
  }
  async add(msg) {
    console.log("add", msg)
    this.chain.push(msg)
    if (this.chain.length > 1000) {
      this.chain = this.chain.slice(-1000)
    }
    await this.emit(msg)
  }
  async emit(msg) {
    let folder = msg.root_path
    console.log("triggered clients", this.listener.connections[folder])
    await this.listener.ipc.queue.push({
      method: "new",
      params: [msg]
    })
    //if (this.listener.app.config.socket) {
    //  this.listener.app.config.socket.push({
    //    method: "new",
    //    params: [msg]
    //  })
    //}
  }
}
class Listener {
  connections = {}
  constructor(ipc, session) {
    this.session = session
    this.ipc = ipc
    this.folders = {}
    this.events = new Events(this)
  }
  async sync(filename) {
    let r
    for(let i=0; i<5; i++) {
      const folder = path.dirname(filename)
      let diffusionbee;
      let standard;
      let file_path = filename
      let root_path = folder
      let res;
      try {
        if (/diffusionbee/g.test(root_path)) {
          if (!diffusionbee) {
            diffusionbee = new Diffusionbee(root_path)
            await diffusionbee.init()
          }
          res = await diffusionbee.sync(file_path)
        } else {
          if (!standard) {
            standard = new Standard(root_path)
            await standard.init()
          }
          res = await standard.sync(file_path)
        }
        return res
      } catch (e) {
        return null
      }
    }
  }
  subscribe(msg) {
    let { name, args } = msg
    if (name === "folders") {
      let folders = args
      for(let folder of folders) {
        // if the watcher doesn't yet exist for the folder, create one
        let watcher = this.folders[folder]
        if (!watcher) {
          const glob = `${folder}/**/*.png`
          watcher = chokidar.watch(glob, {
            ignoreInitial: true
          })
          this.folders[folder] = watcher 
          watcher.on("add", async (filename) => {
            for(let i=0; i<5; i++) {
              let res = await this.sync(filename)
              if (res) {
                await this.events.add(res)
                break;
              } else {
                // try again in 1 sec
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          })
        }
        // create a mapping from the folder name to session set
        if (!this.connections[folder]) {
          this.connections[folder] = new Set()
        }
        this.connections[folder].add(this.session)
      }
    }
  }
}
module.exports = Listener
