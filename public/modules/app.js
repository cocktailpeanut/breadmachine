const debounce = (callback, wait) => {
  let timeoutId = null;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      callback.apply(null, args);
    }, wait);
  };
}
class App {
  constructor (query, sorter_code, need_update, sync_mode, sync_folder, api) {
    this.api = api
    this.query = query
    this.sorter_code = sorter_code
    this.sync_mode = sync_mode
    this.sync_folder = sync_folder
    this.checkpoints = { }
    this.selection = new Selection(this, api)
    this.navbar = new Navbar(this);
    if (need_update) {
      this.navbar.notification(need_update)
    }
    this.handler = new Handler(this, api);
    this.zoomer = new Zoomer(this)
    if (!this.bar) {
      this.bar = new Nanobar({
        target: document.querySelector("#bar")
      });
    }
    this.domparser = new DOMParser()
    hotkeys.filter = function(event){
      let target = event.target || event.srcElement;
      if (target.closest(".tagger")) {
        return false
      }
      return true;
    }
    hotkeys("ctrl+t,cmd+t,ctrl+n,cmd+n", (e) => {
      window.open("/", "_blank", "popup")
    })

    this.debounced_update = debounce(this.prepend_update.bind(this), 1000)
  }
  async init_live() {
    let live = await this.user.settings.where({ key: "live" }).first()
    let sound = await this.user.settings.where({ key: "sound" }).first()
    if (live) {
      this.live = live.val
    } else {
      this.live = true
    }
    if (sound) {
      this.sound = sound.val
    } else {
      this.sound = true
    }
    if (this.live) {
      document.querySelector("#live-option i").classList.add("fa-spin")
      document.querySelector("#live-option").classList.add("bold")
      document.querySelector("#live-option").classList.add("active")
    } else {
      document.querySelector("#live-option i").classList.remove("fa-spin")
      document.querySelector("#live-option").classList.remove("bold")
      document.querySelector("#live-option").classList.remove("active")
    }


    tippy(document.querySelector("#live-option"), {
      interactive: true,
      trigger: "click",
      allowHTML: true,
      placement: "bottom-end",
      content: `<div class='menu-popup'>
      <div class='menu-item play-option'><i class="fa-solid ${this.live ? 'fa-pause' : 'fa-play'}"></i><span>${this.live ? 'pause' : 'play'}</span></div>
      <hr>
      <div class='menu-item sound-option'><i class="fa-solid ${this.sound ? 'fa-volume-xmark' : 'fa-volume-high'}"></i><span>${this.sound ? 'turn off sound' : 'turn on sound'}</span></div>
</div>`,
      onHidden: (instance) => {
        instance.popper.querySelector(".play-option").removeEventListener("click", instance.extended_handlers.liveHandler)
        instance.popper.querySelector(".sound-option").removeEventListener("click", instance.extended_handlers.soundHandler)
      },
      onShown: (instance) => {
        const liveHandler = async (e) => {
          this.live = !this.live 
          await this.user.settings.put({ key: "live", val: this.live })
          if (this.live) {
            document.querySelector("#live-option i").classList.add("fa-spin")
            document.querySelector("#live-option").classList.add("bold")
            document.querySelector("#live-option").classList.add("active")
            instance.popper.querySelector(".play-option i").classList.remove("fa-play")
            instance.popper.querySelector(".play-option i").classList.add("fa-pause")
            instance.popper.querySelector(".play-option span").innerHTML = "pause"
          } else {
            document.querySelector("#live-option i").classList.remove("fa-spin")
            document.querySelector("#live-option").classList.remove("bold")
            document.querySelector("#live-option").classList.remove("active")
            instance.popper.querySelector(".play-option i").classList.remove("fa-pause")
            instance.popper.querySelector(".play-option i").classList.add("fa-play")
            instance.popper.querySelector(".play-option span").innerHTML = "play"
          }
          await this.subscribe()
        }
        const soundHandler = async (e) => {
          this.sound = !this.sound
          await this.user.settings.put({ key: "sound", val: this.sound })
          if (this.sound) {
            instance.popper.querySelector(".sound-option i").classList.remove("fa-volume-high")
            instance.popper.querySelector(".sound-option i").classList.add("fa-volume-xmark")
            instance.popper.querySelector(".sound-option span").innerHTML = "turn off sound"
          } else {
            instance.popper.querySelector(".sound-option i").classList.remove("fa-volume-xmark")
            instance.popper.querySelector(".sound-option i").classList.add("fa-volume-high")
            instance.popper.querySelector(".sound-option span").innerHTML = "turn on sound"
          }
        }
        instance.popper.querySelector(".play-option").addEventListener("click", liveHandler)
        instance.popper.querySelector(".sound-option").addEventListener("click", soundHandler)
        instance.extended_handlers = {
          liveHandler,
          soundHandler
        }
      }
    });

  }
  async init () {
    console.log("INIT", VERSION)
    this.selector = new TomSelect("nav select#sorter", {
      onDropdownClose: () => {
        this.selector.blur()
      }
    })
    await this.init_db()
    if (this.api.config.agent === "electron") {
      await this.init_pin()
    }
    this.init_rpc()
    this.init_minimize()
    await this.bootstrap()
    document.querySelector(".search-box .search").focus()
  }
  async init_db () {
    // upgrade from legacy db schema (breadboard => data + user)
    // 1. The "data" DB only contains attributes that can be crawled from the files
    this.db = new Dexie("data")
    this.db.version(2).stores({
      files: "file_path, agent, model_name, model_hash, root_path, prompt, btime, mtime, width, height, *tokens, seed, cfg_scale, steps, aesthetic_score",
    })

    // 2. The "user" DB contains attributes that can NOT be crawled from the files
    this.user = new Dexie("user")
    this.user.version(1).stores({
      folders: "&name",
      checkpoints: "&root_path, btime",
      settings: "key, val",
      favorites: "query, global"
    })

    let legacy_exists
    try {
      legacy_exists = await Dexie.exists("breadboard")
    } catch (e) {
      console.log("ERROR", e)
    }
    if (legacy_exists) {
      // should only trigger once when upgrading

      // must reindex after updating => all the files must be re-indexed
      this.sync_mode = "reindex"

      // if legacy db exists, delete it
      let legacy_db = new Dexie("breadboard")
      legacy_db.version(1).stores({
        files: "file_path, agent, model_name, root_path, prompt, btime, mtime, width, height, *tokens",
        folders: "&name",
        checkpoints: "&root_path, btime",
        settings: "key, val",
        favorites: "query"
      })
      
      let previous_version
      try {
        let ver = await legacy_db.settings.where({ key: "version" }).first()
        if (ver) {
          previous_version = ver.val
        } else {
          previous_version = "0.0.0"
        }
      } catch (e) {
        previous_version = "0.0.0"
      }

      if (previous_version === "0.0.0") {
        // if it's 0.0.0
        // Just reset everything and recrawl
        let folders = await legacy_db.folders.toArray()
        await this.user.folders.bulkPut(folders)
      } else {
        // if it's 0.1.0 or 0.2.0
        // No need to declare version. Just read from the old DB and migrate to the "data" and "user" dbs
        // 3. Migrate the "folders", "checkpoints", "settings", "favorites" table to the user table
        let files = await legacy_db.files.toArray()
        let folders = await legacy_db.folders.toArray()
        let checkpoints = await legacy_db.checkpoints.toArray()
        let settings = await legacy_db.settings.toArray()
        let favorites = await legacy_db.favorites.toArray()
        // Only replicate folders and settings,  do NOT replicate checkpoint => checkpoint must be null when reindexing
        await this.user.folders.bulkPut(folders)
        await this.user.settings.bulkPut(settings)

        let fav = favorites.map((f) => {
          return {
            query: f.query,
            global: 0
          }
        })
        await this.user.favorites.bulkPut(fav)
      }
      await legacy_db.delete()

    }

    // Set up db with defaults and version
    await this.user.settings.put({ key: "version", val: VERSION })

//    // bootstrap the DB with defaults (only the first time)
//    let defaults = await this.api.defaults()
//    for(let d of defaults) {
//      await this.user.folders.put({ name: d }).catch((e) => { })
//    }

    try {
      await this.persist()
    } catch (e) {
      console.log("persist error", e)
    }

  }
  async persist() {
    if (!navigator.storage || !navigator.storage.persisted) {
      return "never";
    }
    let persisted = await navigator.storage.persisted();
    if (persisted) {
      return "persisted";
    }
    if (!navigator.permissions || !navigator.permissions.query) {
      return "prompt"; // It MAY be successful to prompt. Don't know.
    }
    const permission = await navigator.permissions.query({
      name: "persistent-storage"
    });
    if (permission.state === "granted") {
      persisted = await navigator.storage.persist();
      if (persisted) {
        return "persisted";
      } else {
        throw new Error("Failed to persist");
      }
    }
    if (permission.state === "prompt") {
      return "prompt";
    }
    return "never";
  }
  async bootstrap () {
    await this.init_theme()
    await this.init_style()
    await this.init_zoom()
    await this.zoomer.init()
    this.init_worker()
    if (this.sync_mode === "default" || this.sync_mode === "reindex" || this.sync_mode === "reindex_folder") {
      await this.synchronize()
    } else {
      let height = `${window.innerHeight * 2}px`;
      this.observer = new IntersectionObserver(async entries => {
        let entry = entries[0]
        if (entry.intersectionRatio > 0) {
          this.offset = this.offset + 1
          await this.draw()
        }
      }, {
        root: document.querySelector(".container"),
        rootMargin: height
      });
      this.offset = 0
      await this.draw()
    }
    await this.navbar.view_mode()
    await this.init_live()
    await this.subscribe()
  }
  async insert (o, options) {
    let tokens = []
    let wordSet = {}
    if (o.prompt && typeof o.prompt === 'string' && o.prompt.length > 0) {
      let p = this.domparser.parseFromString(o.prompt, "text/html").documentElement.textContent;    // Escape XML-unsafe characters
      wordSet = this.stripPunctuation(p).split(/\s/).reduce(function (prev, current) {
        if (current.length > 0) prev[current] = true;
        return prev;
      }, {});
    }
    if (o.subject) {
      for(let k of o.subject) {
        wordSet["tag:" + k] = true
      }
    }
    tokens = Object.keys(wordSet);

    await this.db.files.put({ ...o, tokens })

    // options.silent:true => don't update the checkpoint
    // options.silent:false => update the checkpoint (default)
    if (options && options.silent) return

    if (this.checkpoints[o.root_path]) {
      if (this.checkpoints[o.root_path] < o.btime) {
        await this.updateCheckpoint(o.root_path, o.btime)
      }
    } else {
      let cp = await this.user.checkpoints.where({ root_path: o.root_path }).first()   
      if (cp) {
        if (cp && cp.btime < o.btime) {
          await this.updateCheckpoint(o.root_path, o.btime)
        }
      } else {
        await this.updateCheckpoint(o.root_path, o.btime)
      }
    }

  }
  async checkpoint (root_path) {
    let cp = await this.user.checkpoints.where({ root_path }).first()
    if (cp) return cp.btime
    else return null
  }
  async updateCheckpoint (root_path, btime) {
    let cp = await this.user.checkpoints.put({ root_path, btime })
    this.checkpoints[root_path] = btime
  }
  notify() {
    if (this.sound) {
      if (!this.notify_audio) {
        this.notify_audio = new Audio('pop.mp3');
      }
      this.notify_audio.play();
    }
  }
  prepend_update() {
    let x = document.querySelector(`.card`)
    let first = document.querySelector(`.card tr[data-key='${this.navbar.sorter.column}'] .copy-text`)
    let checkpoint = (first ? first.getAttribute("data-value") : null)
    this.worker.postMessage({
      query: this.query,
      sorter: this.navbar.sorter,
      offset: 0,
      limit: 10,
      options: {
        checkpoint,
        prepend: true  
      }
    })
  }
  init_rpc() {
    this.api.listen(async (_event, value) => {
      if (value.method) {
        if (value.method === "new") {
          if (this.live) {
            for(let meta of value.params) {
              queueMicrotask(async () => {
                let response = await this.insert(meta, { silent: true }).catch((e) => {
                  console.log("ERROR", e)
                })
                this.debounced_update()
              })
            }
          }
        }
      } else {
        queueMicrotask(async () => {
          if (value.meta) {
            let response = await this.insert(value.meta).catch((e) => {
              console.log("ERROR", e)
            })
          }
          this.sync_counter++;
          if (this.sync_counter === value.total) {
            this.sync_complete = true
          }
          let ratio = value.progress/value.total
          this.bar.go(100*value.progress/value.total);
        })
      }
    })
  }
  init_minimize() {
    document.querySelector("#minimize").addEventListener("click", async (e) => {
      e.target.closest("nav").classList.toggle("minimized")
    })
  }
  async init_pin() {
    if (this.api.config && this.api.config.agent === "electron") {
      let res = await this.api.pinned()
      this.pinned = res.pinned
      if (this.pinned) {
        document.querySelector("#pin").classList.add("active")
      } else {
        document.querySelector("#pin").classList.remove("active")
      }
      document.querySelector("#pin").addEventListener("click", async (e) => {
        await this.api.pin()
        await this.init_pin()
      }, { once: true })
    }
  }
  async init_zoom () {
    let zoom = await this.user.settings.where({ key: "zoom" }).first()
    if (zoom) {
      this.zoom = parseInt(zoom.val)
    }
  }
  async init_theme () {
    this.theme = await this.user.settings.where({ key: "theme" }).first()
    if (!this.theme) this.theme = { val: "default" }
    document.body.className = this.theme.val
    document.querySelector("html").className = this.theme.val
    this.api.theme(this.theme.val)
  }
  async init_style () {
    let aspect_ratio = await this.user.settings.where({ key: "aspect_ratio" }).first()
    let fit = await this.user.settings.where({ key: "fit" }).first()
    let expanded_width = await this.user.settings.where({ key: "expanded_width" }).first()
    let image_width = await this.user.settings.where({ key: "image_width" }).first()
    let recycle = await this.user.settings.where({ key: "recycle" }).first()
    this.style = {
      aspect_ratio: (aspect_ratio ? aspect_ratio.val : 100),
      fit: (fit ? fit.val : "contain"),
      expanded_width: (expanded_width ? expanded_width.val : 33),
      image_width: (image_width ? image_width.val : 50),
      recycle: (recycle ? recycle.val : true)
    }
    document.body.style.setProperty("--card-aspect-ratio", `${this.style.aspect_ratio}`)
    document.body.style.setProperty("--card-fit", `${this.style.fit}`)
    document.body.style.setProperty("--expanded-width", `${this.style.expanded_width}%`)
    document.body.style.setProperty("--image-width", `${this.style.image_width}%`)
    this.api.style(this.style)
  }
  init_worker () {
    if (!this.worker) {
      this.worker = new Worker("./worker.js")
      this.worker.onmessage = async (e) => {
        if (e.data.options) {
          if (e.data.options.prepend) {
            document.querySelector(".content-info").innerHTML = `<i class="fa-solid fa-check"></i> ${e.data.count}`
            if (e.data.res.length > 0) {
              let data = e.data.res.map((item) => {
                return `<div class='card' data-root="${item.root_path}" data-src="${item.file_path}">${card(item, this.stripPunctuation, this.style.recycle)}</div>`
              })
              if (this.style.recycle) {
                let expanded = document.querySelectorAll(".expanded")
                let srcs = []

                // preserve the expanded items (data-src uris) before prepend
                for(let el of expanded) {
                  srcs.push(el.getAttribute("data-src"))
                }

                // Preserve the selected items (data-src uris) before prepend
                this.selected = this.selection.get()

                // prepend
                this.clusterize.prepend(data)
                setTimeout(() => {
                  this.clusterize.refresh(true)

                  // the selected items will be handled inside the clusterize initialization clusterChanged() callback

                  // re-apply the expanded
                  for(let src of srcs) {
                    document.querySelector(`.card[data-src='${src}']`).classList.add("expanded")
                  }

                }, 100)
              } else {
                let fragment = document.createDocumentFragment();
                let template = document.createElement('template');
                template.innerHTML = data.join("")
                document.querySelector(".content").prepend(template.content)
                this.selection.init()
              }
              this.notify()
            }
          }
        } else {
          if (e.data.res.length > 0) {
            await this.fill(e.data)
            document.querySelector("#sync").classList.remove("disabled")
            document.querySelector("#sync").disabled = false
            document.querySelector("#sync i").classList.remove("fa-spin")
            this.selection.init()
            this.zoomer.resized()
          } else {
            await this.fill(e.data)
            // if this.query is null => we're on the home page
            // if homepage, and no result, tell people to connect some folders
            if (this.offset === 0) {
              if (!this.query) {
                document.querySelector(".empty-container").innerHTML = `Connect a folder to get started.<br><br>
    <a href="/connect" class='btn'><i class="fa-solid fa-plug"></i> Connect</a>`
              }
            }
            document.querySelector(".end-marker .caption i").classList.remove("fa-bounce")
          }
        }
      }
    }
  }
  async subscribe() {
    if (this.live) {
      let folderpaths = await this.user.folders.toArray()
      await this.api.subscribe(folderpaths.map(x => x.name))
    } else {
      await this.api.subscribe([])
    }
  }
  async synchronize (paths, cb) {
    document.querySelector("#sync").classList.add("disabled")
    document.querySelector("#sync").disabled = true
    document.querySelector("#sync i").classList.add("fa-spin")
    if (paths) {
      document.querySelector(".status").innerHTML = "synchronizing..."
      this.sync_counter = 0
      this.sync_complete = false
      await new Promise((resolve, reject) => {
        this.api.sync({ paths })
        let interval = setInterval(() => {
          if (this.sync_complete) {
            clearInterval(interval)
            resolve()
          }
        }, 1000)
      })
      if (cb) {
        await cb()
      }
    } else {
      if (this.sync_mode === "reindex" || this.sync_mode === "default" || this.sync_mode === "false") {
        let folderpaths = await this.user.folders.toArray()
        for(let folderpath of folderpaths) {
          let root_path = folderpath.name
          let c = await this.checkpoint(root_path)
          document.querySelector(".status").innerHTML = "synchronizing from " + root_path
          this.sync_counter = 0
          this.sync_complete = false
          await new Promise((resolve, reject) => {
            const config = {
              root_path,
              checkpoint: c,
            }
            if (this.sync_mode === "default") {
              // nothing
            } else if (this.sync_mode === "reindex") {
              config.force = true
            }
            this.api.sync(config)
            let interval = setInterval(() => {
              if (this.sync_complete) {
                clearInterval(interval)
                resolve()
              }
            }, 1000)
          })
        }
        this.sync_counter = 0
        document.querySelector(".status").innerHTML = ""
        this.bar.go(100)
        let query = document.querySelector(".search").value
        if (query && query.length > 0) {
          await this.search(query)
        } else {
          await this.search()
        }
      } else if (this.sync_mode === "reindex_folder" && this.sync_folder && this.sync_folder.length > 0) {
        document.querySelector(".status").innerHTML = "synchronizing from " + this.sync_folder
        this.sync_counter = 0
        this.sync_complete = false
        await new Promise((resolve, reject) => {
          const config = {
            root_path: this.sync_folder,
            force: true,
          }
          this.api.sync(config)
          let interval = setInterval(() => {
            if (this.sync_complete) {
              clearInterval(interval)
              resolve()
            }
          }, 1000)
        })
        this.sync_counter = 0
        document.querySelector(".status").innerHTML = ""
        this.bar.go(100)
        let query = document.querySelector(".search").value
        if (query && query.length > 0) {
          await this.search(query)
        } else {
          await this.search()
        }
      }
    }
  }
//  outerWidthMargin(el) {
//    var width = el.offsetWidth;
//    var style = getComputedStyle(el);
//    width += parseInt(style.marginLeft) + parseInt(style.marginRight);
//    return width;
//  }
//  width (el) {
//    return parseFloat(getComputedStyle(el, null).width.replace("px", ""))
//  }
//  height () {
//    const el = document.querySelector(".card:first-child")
//    let h = parseFloat(getComputedStyle(el, null).height.replace("px", ""))
//    let rows = this.rows() 
//    return h / rows
//  }
//  rows () {
//    const container = document.querySelector(".content")
//    const card = document.querySelector(".card:first-child")
//    return Math.floor(this.width(container) / this.outerWidthMargin(card));
//  }
  async fill ({ count, res }) {
    let items = res
    document.querySelector(".content-info").innerHTML = `<i class="fa-solid fa-check"></i> ${count}`
    document.querySelector(".status").innerHTML = "Loading..."
    let data = items.map((item) => {
      return `<div class='card' data-root="${item.root_path}" data-src="${item.file_path}">${card(item, this.stripPunctuation, this.style.recycle)}</div>`
    })

    if (this.style.recycle) {
      if (!this.clusterize) {
        this.clusterize = new Clusterize({
          scrollElem: document.querySelector(".container"),
          contentElem: document.querySelector(".content"),
          keep_parity: false,
          auto_adjust: false,
          // blocks_in_cluster: 3,
          rows_in_block: 5000,
          callbacks: {
            clusterChanged: () => {
              this.selection.init()
              if (this.selected && Array.isArray(this.selected)) {
                this.selection.set(this.selected)
              }
            }
          }
        });
      }
      if (items.length > 0) {
        this.clusterize.append(data)
        setTimeout(() => {
          this.clusterize.refresh(true)
        }, 100)
      }
    } else {
      if (items.length > 0) {
        let fragment = document.createDocumentFragment();
        let template = document.createElement('template');
        template.innerHTML = data.join("")
        document.querySelector(".content").appendChild(template.content)
      }
    }
    document.querySelector(".status").innerHTML = ""

    if (items.length > 0) {
      // start observing
      this.observer.unobserve(document.querySelector(".end-marker"));
      this.observer.observe(document.querySelector(".end-marker"));
    }

  }
  async draw () {
    document.querySelector(".search").value = (this.query && this.query.length ? this.query : "")
    if (this.query) {
      let favorited = await this.user.favorites.get(this.query)
      if (favorited) {
        document.querySelector("nav #favorite").classList.add("selected") 
        document.querySelector("nav #favorite i").className = "fa-solid fa-star"
      } else {
        document.querySelector("nav #favorite").classList.remove("selected") 
        document.querySelector("nav #favorite i").className = "fa-regular fa-star"
      }
    } else {
      document.querySelector("nav #favorite").classList.remove("selected") 
      document.querySelector("nav #favorite i").className = "fa-regular fa-star"
    }
    this.worker.postMessage({ query: this.query, sorter: this.navbar.sorter, offset: this.offset, limit: 500, options: null })

  }
  async search (query, options) {
    let params = new URLSearchParams({ sorter_code: this.sorter_code })
    if (query && query.length > 0) {
      params.set("query", query)
    }
    let newWin = hotkeys.isPressed("ctrl") || hotkeys.isPressed("cmd")
    if (newWin) {
      window.open("/?" + params.toString(), "_blank", "popup")
    } else {
      location.href = "/?" + params.toString()
    }
  }
  stripPunctuation (str) {
    return str
      .replaceAll("&quot;", " ")
      .replace(/[.,\/#!$%\^&\*;:\[\]{}=\-_`"~()\\\|+]/g, " ")
      .replace(/\s{2,}/g, " ");
  }

}

let QUERY
if (document.querySelector("#query")) {
  QUERY = document.querySelector("#query").getAttribute("data-value")
}
console.log("QUERY", QUERY)

const api = new API({ agent: AGENT });
const app = new App(QUERY, SORTER, NEED_UPDATE, SYNC_MODE, SYNC_FOLDER, api);
(async () => {
  await app.init()
})();
