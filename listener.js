const chokidar = require('chokidar');
const Diffusionbee = require('./crawler/diffusionbee')
const Standard = require('./crawler/standard')
const path = require('path');
class Listener {
  constructor(app) {
    this.app = app
    this.folders = {}
    this.clients = {}
  }
  subscribe(msg) {
    let { session, name, args } = msg
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
            const folder = path.dirname(filename)
            console.log("added", filename)
            console.log("folder", folder)
            console.log("triggered clients", this.clients[folder])
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
            } catch (e) {
              console.log("E", e)
            }
            if (res) {
              await this.app.ipc.queue.push({
                method: "new",
                params: [res]
              })
              if (this.app.config.socket) {
                this.app.config.socket.push({
                  method: "new",
                  params: [res]
                })
              }

            }
          })
        }
        // create a mapping from the folder name to session set
        if (!this.clients[folder]) {
          this.clients[folder] = new Set()
        }
        this.clients[folder].add(session)
      }
    }
  }
}
module.exports = Listener
