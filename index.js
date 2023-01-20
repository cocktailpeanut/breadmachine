const path = require('path')
const express = require('express')
const getport = require('getport')
const Updater = require('./updater/index')
const packagejson = require('./package.json')
const IPC = require('./ipc')
class Breadpress {
  async init(config) {
    this.config = config
    this.VERSION = packagejson.version
    this.need_update = null
    this.default_sync_mode = "default"
    this.current_sorter_code = 0
    this.port = await new Promise((resolve, reject) => {
      getport(function (e, p) {
        if (e) throw e
        resolve(p)
      })
    })
    this.ipc = new IPC(config)
    await this.updateCheck().catch((e) => {
      console.log("update check error", e)
    })
    this.start()
  }
  start() {
    let app = express()
    app.use((req, res, next) => {
      let a = req.get("user-agent")
      req.agent = (/breadboard/.test(a) ? "electron" : "web")
      next()
    })
    app.use(express.static(path.resolve(__dirname, 'public')))
    app.use("/docs", express.static(path.resolve(__dirname, 'docs')))
    app.use(express.json());

    app.set('view engine', 'ejs');
    app.set('views', path.resolve(__dirname, "views"))
    app.get("/", async (req, res) => {
      let sync_mode = (req.query.synchronize ? req.query.synchronize : this.default_sync_mode)
      let sync_folder = (req.query.sync_folder ? req.query.sync_folder : "")
      if (req.query && req.query.sorter_code) {
        this.current_sorter_code = req.query.sorter_code
      }
      res.render("index", {
        agent: req.agent,
        platform: process.platform,
        query: req.query,
        version: this.VERSION,
        sync_mode,
        sync_folder,
        need_update: this.need_update,
        current_sorter_code: this.current_sorter_code,
        theme: this.ipc.theme
      })
      if (this.default_sync_mode) this.default_sync_mode = false   // disable sync after the first time at launch
    })
    app.get('/stream', (req, res, next) => {
      res.flush = () => {}; 
      next();
    }, this.ipc.sse.init);
    app.get("/settings", (req, res) => {
      res.render("settings", {
        agent: req.agent,
        platform: process.platform,
        version: this.VERSION,
        query: req.query,
        theme: this.ipc.theme
      })
    })
    app.get("/connect", (req, res) => {
      res.render("connect", {
        agent: req.agent,
        config: this.config.config,
        platform: process.platform,
        version: this.VERSION,
        query: req.query,
        theme: this.ipc.theme
      })
    })
    app.get("/favorites", (req, res) => {
      res.render("favorites", {
        agent: req.agent,
        platform: process.platform,
        version: this.VERSION,
        theme: this.ipc.theme
      })
    })
    app.get('/file', (req, res) => {
      res.sendFile(req.query.file)
    })
    app.post("/ipc", async (req, res) => {
      let name = req.body.name
      let args = req.body.args
      let r = await this.ipc.call(name, ...args)
      if (r) {
        res.json(r)
      } else {
        res.json({})
      }
    })
    app.listen(this.port, () => {
      console.log(`Breadboard listening on port ${this.port}`)
    })
    this.app = app
  }
  async updateCheck () {
    const releaseFeed = "https://github.com/cocktailpeanut/breadboard/releases.atom"
    const releaseURL = "https://github.com/cocktailpeanut/breadboard/releases"
    const updater = new Updater()
    let res = await updater.check(releaseFeed)
    console.log("Feed", res)
    if (res.feed && res.feed.entry) {
      let latest = (Array.isArray(res.feed.entry) ? res.feed.entry[0] : res.feed.entry)
      if (latest.title === this.VERSION) {
        console.log("UP TO DATE", latest.title, this.VERSION)
      } else {
        console.log("Need to update to", latest)
        this.need_update = {
          $url: releaseURL,
          latest
        }
      }
    }
  }
}
module.exports = Breadpress
