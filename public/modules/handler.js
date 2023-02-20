class Handler {
  view(selectedCard) {
    let img = selectedCard.querySelector("img").cloneNode()
    let scaleFactor = Math.min(window.innerWidth / img.naturalWidth, window.innerHeight / img.naturalHeight)
    if (this.viewer) this.viewer.destroy()
    this.viewer = new Viewer(img, {
      transition: false,
      toolbar: {
        'zoomIn': true,
        'zoomOut': true,
        'reset': true,
        'play': true,
        'oneToOne': true,
        'rotateLeft': true,
        'rotateRight': true,
        'flipHorizontal': true,
        'flipVertical': true
      },
      viewed() {
        this.viewer.zoomTo(scaleFactor)
      },
      hidden() {
        this.viewer.destroy()
      }
    });
    this.viewer.show()
  }
  unview() {
    this.viewer.destroy()
  }
  constructor (app, api) {
    this.app = app
    this.api = api

    document.querySelector(".container").addEventListener("click", async (e) => {
      e.preventDefault()
      e.stopPropagation()
      let colTarget = (e.target.classList.contains(".col") ? e.target : e.target.closest(".col"))
      let fullscreenTarget = (e.target.classList.contains(".gofullscreen") ? e.target : e.target.closest(".gofullscreen"))
      let popupTarget = (e.target.classList.contains(".popup") ? e.target : e.target.closest(".popup"))
      let clipboardTarget = (e.target.classList.contains(".copy-text") ? e.target : e.target.closest(".copy-text"))
      let tokenTarget = (e.target.classList.contains(".token") ? e.target : e.target.closest(".token"))
      let tokenPopupTarget = (e.target.classList.contains(".popup-link") ? e.target : e.target.closest(".popup-link"))
      let grabTarget = (e.target.classList.contains(".grab") ? e.target : e.target.closest(".grab"))
      let openFileTarget = (e.target.classList.contains(".open-file") ? e.target : e.target.closest(".open-file"))
      let displayMetaTarget = (e.target.classList.contains(".view-xmp") ? e.target : e.target.closest(".view-xmp"))
      let favoriteFileTarget = (e.target.classList.contains(".favorite-file") ? e.target : e.target.closest(".favorite-file"))
      let card = (e.target.classList.contains("card") ? e.target : e.target.closest(".card"))
      if (card) card.classList.remove("fullscreen")
      if (fullscreenTarget) {
        //let img = fullscreenTarget.closest(".card").querySelector("img").cloneNode()
        //let img = fullscreenTarget.closest(".card").querySelector("img")
        let selectedCard = fullscreenTarget.closest(".card")
        this.view(selectedCard)
      } else if (openFileTarget) {
        this.api.open(openFileTarget.getAttribute("data-src"))
      } else if (popupTarget) {
        window.open(popupTarget.getAttribute("data-src"), "_blank", "popup,width=512")
      } else if (favoriteFileTarget) {
        let data_favorited = favoriteFileTarget.getAttribute("data-favorited")
        let is_favorited = (data_favorited === "true" ? true : false)
        let src = favoriteFileTarget.getAttribute("data-src")
        let root = favoriteFileTarget.closest(".card").querySelector("img").getAttribute("data-root")
        let favClass
        if (is_favorited) {
          // unfavorite
          let response = await this.api.gm({
            cmd: "set",
            args: [
              src,
              [{
                key: "dc:subject",
                val: ["favorite"],
                mode: "delete"
              }]
            ]
          })
          favoriteFileTarget.setAttribute("data-favorited", "false")
          favClass = "fa-regular fa-heart"

          // remove 'favorite' tag from the tags area
          favoriteFileTarget.closest(".card").querySelector("tr[data-key=tags] td span[data-tag='tag:favorite']").remove()
        } else {
          // favorite
          let response = await this.api.gm({
            cmd: "set",
            args: [
              src,
              [{
                key: "dc:subject",
                val: ["favorite"],
                mode: "merge"
              }]
            ]
          })
          favoriteFileTarget.setAttribute("data-favorited", "true")
          favClass = "fa-solid fa-heart"

          // add 'favorite' tag
          let span = document.createElement("span")
          span.setAttribute("data-tag", "tag:favorite")
          span.innerHTML = `<button data-value="tag:favorite" class='token tag-item'><i class="fa-solid fa-tag"></i> favorite</button>`
          favoriteFileTarget.closest(".card").querySelector("tr[data-key=tags] td.attr-val .content-text").appendChild(span)
        }
        favoriteFileTarget.querySelector("i").className = favClass

        await this.app.synchronize([{ file_path: src, root_path: root }], async () => {
          document.querySelector(".status").innerHTML = ""
          let sync_button = document.querySelector("#sync")
          if (sync_button) {
            sync_button.classList.remove("disabled")
            sync_button.disabled = false
            document.querySelector("#sync i").classList.remove("fa-spin")
          }
        })
      } else if (grabTarget) {
      } else if (tokenTarget && e.target.closest(".card.expanded")) {
        let key = tokenTarget.closest("tr").getAttribute("data-key")
        let val = tokenTarget.getAttribute("data-value")
        let popup_items = []
        if (key === "file_path" || key === "model_name" || key === "agent" || key === "controlnet_model" || key === "controlnet_module" ) {
          if (val.split(" ").length > 1) {
            val = `"${val}"`
          }
          if (key === "file_path") {
            popup_items = [
              `<span class='popup-link' data-key='${key}' data-value='${val}'>${val}</span>`,
              `<span class='popup-link' data-key='-${key}' data-value='${val}'><i class="fa-solid fa-not-equal"></i> ${val}</span>`
            ]
          }
        }

        if (key === "prompt") {
          popup_items = [
            `<span class='popup-link' data-key='${key}' data-value='${val}'>${val}</span>`,
            `<span class='popup-link' data-key='-${key}' data-value='${val}'><i class="fa-solid fa-not-equal"></i> ${val}</span>`
          ]
        }

        if (key === "tags") {
          if (val.split(" ").length > 1) {
            val = val.replace(/^tag:(.+)/, 'tag:"$1"')
          }
          popup_items = [
            `<span class='popup-link' data-key='prompt' data-value='${val}'>${val}</span>`,
            `<span class='popup-link' data-key='-prompt' data-value='-${val}'><i class="fa-solid fa-not-equal"></i> ${val}</span>`
          ]
        }

        if (key === "width" || key === "height" || key === "seed" || key === "cfg_scale" || key === "steps" || key === "aesthetic_score" || key === "controlnet_weight") {
          popup_items = [
            `<span class='popup-link' data-key='-${key}' data-value='${val}'>&lt;</span>`,
            `<span class='popup-link' data-key='-=${key}' data-value='${val}'>&lt;=</span>`,
            `<span class='popup-link' data-key='${key}' data-value='${val}'>${val}</span>`,
            `<span class='popup-link' data-key='+=${key}' data-value='${val}'>=&gt;</span>`,
            `<span class='popup-link' data-key='+${key}' data-value='${val}'>&gt;</span>`
          ]
        }

        if (popup_items.length > 0) {
          tippy(tokenTarget, {
            interactive: true,
  //          placement: "bottom-end",
            trigger: 'click',
            content: `<div class='token-popup'>${popup_items.join("")}</div>`,
            allowHTML: true,
          }).show();
        } else {
          this.app.navbar.input(key, val)
        }
      } else if (tokenPopupTarget) {
        let key = tokenPopupTarget.getAttribute("data-key")
        let val = tokenPopupTarget.getAttribute("data-value")
        this.app.navbar.input(key, val)
      } else if (displayMetaTarget) {
        let file_path = displayMetaTarget.getAttribute("data-src")
        let xml = await this.api.xmp(file_path)
        let textarea = displayMetaTarget.closest(".xmp").querySelector(".slot")
        textarea.classList.toggle("hidden")
        textarea.value = xml;
        textarea.style.height = "" + (textarea.scrollHeight + 2) + "px";
      } else if (colTarget && e.target.closest(".card.expanded")) {
        // if clicked inside the .col section when NOT expanded, don't do anything.
        // except the clipboard button
        // if the clicked element is the delete button, delete
        if (clipboardTarget) {
          this.api.copy(clipboardTarget.getAttribute("data-value"))
          clipboardTarget.querySelector("i").classList.remove("fa-regular")
          clipboardTarget.querySelector("i").classList.remove("fa-clone")
          clipboardTarget.querySelector("i").classList.add("fa-solid")
          clipboardTarget.querySelector("i").classList.add("fa-check")
          clipboardTarget.querySelector("span").innerHTML = "copied"

          setTimeout(() => {
            clipboardTarget.querySelector("i").classList.remove("fa-solid")
            clipboardTarget.querySelector("i").classList.remove("fa-check")
            clipboardTarget.querySelector("i").classList.add("fa-regular")
            clipboardTarget.querySelector("i").classList.add("fa-clone")
            clipboardTarget.querySelector("span").innerHTML = ""
          }, 3000)
        }
      } else {
        let target = (e.target.classList.contains("card") ? e.target : e.target.closest(".card"))
        if (target) {
          // don't make popup cards expandable
          if (target.classList.contains("popup-card")) {
            window.close()
            return
          }
          target.classList.toggle("expanded")
          if (target.classList.contains("expanded")) {
            //let img = target.querySelector("img").cloneNode()
            //let scaleFactor = Math.min(window.innerWidth / img.naturalWidth, window.innerHeight / img.naturalHeight)
            //if (this.viewer) this.viewer.destroy()
            //this.viewer = new Viewer(img, {
            //  transition: false,
            //  viewed() {
            //    this.viewer.zoomTo(scaleFactor)
            //  },
            //});

            // h4 truncate
            let h4 = target.querySelector("h4")
            target.addEventListener('transitionend', () => {
              let more = h4.parentNode.querySelector(".more")

              // clone node to remove any previously attached event listeners

              if (h4.offsetHeight < h4.scrollHeight || h4.offsetWidth < h4.scrollWidth) {
                console.log(h4, h4.offsetHeight, h4.scrollHeight)

                more.classList.remove("hidden") 

                let new_more= more.cloneNode(true);
                more.parentNode.replaceChild(new_more, more)

                new_more.addEventListener("click", (e) => {
                  h4.classList.toggle("expanded")
                  if (h4.classList.contains("expanded")) {
                    new_more.innerHTML = `<i class="fa-solid fa-angles-up"></i> view less`
                  } else {
                    new_more.innerHTML = `<i class="fa-solid fa-angles-down"></i> view more`
                  }
                })
              }

              // content-text truncate
              let contentTexts = target.querySelectorAll("[data-key$=prompt] .content-text")
              for(let contentText of contentTexts) {
                let more = contentText.parentNode.querySelector(".more")
                if (contentText.offsetHeight < contentText.scrollHeight || contentText.offsetWidth < contentText.scrollWidth) {
                  more.classList.remove("hidden") 

                  // clone node to remove any previously attached event listeners
                  let new_more= more.cloneNode(true);
                  more.parentNode.replaceChild(new_more, more)

                  new_more.addEventListener("click", (e) => {
                    contentText.classList.toggle("expanded")
                    if (contentText.classList.contains("expanded")) {
                      new_more.innerHTML = `<i class="fa-solid fa-angles-up"></i> view less`
                    } else {
                      new_more.innerHTML = `<i class="fa-solid fa-angles-down"></i> view more`
                    }
                  })
                }
                
              }
            })

          }
        }
      }
    })
  }
}
