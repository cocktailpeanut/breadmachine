const { fdir } = require("fdir");
const xmlFormatter = require('xml-formatter');
const fastq = require('fastq')
const SSE = require('express-sse');
const fs = require('fs')
const path = require('path')
const GM = require('./crawler/gm')
const Diffusionbee = require('./crawler/diffusionbee')
const Standard = require('./crawler/standard')
const Listener = require('./listener')
class IPC {
  handlers = {}
  handle(name, fn) {
    this.handlers[name] = fn
  }
  constructor(app, session, config) {
    this.session = session
    this.listener = new Listener(this, session)
    this.app = app
    this.gm = new GM()
    this.sse = new SSE();
    if (config) {
      if (config.ipc) {
        this.ipc = config.ipc
      }
    }
    this.theme = (config && config.theme ? config.theme : "default")
    this.config = config
    if (!this.ipc) {
      this.ipc = {
        handle: (name, fn) => {
          this.handlers[name] = fn
        },
        on: (name, fn) => {
          fn(name)
        }
      }
    }
    this.queue = fastq.promise(async (msg) => {
      console.log("queue msg", msg)
      if (msg.params && msg.params.length > 0 && msg.params[0].btime) {
        this.sse.send(JSON.stringify(msg), null, msg.params[0].btime)
      } else {
        this.sse.send(JSON.stringify(msg))
      }
    }, 1)
    this.ipc.handle("theme", (session, _theme) => {
      this.theme = _theme
    })
    this.ipc.handle("style", (session, _style) => {
      this.style = _style
    })
    this.ipc.handle('subscribe', async (session, folderpaths) => {
      this.listener.subscribe({
        name: "folders",
        args: folderpaths
      })
    })
    this.ipc.handle('sync', async (session, rpc) => {
      console.log("## sync from rpc", session, rpc)
      let filter
      if (rpc.paths) {
        let diffusionbee;
        let standard;
        for(let i=0; i<rpc.paths.length; i++) {
          let { file_path, root_path } = rpc.paths[i]
          let res;
          try {
            if (/diffusionbee/g.test(root_path)) {
              if (!diffusionbee) {
                diffusionbee = new Diffusionbee(root_path)
                await diffusionbee.init()
              }
              res = await diffusionbee.sync(file_path, rpc.force)
            } else {
              if (!standard) {
                standard = new Standard(root_path)
                await standard.init()
              }
              res = await standard.sync(file_path, rpc.force)
            }
          } catch (e) {
            console.log("E", e)
          }
          if (res) {
            await this.queue.push({
              app: root_path,
              total: rpc.paths.length,
              progress: i,
              meta: res
            })
          } else {
            await this.queue.push({
              app: root_path,
              total: rpc.paths.length,
              progress: i,
            })
          }
        }
      } else if (rpc.root_path) {
        let filenames = await new fdir()
          .glob("**/*.png")
          .withBasePath()
          .crawl(rpc.root_path)
          .withPromise()
        if (filenames.length > 0) {
          let crawler;
          if (/diffusionbee/g.test(rpc.root_path)) {
            crawler = new Diffusionbee(rpc.root_path)
          } else {
            crawler = new Standard(rpc.root_path)
          }
          await crawler.init()
          for(let i=0; i<filenames.length; i++) {
            let filename = filenames[i]
            let stat = await fs.promises.stat(filename)
            let btime = new Date(stat.birthtime).getTime()
            if (!rpc.checkpoint || btime > rpc.checkpoint) {
              //console.log("above checkpoint", btime, rpc.checkpoint, filename)
              let res = await crawler.sync(filename, rpc.force)
              if (res) {
                if (!res.btime) res.btime = res.mtime
                await this.queue.push({
                  app: rpc.root_path,
                  total: filenames.length,
                  progress: i,
                  meta: res
                })
                continue;
              }
            }
            await this.queue.push({
              app: rpc.root_path,
              total: filenames.length,
              progress: i,
            })
          }
        } else {
          await this.queue.push({
            app: rpc.root_path,
            total: 1,
            progress: 1,
          })
        }
      }
    })
    this.ipc.handle('del', async (session, filenames) => {
      for(let filename of filenames) {
        await fs.promises.rm(filename).catch((e) => {
          console.log("error", e)
        })
      }
    })
    this.ipc.handle('defaults', async (session) => {
      let settings = await this.app.settings()
      return settings.folders
    })
    this.ipc.handle('gm', async (session, rpc) => {
      if (rpc.cmd === "set" || rpc.cmd === "rm") {
        let res = await this.gm[rpc.cmd](...rpc.args)
        return res
      } 
    })
    this.ipc.handle('xmp', async (session, file_path) => {
      let res = await this.gm.get(file_path)
      return xmlFormatter(res.chunk.data.replace("XML:com.adobe.xmp\x00\x00\x00\x00\x00", ""), {
        indentation: "  "
      })
    })
  }
  async call(session, name, ...args) {
    let r = await this.handlers[name](session, ...args)
    return r
  }
}
module.exports = IPC
