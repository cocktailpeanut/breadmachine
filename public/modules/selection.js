class Selection {
  constructor (app, api) {
    this.els = []
    this.app = app
    this.api = api
    this.addTagInput = document.querySelector('#add-tag-field')
    this.addtags = tagger(this.addTagInput, {
      allow_duplicates: false,
//      allow_spaces: false,
      add_on_blur: true,
      wrap: true,
    });
    this.removeTagInput = document.querySelector('#remove-tag-field')
    this.removetags = tagger(this.removeTagInput, {
      allow_duplicates: false,
//      allow_spaces: false,
      add_on_blur: true,
      wrap: true,
    });
//    this.init()

    hotkeys("shift+left,shift+up", (e) => {
      if (this.inputFocused(e)) {
        return
      }
      if (this.els && this.els.length > 0) {
        let prev = this.els[0].previousSibling
        if (prev) {
          e.preventDefault()
          e.stopPropagation()
          this.els = [prev].concat(this.els)
          this.ds.setSelection(this.els)
          prev.scrollIntoView({ behavior: "smooth", block: "end" })
          this.update(this.els)
        }
      }
    })
    hotkeys("shift+right,shift+down", (e) => {
      if (this.inputFocused(e)) {
        return
      }
      if (this.els && this.els.length > 0) {
        let next = this.els[this.els.length-1].nextSibling
        if (next) {
          e.preventDefault()
          e.stopPropagation()
          this.els = this.els.concat(next)
          this.ds.setSelection(this.els)
          next.scrollIntoView({ behavior: "smooth", block: "start" })
          this.update(this.els)
        }
      }
    })
    hotkeys("left,up", (e) => {
      if (this.inputFocused(e)) {
        return
      }
      if (this.els && this.els.length > 0) {
        e.preventDefault()
        e.stopPropagation()
        this.prev(e)
      }
    })
    hotkeys("right,down", (e) => {
      if (this.inputFocused(e)) {
        return
      }
      if (this.els && this.els.length > 0) {
        e.preventDefault()
        e.stopPropagation()
        this.next(e)
      }
    })
    hotkeys("space", async (e) => {
      if (this.inputFocused(e)) {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      if (this.els && this.els.length > 0) {
        if (this.app.handler.viewer && this.app.handler.viewer.isShown) {
          this.app.handler.unview()
        } else {
          this.app.handler.view(this.els[0])
        }
      }
    })
    hotkeys("delete,backspace", async (e) => {
      if (this.inputFocused(e)) {
        return
      }
      await this.del()
    })
    hotkeys("escape", (e) => {
      if (this.app.handler.viewer && this.app.handler.viewer.isShown) {
        // viewer mode, don't deselect items
        return
      }
      for(let el of this.els) {
        el.classList.remove("expanded")
        el.classList.remove("fullscreen")
      }
      this.els = []
      this.ds.setSelection(this.els)
      this.update(this.els)
    })
    hotkeys("enter", (e) => {
      if (this.els && this.els.length > 0) {
        let target = this.els[0]
        if (target) {
          e.preventDefault()
          e.stopPropagation()
          target.classList.toggle("expanded")
          target.scrollIntoView({ behavior: "smooth", block: "end" })
        }
      }
    })
    hotkeys("ctrl+a,cmd+a", (e) => {
      if (this.inputFocused(e)) {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      this.els = Array.from(document.querySelectorAll(".card"))
      this.ds.setSelection(this.els)
      this.update(this.els)
    })
    document.querySelector(".container").onmouseout = (event) => {
      if (this.ds && this.ds.stopped) {
        this.ds.start()
      }
    }


    document.querySelector(".container").ondragstart = (event) => {
      event.preventDefault()
      event.stopPropagation()
      let draggingTarget = (event.target.classList.contains(".card") ? event.target : event.target.closest(".card"))
      let multiselecting = this.ds.isMultiSelect(event)
      let dragging = this.ds.isDragging(event)
      if (this.els.length > 0) {
        if (this.els.includes(draggingTarget)) {
          if (this.api.config && this.api.config.agent === "electron") {
            this.ds.stop()
            let filenames = this.els.map((el) => {
              return el.querySelector("img").getAttribute("data-src")
            })
            this.ds.setSelection(this.els)
            this.api.startDrag(filenames)
          }
        } else {
          if (!multiselecting) {
            this.ds.setSelection([draggingTarget])
            this.update([draggingTarget])
          }
        }
      }
    }

    document.querySelector("#cancel-selection").addEventListener("click", async (e) => {
      this.ds.setSelection([])
      this.update([])
    })
    document.querySelector("#tag-menu").addEventListener("click", async (e) => {
      e.preventDefault()
      e.stopPropagation()
      document.querySelector(".tag-menu-items").classList.toggle("hidden")
      document.querySelector(".tag-menu-collapsed").classList.toggle("hidden")
      document.querySelector(".tag-menu-expanded").classList.toggle("hidden")
    })
    document.querySelector("#remove-tags").addEventListener("click", async (e) => {
      let tags = this.removeTagInput.value.split(",")
      let selected = this.els.map((el) => {
        return el.getAttribute("data-src")
      })
      let response = await this.api.gm({
        path: "user",
        cmd: "set",
        args: [
          selected,
          {
            "dc:subject": tags.map((tag) => {
              return {
                val: tag,
                mode: "delete"
              }
            })
          }
        ]
      })
      let paths = this.els.map((el) => {
        return {
          file_path: el.getAttribute("data-src"),
          root_path: el.getAttribute("data-root")
        }
      })
      await this.app.synchronize(paths, async () => {
        document.querySelector("footer").classList.add("hidden")
        this.els = []
        document.querySelector(".status").innerHTML = ""
        let query = document.querySelector(".search").value
        if (query && query.length > 0) {
          await this.app.search(query)
        } else {
          await this.app.search()
        }
        bar.go(100)
      })
    })
    document.querySelector("#save-tags").addEventListener("click", async (e) => {

      let tags = this.addTagInput.value.split(",")
      let selected = this.els.map((el) => {
        return el.getAttribute("data-src")
      })
      let response = await this.api.gm({
        path: "user",
        cmd: "set",
        args: [
          selected,
          {
            "dc:subject": [{
              val: tags,
              mode: "merge"
            }]
          }
        ]
      })
      let items = tags.map((x) => {
        if (x.split(" ").length > 1) {
          return `tag:"${x}"`
        } else {
          return "tag:" + x
        }
      })
      let paths = this.els.map((el) => {
        return {
          file_path: el.getAttribute("data-src"),
          root_path: el.getAttribute("data-root")
        }
      })
      await this.app.synchronize(paths, async () => {
        document.querySelector("footer").classList.add("hidden")
        this.els = []
        document.querySelector(".status").innerHTML = ""
        let query = items.join(" ")
        if (query && query.length > 0) {
          await this.app.search(query)
        } else {
          await this.app.search()
        }
        this.app.bar.go(100)
      })

    })
    document.querySelector("#delete-selected").addEventListener("click", async (e) => {
      await this.del()
    })
    document.querySelector("#refresh-selected").addEventListener("click", async (e) => {
      await this.refresh()
    })
  }
  #isFavorite(el) {
    return el.querySelector(`button.favorite-file`)?.getAttribute(`data-favorited`) === "true"
  }
  init () {
    //if (this.ds) this.ds.stop()
    if (this.ds) {
      this.ds.setSettings({
        selectables: document.querySelectorAll('.card'),
        area: document.querySelector(".content"),
        draggability: false,
      })
    } else {
      this.ds = new DragSelect({
        selectables: document.querySelectorAll('.card'),
        area: document.querySelector(".content"),
        draggability: false,
      });
      this.ds.subscribe('callback', async (e) => {
        if (e.items && e.items.length > 0) {
          // reset tags
          this.update(e.items)
        } else {
          this.els = []
          document.querySelector("footer").classList.add("hidden")
        }
      });
//      this.ds.subscribe("dragstart", async (e) => {
//      })
    }
  }
  recover() {
    let srcs = this.els.map((el) => {
      return el.getAttribute("data-src")
    })
    this.set(srcs)
  }
  get() {
    let selection = this.ds.getSelection()
    console.log("#selection", selection)
    return selection.map((el) => {
      return el.getAttribute("data-src")
    })
  }
  set(srcs) {
    console.log("set", JSON.stringify(srcs, null, 2))
    this.els = srcs.map((src) => {
      return document.querySelector(`[data-src='${CSS.escape(src)}']`)
    }).filter((x) => {
      return x
    })
    console.log("this.els = ", this.els)
    this.ds.setSelection(this.els)
  }
  async refresh() {
    let paths = this.els.map((el) => {
      return {
        file_path: el.getAttribute("data-src"),
        root_path: el.getAttribute("data-root")
      }
    })
    await this.app.synchronize(paths, async () => {
      document.querySelector("footer").classList.add("hidden")
      this.els = []
      document.querySelector(".status").innerHTML = ""
      let query = document.querySelector(".search").value
      if (query && query.length > 0) {
        await this.app.search(query)
      } else {
        await this.app.search()
      }
      bar.go(100)
    })
  }
  async del() {
    const confirmed = confirm(`Delete the selected files from your device (liked files are skipped)?`)
    if (confirmed) {
      let filteredSelection = this.els.filter((el) => !this.#isFavorite(el))
      let filesToDelete = filteredSelection.map((el) => el.getAttribute("data-src"))
      await this.api.del(filesToDelete)
      let res = await this.app.db.files.where("file_path").anyOf(filesToDelete).delete()

      // get the next element to focus after deleting

      let focusEl = this.els[this.els.length-1].nextSibling
      if (!focusEl) {
        focusEl = this.els[0].previousSibling
      }
      for(let el of filteredSelection) {
        el.classList.remove("expanded")
        el.classList.add("removed")
        setTimeout(() => {
          el.remove()
        }, 1000)
      }

      console.log("focusEl", focusEl)
      if (focusEl) {
        if (this.app.handler.viewer && this.app.handler.viewer.isShown) {
          this.app.handler.view(focusEl)
        }
        this.els = [focusEl]
        this.ds.setSelection(this.els)
      } else {
        this.app.handler.unview()
        this.els = []
        this.ds.clearSelection()
        document.querySelector("footer").classList.add("hidden")
      }
    }
  }
  update (items) {
//    this.ds.setSelection(items)
    let addTagItems = this.addTagInput.value.split(",")
    for(let tagItem of addTagItems) {
      this.addtags.remove_tag(tagItem)
    }
    let removeTagItems = this.removeTagInput.value.split(",")
    for(let tagItem of removeTagItems) {
      this.removetags.remove_tag(tagItem)
    }
    document.querySelector(".selected-count .counter").innerHTML = items.length;
    this.els = items.filter((x) => {
      return x
    })
    if (items.length > 0) {
      document.querySelector("footer").classList.remove("hidden")
    } else {
      document.querySelector("footer").classList.add("hidden")
    }
  }
  inputFocused(e) {
    let target = e.target || e.srcElement;
    return target.closest(".tagger") || target.tagName.toLowerCase() === "input"
  }
  next(e) {
    let next = this.els[this.els.length-1].nextSibling
    if (next) {
      if (this.app.handler.viewer && this.app.handler.viewer.isShown) {
        this.app.handler.view(next)
      }
      this.els = [next]
      this.ds.setSelection(this.els)
      console.log("setSelection next", this.els)
      next.scrollIntoView({ behavior: "smooth", block: "end" })
      this.update(this.els)
      return true
    } else {
      return false
    }
  }
  prev(e) {
    let prev = this.els[0].previousSibling
    if (prev) {
      if (this.app.handler.viewer && this.app.handler.viewer.isShown) {
        this.app.handler.view(prev)
      }
      this.els = [prev]
      this.ds.setSelection(this.els)
      console.log("setSelection prev", this.els)
      prev.scrollIntoView({ behavior: "smooth", block: "end" })
      this.update(this.els)
      return true
    } else {
      return false
    }
  }
}
