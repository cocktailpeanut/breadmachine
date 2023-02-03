class DB {
  constructor(api) {
    this.api = api
    this.domparser = new DOMParser()
  }
  async init() {
    await this.init_db()
    await this.init_live()
    this.api.listen(async (_event, value) => {
      console.log("live mode", this.live)
      console.log("value", value)
      if (this.live) {
        if (value.method) {
          if (value.method === "new") {
            for(let meta of value.params) {
              queueMicrotask(async () => {
                // only insert and notify
                let response = await this.insert(meta).catch((e) => {
                  console.log("ERROR", e)
                })
                this.notify()
              })
            }
          }
        }
      }
    })
  }
  async init_live() {
    let live = await this.user.settings.where({ key: "live" }).first()
    if (live) {
      this.live = live.val
    } else {
      this.live = true
    }
    if (this.live) {
      document.querySelector("#live-option i").classList.add("fa-beat")
      document.querySelector("#live-option").classList.add("bold")
    } else {
      document.querySelector("#live-option i").classList.remove("fa-beat")
      document.querySelector("#live-option").classList.remove("bold")
    }
    document.querySelector("#live-option span").innerHTML = `&nbsp;&nbsp;LIVE ${this.live ? "ON" : "OFF"}`
    document.querySelector("#live-option").addEventListener("click", async (e) => {
      this.live = !this.live 
      await this.user.settings.put({ key: "live", val: this.live })
      document.querySelector("#live-option span").innerHTML = `&nbsp;&nbsp;LIVE ${this.live ? "ON" : "OFF"}`
      if (this.live) {
        document.querySelector("#live-option i").classList.add("fa-beat")
        document.querySelector("#live-option").classList.add("bold")
      } else {
        document.querySelector("#live-option i").classList.remove("fa-beat")
        document.querySelector("#live-option").classList.remove("bold")
      }
    })
  }
  notify() {
    if (!this.notify_audio) {
      this.notify_audio = new Audio('pop.mp3');
    }
    this.notify_audio.play();
  }
  async insert (o) {
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

    // don't update checkpoints for listener => always re-sync on startup just in case listener misses stuff

  }
  async init_db () {
    // upgrade from legacy db schema (breadboard => data + user)
    // 1. The "data" DB only contains attributes that can be crawled from the files
    this.db = new Dexie("data")
    this.db.version(2).stores({
      files: "file_path, agent, model_name, model_hash, root_path, prompt, btime, mtime, width, height, *tokens, seed, cfg_scale, steps",
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
  stripPunctuation (str) {
    return str
      .replaceAll("&quot;", " ")
      .replace(/[.,\/#!$%\^&\*;:\[\]{}=\-_`"~()\\\|+]/g, " ")
      .replace(/\s{2,}/g, " ");
  }
}
