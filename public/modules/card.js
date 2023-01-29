const card = (meta, stripPunctuation) => {
  let attributes = Object.keys(meta).map((key) => {
    return { key, val: meta[key] }
  })
  let times = `<tr><td>created</td><td>${timeago.format(meta.btime)}</td></tr>
<tr><td>modified</td><td>${timeago.format(meta.mtime)}</td></tr>`

  let tags = []
  for(let attr of attributes) {
    if (attr.key === "tokens") {
      if (attr.val && attr.val.length > 0) {
        tags = attr.val.filter((x) => {
          return x.startsWith("tag:")
        })
      }
      break;
    }
  }
  let is_favorited = tags.includes("tag:favorite")

  let trs = attributes.filter((attr) => {
    //return attr.key !== "app" && attr.key !== "tokens"
    return attr.key !== "root_path"
  }).map((attr) => {
    let el
    if (attr.key === "model_name") {
      el = `<span class='token' data-value="${attr.val}">${attr.val}</span>`
    } else if (attr.key === "model_hash") {
      el = `<span class='token' data-value="${attr.val}">${attr.val}</span>`
    } else if (attr.key === "agent" && attr.val) {
      el = `<span class='token' data-value="${attr.val}">${attr.val}</span>`
    } else if (attr.key === "tokens") {
      let val = []
      if (attr.val && attr.val.length > 0) {
        val = attr.val
      }
      let els = val.filter((x) => {
        return x.startsWith("tag:")
      }).map((x) => {
        return `<span data-tag="${x}">
<button data-value="${x}" class='token tag-item'><i class="fa-solid fa-tag"></i> ${x.replace("tag:", "")}</button>
</span>`
      })
      el = els.join("")
      attr.key = "tags"
    } else if (attr.key === "prompt" && attr.val) {
      if (attr.val && typeof attr.val === "string" && attr.val.length > 0) {
        let tokens = stripPunctuation(attr.val).split(/\s/)
        let els = []
        for(let token of tokens) {
          els.push(`<span class='token' data-value="${token}">${token}</span>`)
        }
        el = els.join(" ")
      } else {
        el = ""
      }
    } else if (attr.key === "file_path" && attr.val) {
      let tokens = attr.val.split(/[\/\\]/).filter(x => x.length > 0)
      let els = []
      for(let token of tokens) {
        els.push(`<span class='token' data-value="${token}">${token}</span>`)
      }
      el = els.join("/")
    } else if (attr.key === "width" || attr.key === "height") {
      el = `<span class='token' data-value="${attr.val}">${attr.val}</span>`
    } else {
      el = attr.val
    }

    let display = ""
    if (attr.key === "tags") {
      display = "hidden"
    }

    return `<tr data-key="${attr.key}">
  <td>${attr.key}</td>
  <td class='attr-val'>
    <button title='copy to clipboard' class='copy-text ${display}' data-value="${attr.val}"><i class="fa-regular fa-clone"></i> <span></span></button>
    <div class='content-text'>${el}</div>
  </td>
</tr>`
  }).join("")


  let favClass = (is_favorited ? "fa-solid fa-heart" : "fa-regular fa-heart")

  return `<div class='grab' draggable='true'>
<button title='like this item' data-favorited="${is_favorited}" data-src="${meta.file_path}" class='favorite-file'><i class="${favClass}"></i></button>
<button title='get the source file' data-src="${meta.file_path}" class='open-file'><i class="fa-regular fa-folder-open"></i></button>
<button title='view in full screen' class='gofullscreen'><i class="fa-solid fa-up-right-and-down-left-from-center"></i></button>
</div>
<div class='row'>
  <img data-root="${meta.root_path}" data-src="${meta.file_path}" src="/file?file=${encodeURIComponent(meta.file_path)}">
  <div class='col'>
    <h4 class='flex'>${meta.prompt ? meta.prompt : ""}</h4>
    <div class='xmp'>
      <div class='card-header'>
        <button title='copy the prompt to clipboard' class='copy-text' data-value="${meta.prompt}"><i class='fa-regular fa-clone'></i> <span>Copy Prompt</span></button>
        <button title='view the metadata in standardized XML' class='view-xmp' data-src="${meta.file_path}"><i class="fa-solid fa-code"></i> View XML</button>
      </div>
      <textarea readonly class='hidden slot'></textarea>
    </div>
    <table>${times}${trs}</table>
  </div>
</div>`
}
