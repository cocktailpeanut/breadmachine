const { fdir } = require("fdir");
const yaml = require('js-yaml');
const xmlFormatter = require('xml-formatter');
const fastq = require('fastq')
const SSE = require('express-sse');
const fs = require('fs')
const os = require('os')
const path = require('path')
const GM = require('./crawler/gm')
const Diffusionbee = require('./crawler/diffusionbee')
const Standard = require('./crawler/standard')
class IPC {
  handlers = {}
  handle(name, fn) {
    this.handlers[name] = fn
  }
  constructor(config) {
    this.gm = new GM()
    this.sse = new SSE();
    if (config) {
      if (config.ipc) {
        this.ipc = config.ipc
      }
      if (config.theme) this.theme = config.theme
    }
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
      this.sse.send(JSON.stringify(msg))
    }, 1)
    this.ipc.handle("theme", (event, _theme) => {
      this.ipc.theme = _theme
    })
    this.ipc.handle('sync', async (event, rpc) => {
      console.log("## sync from rpc", rpc)
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
    this.ipc.handle('del', async (event, filenames) => {
      for(let filename of filenames) {
        await fs.promises.rm(filename).catch((e) => {
          console.log("error", e)
        })
      }
    })
    this.ipc.handle('defaults', async (event) => {
      let str = await fs.promises.readFile(this.config.config, "utf8")
      const attrs = yaml.load(str)
      const home = os.homedir()
      const connect = attrs.connect.map((c) => {
        let homeResolved = c.replace(/^~(?=$|\/|\\)/, home)
        let relativeResolved = path.resolve(home, homeResolved)
        return relativeResolved
      })
      return connect
    })
    this.ipc.handle('gm', async (event, rpc) => {
      if (rpc.cmd === "set" || rpc.cmd === "rm") {
        let res = await this.gm[rpc.cmd](...rpc.args)
        return res
      } 
    })
    this.ipc.handle('xmp', async (event, file_path) => {
      let res = await this.gm.get(file_path)
      return xmlFormatter(res.chunk.data.replace("XML:com.adobe.xmp\x00\x00\x00\x00\x00", ""), {
        indentation: "  "
      })
    })
  }
  async call(name, ...args) {
    let r = await this.handlers[name](null, ...args)
    return r
  }
}
module.exports = IPC
