//function debounce(func, timeout = 1000){
//  let timer;
//  return (...args) => {
//    clearTimeout(timer);
//    timer = setTimeout(() => { func.apply(this, args); }, timeout);
//  };
//}
class Navbar {
  constructor(app) {
    this.app = app
    this.sorters = [{
      direction: -1,
      column: "btime",
      compare: 0, // numeric compare
    }, {
      direction: 1,
      column: "btime",
      compare: 0, // numeric compare
    }, {
      direction: -1,
      column: "mtime",
      compare: 0, // alphabetical compare
    }, {
      direction: 1,
      column: "mtime",
      compare: 0, // alphabetical compare
    }, {
      direction: 1,
      column: "prompt",
      compare: 1, // alphabetical compare
    }, {
      direction: -1,
      column: "prompt",
      compare: 1, // alphabetical compare
    }, {
      direction: -1,
      column: "width",
      compare: 0, // numeric compare
    }, {
      direction: 1,
      column: "width",
      compare: 0, // numeric compare
    }, {
      direction: -1,
      column: "height",
      compare: 0, // numeric compare
    }, {
      direction: 1,
      column: "height",
      compare: 0, // numeric compare
    }]
    this.sorter = this.sorters[this.app.sorter_code]
    this.sorter_code = parseInt(this.app.sorter_code)
    document.querySelector("#prev").addEventListener("click", (e) => {
      history.back()
    })
    document.querySelector("#next").addEventListener("click", (e) => {
      history.forward()
    })
    document.querySelector("#favorite").addEventListener("click", async (e) => {
      let query = document.querySelector(".search").value
      if (query && query.length > 0) {
        let exists = await this.app.user.favorites.get({ query })
        let favorited;
        if (exists) {
          await this.app.user.favorites.where({ query }).delete()
          favorited = false
        } else {
          await this.app.user.favorites.put({ query, global: 0 })
          favorited = true
        }
        if (favorited) {
          document.querySelector("nav #favorite").classList.add("selected") 
          document.querySelector("nav #favorite i").className = "fa-solid fa-star"
        } else {
          document.querySelector("nav #favorite").classList.remove("selected") 
          document.querySelector("nav #favorite i").className = "fa-regular fa-star"
        }
      }
    })
    document.querySelector("nav select#sorter").addEventListener("change", async (e) => {
      this.sorter_code = parseInt(e.target.value)
      this.app.sorter_code = this.sorter_code
      let query = document.querySelector(".search").value
      if (query && query.length > 0) {
        await this.app.search(query)
      } else {
        await this.app.search()
      }
    })
    document.querySelector("#sync").addEventListener('click', async (e) => {
      await this.app.synchronize()
    })
    document.querySelector(".search").addEventListener("keyup", (e) => {
      if (e.key === "Enter") {
        this.app.search(e.target.value)
      }
    })

  }
  preprocess_query (phrase) {
    let fp_re = /file_path:"(.+)"/g
    let mn_re = /model_name:"(.+)"/g
    let tag_re = /tag:"([^"]+)"/g
    let fp_placeholder = "file_path:" + Date.now()
    let mn_placeholder = "model_name:" + Date.now()
    let test = fp_re.exec(phrase)
    let fp_captured
    if (test && test.length > 1) {
      phrase = phrase.replace(fp_re, fp_placeholder)
      fp_captured = test[1]
    }
    test = mn_re.exec(phrase)
    let mn_captured
    if (test && test.length > 1) {
      phrase = phrase.replace(mn_re, mn_placeholder)
      mn_captured = test[1]
    }

    let tag_captured = {}
    let to_replace = []
    while(true) {
      let test = tag_re.exec(phrase)
      if (test) {
        let captured = test[1]
        let tag_placeholder = "tag:" + Math.floor(Math.random() * 100000)
        to_replace.push(tag_placeholder)
        tag_captured[tag_placeholder] = captured
      } else {
        break;
      }
    }
    let tag_re2 = /tag:"([^"]+)"/
    for(let tag_placeholder of to_replace) {
      phrase = phrase.replace(tag_re2, tag_placeholder)
    }

    let prefixes = phrase.split(" ").filter(x => x && x.length > 0)
    const converted = []
    for (let prefix of prefixes) {
      if (prefix.startsWith("model_name:")) {
        if (mn_captured) {
          converted.push(`model_name:"${prefix.replace(/model_name:[0-9]+/, mn_captured)}"`)
        } else {
          converted.push(prefix)
        }
      } else if (prefix.startsWith("file_path:")) {
        if (fp_captured) {
          converted.push(`file_path:"${prefix.replace(/file_path:[0-9]+/, fp_captured)}"`)
        } else {
          converted.push(prefix)
        }
      } else if (prefix.startsWith("tag:")) {
        if (tag_captured[prefix]) {
          converted.push(`tag:"${prefix.replace(/tag:[0-9]+/, tag_captured[prefix])}"`)
        } else {
          converted.push(prefix)
        }
      } else {
        converted.push(prefix)
      }
    }
    return converted
  }
  input (key, val) {
    // find the key in query
    let query = document.querySelector(".search").value

    let t = this.preprocess_query(query)
    //let t = query.split(" ").filter(x => x && x.length > 0)


    // find prompt search tokens (no :)
    let existingPromptTokens = []
    let existingAdvancedTokens = []


    let changed

    // 1. split the t array into existingPromptTokens and existingAdvancedTokens array
    for(let token of t) {
      if (/[^:]+:/.test(token)) {
        existingAdvancedTokens.push(token)
      } else {
        existingPromptTokens.push(token)
      }
    }

    let existingPrompts = JSON.stringify(existingPromptTokens)
    let existingAdvanced = JSON.stringify(existingAdvancedTokens)


    if (key === "prompt" || key === "-prompt") {
      // 2. if the 'key' filter is 'prompt'
        // find whether the 'val' is included in the existingPromptTokens array
        // if it is included, don't do anything
        // if it's not included, append it to existingPromptTokens array
      let exists
      // tag: doesn't need to be cleaned. only search keywords need to be cleaned
      let istag = /^-?tag:/.test(val)
      let cleaned = (istag ? val : this.app.stripPunctuation(val))
      for(let i=0; i<existingPromptTokens.length; i++) {
        let token = existingPromptTokens[i]
        if (token === cleaned) {
          exists = true
        }
      }
      if (key === "-prompt") {
        if (istag) {
          existingPromptTokens.push(cleaned)
        } else {
          existingPromptTokens.push("-:" + cleaned)
        }
      } else {
        existingPromptTokens.push(cleaned)
      }
    } else {
      // 3. if the 'key' filter is not 'prompt'
        // find whether the existingAdvancedTokens array contains any of the 'key' filter
        // if it does, replace the existingAdvancedTokens array with the new 'key' filter
        // if it doesn't, append the 'key' filter to the end of the existingAdvancedTokens array
      let exists
      for(let i=0; i<existingAdvancedTokens.length; i++) {
        let token = existingAdvancedTokens[i]
        if (token.startsWith(key + ":")) {
          existingAdvancedTokens[i] = key + ":" + val
          exists = true
        }
      }
      if (!exists) {
        existingAdvancedTokens.push(key + ":" + val) 
      }
    }



    let result = []
    for(let token of existingPromptTokens) {
      result.push(token)
    }
    for(let token of existingAdvancedTokens) {
      result.push(token)
    }

    if (existingPrompts === JSON.stringify(existingPromptTokens) && existingAdvanced === JSON.stringify(existingAdvancedTokens)) {
      // do nothing because they are identical before and after
    } else {
      // there's a change. re render
      let newQuery = result.join(" ")
      this.app.search(newQuery)
    }
      

  }
  notification(value) {
    let el = document.querySelector("#notification")
    el.classList.remove("hidden")
    tippy(el, {
      interactive: true,
      placement: "bottom-end",
      trigger: 'click',
      content: `<div class='notification-popup'>
  <div><a href='${value.$url}' id='get-update' target="_blank">Get update</a></div>
  <h2>${value.latest.title}</h2>
  <div>${value.latest.content}</div>
</div>`,
      allowHTML: true,
    });
  }
  view_mode() {
    tippy(document.querySelector("nav button#view-option"), {
      interactive: true,
      placement: "bottom-end",
      trigger: 'click',
      content: `<div class='view-option-popup'>
  <h3><i class="fa-solid fa-minimize"></i> Minimized</h3>
  <div class='row'>
    <div>zoom ${this.app.zoom}%</div>
    <div class='flex'>
      <input id='zoom-range' type='range' min="20" max="300" value="${this.app.zoom}" step="1">
    </div>
  </div>
  <br>
  <div class='row'>
    <div>height : width => ${this.app.style.aspect_ratio}%</div>
    <div class='flex'>
      <input id='aspect-range' type='range' min="20" max="300" value="${this.app.style.val}" step="1">
    </div>
  </div>
  <div class='row fit-selector'>
    <div>
      <input id='contain-mode' type='radio' name='fit' value='contain'>
      <label for='contain-mode'>contain</label>
    </div>
    <div>
      <input id='cover-mode' type='radio' name='fit' value='cover'>
      <label for='cover-mode'>cover</label>
    </div>
    <div>
      <input id='stretch-mode' type='radio' name='fit' value='stretch'>
      <label for='stretch-mode'>stretch</label>
    </div>
  </div>
  <hr>
  <h3><i class="fa-solid fa-maximize"></i> Expanded</h3>
  <div class='row'>
    <div>card_width : browser_width => ${this.app.style.expanded_width}%</div>
    <div class='flex'>
      <input id='expanded-width' type='range' min="10" max="100" value="${this.app.style.expanded_width}" step="1">
    </div>
  </div>
  <br>
  <div class='row'>
    <div>image_width : card_width => ${this.app.style.image_width}%</div>
    <div class='flex'>
      <input id='image-width' type='range' min="0" max="100" value="${this.app.style.image_width}" step="1">
    </div>
  </div>
  <hr>
  <h3><i class="fa-solid fa-recycle"></i> Recycle</h3>
  <div class='row recycle-check'>
    <div>
      <input id='recycled-view-check' type='radio' name='recycle-check' value='recycle'>
      <label for='recycled-view-check'><b>Recycled Views (Recommended):</b> More efficient and uses much less memory. <b>recommended</b> for most use cases.</label>
    </div>
    <div>
      <input id='not-recycled-view-check' type='radio' name='recycle-check' value='not-recycle'>
      <label for='not-recycled-view-check'><b>Non Recycled Views:</b> Loads all items without recycling. Useful for when you try to bulk select multiple items as you scroll, without worrying about hidden items being recycled. Because there is no recycling, it may use more memory as you load more items.</label>
    </div>
  </div>
</div>`,
      allowHTML: true,
      onShown: () => {
        document.querySelector(`#${this.app.style.fit}-mode`).checked = "checked"
        console.log("style", this.app.style)
        if (this.app.style.recycle) {
          document.querySelector("#recycled-view-check").checked = "checked"
        } else {
          document.querySelector("#not-recycled-view-check").checked = "checked"
        }
        document.querySelector("#zoom-range").addEventListener("input", async (e) => {
          e.preventDefault()
          e.stopPropagation()
          let zoom = parseInt(e.target.value)
          await this.app.user.settings.put({ key: "zoom", val: e.target.value })
          e.target.closest(".row").querySelector("div").innerHTML = "zoom " + e.target.value + "%"
          this.app.zoom = parseInt(e.target.value)
          this.app.zoomer.resized()
        })
        document.querySelector("#aspect-range").addEventListener("input", async (e) => {
          e.preventDefault()
          e.stopPropagation()
          let aspect_ratio = parseInt(e.target.value)
          e.target.closest(".row").querySelector("div").innerHTML = "height : width => " + e.target.value + "%"
          await this.app.user.settings.put({ key: "aspect_ratio", val: aspect_ratio })
          await this.app.init_style()
          if (this.app.clusterize) {
            this.app.clusterize.refresh(true)
          }
        })
        document.querySelector("#expanded-width").addEventListener("input", async (e) => {
          e.preventDefault()
          e.stopPropagation()
          let aspect_ratio = parseInt(e.target.value)
          e.target.closest(".row").querySelector("div").innerHTML = "card_width : browser_width => " + e.target.value + "%"
          await this.app.user.settings.put({ key: "expanded_width", val: aspect_ratio })
          await this.app.init_style()
        })
        document.querySelector("#image-width").addEventListener("input", async (e) => {
          e.preventDefault()
          e.stopPropagation()
          let aspect_ratio = parseInt(e.target.value)
          e.target.closest(".row").querySelector("div").innerHTML = "image_width : card_width => " + e.target.value + "%"
          await this.app.user.settings.put({ key: "image_width", val: aspect_ratio })
          await this.app.init_style()
        })
        document.querySelectorAll(".fit-selector input[type=radio]").forEach((el) => {
          el.addEventListener("change", async (e) => {
            await this.app.user.settings.put({ key: "fit", val: e.target.value })
            await this.app.init_style()
          })
        })
        document.querySelectorAll(".recycle-check input[type=radio]").forEach((el) => {
          el.addEventListener("change", async (e) => {
            let recycle = (e.target.value === "recycle")
            await this.app.user.settings.put({ key: "recycle", val: recycle })
            await this.app.init_style()
            location.href = location.href
          })
        })
      }
    });
  }
}
