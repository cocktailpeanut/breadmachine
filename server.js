const xmlFormatter = require('xml-formatter');
const path = require('path')
const express = require('express')
const getport = require('getport')
const Updater = require('./updater/index')
const packagejson = require('./package.json')
const IPC = require('./ipc')
class Server {
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
        platform: process.platform,
        version: this.VERSION,
        query: req.query,
        theme: this.ipc.theme
      })
    })
    app.get("/favorites", (req, res) => {
      res.render("favorites", {
        platform: process.platform,
        version: this.VERSION,
        theme: this.ipc.theme
      })
    })
    app.get("/help", (req, res) => {
      let items = [{
        name: "discord",
        description: "ask questions and share feedback",
        icon: "fa-brands fa-discord",
        href: "https://discord.gg/6MJ6MQScnX"
      }, {
        name: "twitter",
        description: "stay updated on Twitter",
        icon: "fa-brands fa-twitter",
        href: "https://twitter.com/cocktailpeanut"
      }, {
        name: "github",
        description: "feature requests and bug report",
        icon: "fa-brands fa-github",
        href: "https://github.com/cocktailpeanut/breadboard/issues"
      }]
      res.render("help", {
        items,
        platform: process.platform,
        version: this.VERSION,
        theme: this.ipc.theme
      })
    })
    app.get('/file', (req, res) => {
      res.sendFile(req.query.file)
    })
    app.post("/ipc", async (req, res) => {
      console.log("post ipc", req.body)
      let name = req.body.name
      let args = req.body.args
      console.log("name", name)
      console.log("args", args)
      let r = await this.ipc.call(name, ...args)
      console.log("r", r)
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
module.exports = Server
