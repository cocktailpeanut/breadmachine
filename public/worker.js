importScripts("./dexie.js")
//var db = new Dexie("breadboard")
//db.version(1).stores({
//  files: "file_path, agent, model_name, root_path, prompt, btime, mtime, width, height, *tokens",
//  folders: "&name",
//  checkpoints: "&root_path, btime",
//  settings: "key, val",
//  favorites: "query"
//})
var db = new Dexie("data")
var user = new Dexie("user")
db.version(2).stores({
  files: "file_path, agent, model_name, model_hash, root_path, prompt, btime, mtime, width, height, *tokens, seed, cfg_scale, steps, aesthetic_score, controlnet_module, controlnet_model, controlnet_weight, controlnet_guidance_strength",
})
user.version(1).stores({
  folders: "&name",
  checkpoints: "&root_path, btime",
  settings: "key, val",
  favorites: "query, global"
})
const esc = (str) => {
  return str
		.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
		.replace(/-/g, '\\x2d');
}
function applyFilter(q, filters) {
  if (filters.length > 0) {
    let numbers = [{
      key: "width",
      type: "int",
    }, {
      key: "height",
      type: "int",
    }, {
      key: "seed",
      type: "int"
    }, {
      key: "cfg_scale",
      type: "float"
    }, {
      key: "steps",
      type: "int",
    }, {
      key: "aesthetic_score",
      type: "float",
    }, {
      key: "controlnet_weight",
      type: "float",
    }, {
      key: "controlnet_guidance_strength",
      type: "float",
    }]
    for(let filter of filters) {
      if (filter.before) {
        q = q.and("btime").belowOrEqual(new Date(filter.before).getTime())
      } else if (filter.after) {
        q = q.and("btime").aboveOrEqual(new Date(filter.after).getTime())
      } else if (filter["-tag"]) {
        let tag = filter["-tag"].slice(1).toLowerCase()   // gotta strip off the "-" to get only the "tag:..."
        q = q.and((item) => {
          return !item.tokens.map(x => x.toLowerCase()).includes(tag)
        })
      } else if (filter["-"]) {
        let keyword = filter["-"].slice(2).toLowerCase()   // gotta strip off the -: to get only the keyword
        let prefixes = keyword.split(" ").filter(x => x && x.length > 0)
        // PREFIXES: ~ "rainy day" => ~ (rainy AND day) => ~rainy OR ~day
        // filter if at least one of the prefixes DO NOT appear in the tokens
        q = q.and((item) => {
          let tokens = item.tokens.map(x => x.toLowerCase())
          let test = false
          for(let prefix of prefixes) {
            // For each prefix, the test is to check that the tokens do NOT include the prefix
            // If at the end, if the prefix is proven to not exist, immediately return true
            // otherwise try with the next prefix until you find a prefix that does not exist in the tokens
            let included = false
            for(let token of tokens) {
              if (token.startsWith(prefix)) {
                included = true
              }
            }
            if (!included) {
              test = true
              break;
            }
          }
          return test
        })
      } else if (filter.model_name) {
        q = q.and((item) => {
          return new RegExp(esc(filter.model_name), "i").test(item.model_name)
        })
      } else if (filter.model_hash) {
        q = q.and((item) => {
          return filter.model_hash && item.model_hash && filter.model_hash.toLowerCase() === item.model_hash.toLowerCase()
        })
      } else if (filter.controlnet_module) {
        q = q.and((item) => {
          return new RegExp(esc(filter.controlnet_module), "i").test(item.controlnet_module)
        })
      } else if (filter.controlnet_model) {
        q = q.and((item) => {
          return new RegExp(esc(filter.controlnet_model), "i").test(item.controlnet_model)
        })
      } else if (filter.agent) {
        //q = q.and("agent").startsWithIgnoreCase(filter.agent)
        q = q.and((item) => {
          return item.agent && item.agent.toLowerCase().startsWith(filter.agent.toLowerCase())
        })
      } else if (filter.file_path) {
        q = q.and((item) => {
          return new RegExp(esc(filter.file_path), "i").test(item.file_path)
        })
      } else if (filter["-file_path"]) {
        q = q.and((item) => {
          return !new RegExp(esc(filter["-file_path"]), "i").test(item.file_path)
        })
      } else {
        for(let number of numbers) {
          let operators = ["-", "-=", "", "+=", "+"]
          for(let operator of operators) {
            if (filter[`${operator}${number.key}`]) {
              q = q.and((item) => {
                let val
                if (number.type === "int") {
                  val = parseInt(filter[`${operator}${number.key}`])
                } else if (number.type === "float") {
                  val = parseFloat(filter[`${operator}${number.key}`])
                }
                if (operator === "") {
                  return item[number.key] === val
                } else if (operator === "-") {
                  return item[number.key] < val
                } else if (operator === "-=") {
                  return item[number.key] <= val
                } else if (operator === "+") {
                  return item[number.key] > val
                } else if (operator === "+=") {
                  return item[number.key] >= val
                }
              })
            }
          } 
        }
      }
    }
  }
  return q.primaryKeys()
}

const preprocess_query = (phrase) => {
  let complex_re = /(-?(file_path|tag)?:)"([^"]+)"/g
  let complex_re2 = /-?(file_path|tag)?:"([^"]+)"/
  let mn_re = /model_name:"([^"]+)"/g
  let tag_re = /(-?(tag)?:)"([^"]+)"/g
  let agent_re = /agent:"([^"]+)"/g
  let controlnet_model_re = /controlnet_model:"([^"]+)"/g
  let controlnet_module_re = /controlnet_module:"([^"]+)"/g

  let mn_placeholder = "model_name:" + Date.now()
  let agent_placeholder = "agent:" + Date.now()
  let controlnet_model_name_placeholder = "controlnet_model:" + Date.now()
  let controlnet_module_name_placeholder = "controlnet_module:" + Date.now()


  // model_name capture
  let mn_test = mn_re.exec(phrase)
  let mn_captured
  if (mn_test && mn_test.length > 1) {
    phrase = phrase.replace(mn_re, mn_placeholder)
    mn_captured = mn_test[1]
  }

  // agent capture
  let agent_test = agent_re.exec(phrase)
  let agent_captured
  if (agent_test && agent_test.length > 1) {
    phrase = phrase.replace(agent_re, agent_placeholder)
    agent_captured = agent_test[1]
  }

  // controlnet model name capture
  let controlnet_model_test = controlnet_model_re.exec(phrase)
  let controlnet_model_captured
  if (controlnet_model_test && controlnet_model_test.length > 1) {
    phrase = phrase.replace(controlnet_model_re, controlnet_model_name_placeholder)
    controlnet_model_captured = controlnet_model_test[1]
  }

  // controlnet module name capture
  let controlnet_module_test = controlnet_module_re.exec(phrase)
  let controlnet_module_captured
  if (controlnet_module_test && controlnet_module_test.length > 1) {
    phrase = phrase.replace(controlnet_module_re, controlnet_module_name_placeholder)
    controlnet_module_captured = controlnet_module_test[1]
  }

  // file_path capture
  let complex_captured = {}
  let to_replace = []
  while(true) {
    let test = complex_re.exec(phrase)
    if (test) {
      let captured = test[3]
      let complex_placeholder = test[1] + Math.floor(Math.random() * 100000)
      to_replace.push(complex_placeholder)
      complex_captured[complex_placeholder] = captured
    } else {
      break;
    }
  }
  for(let placeholder of to_replace) {
    phrase = phrase.replace(complex_re2, placeholder)
  }

  let prefixes = phrase.split(" ").filter(x => x && x.length > 0)
  const converted = []
  for (let prefix of prefixes) {
    if (prefix.startsWith("model_name:")) {
      if (mn_captured) {
        converted.push("model_name:" + prefix.replace(/model_name:[0-9]+/, mn_captured))
      } else {
        converted.push(prefix)
      }
    } else if (prefix.startsWith("controlnet_model:")) {
      if (controlnet_model_captured) {
        converted.push("controlnet_model:" + prefix.replace(/controlnet_model:[0-9]+/, controlnet_model_captured))
      } else {
        converted.push(prefix)
      }
    } else if (prefix.startsWith("controlnet_module:")) {
      if (controlnet_module_captured) {
        converted.push("controlnet_module:" + prefix.replace(/controlnet_module:[0-9]+/, controlnet_module_captured))
      } else {
        converted.push(prefix)
      }
    } else if (prefix.startsWith("file_path:")) {
      if (complex_captured[prefix]) {
        converted.push("file_path:" + prefix.replace(/file_path:[0-9]+/, complex_captured[prefix]))
      } else {
        converted.push(prefix)
      }
    } else if (prefix.startsWith("-file_path:")) {
      if (complex_captured[prefix]) {
        converted.push("-file_path:" + prefix.replace(/-file_path:[0-9]+/, complex_captured[prefix]))
      } else {
        converted.push(prefix)
      }
    } else if (prefix.startsWith("tag:")) {
      if (complex_captured[prefix]) {
        converted.push("tag:" + prefix.replace(/tag:[0-9]+/, complex_captured[prefix]))
      } else {
        converted.push(prefix)
      }
    } else if (prefix.startsWith("-tag:")) {
      if (complex_captured[prefix]) {
        converted.push("-tag:" + prefix.replace(/-tag:[0-9]+/, complex_captured[prefix]))
      } else {
        converted.push(prefix)
      }
    } else if (prefix.startsWith("-:")) {
      if (complex_captured[prefix]) {
        converted.push("-:" + prefix.replace(/-:[0-9]+/, complex_captured[prefix]))
      } else {
        converted.push(prefix)
      }
    } else if (prefix.startsWith("agent:")) {
      if (agent_captured) {
        converted.push("agent:" + prefix.replace(/agent:[0-9]+/, agent_captured))
      } else {
        converted.push(prefix)
      }
    } else {
      converted.push(prefix)
    }
  }
  return converted
}

function find (phrase) {

  // replace all 
  // file_path:".*"
  // model_name:".*"
  // with 
  // file_path:Date.now()
  // model_name:Date.now()

  // run the split
  // replace the pattern after the split

  let prefixes = preprocess_query(phrase)
  let tokens = []
  let filters = []
  let numbers = [{
    key: "width",
    type: "int",
  }, {
    key: "height",
    type: "int",
  }, {
    key: "seed",
    type: "int"
  }, {
    key: "cfg_scale",
    type: "float"
  }, {
    key: "steps",
    type: "int",
  }, {
    key: "aesthetic_score",
    type: "float"
  }, {
    key: "controlnet_weight",
    type: "float",
  }, {
    key: "controlnet_guidance_strength",
    type: "float",
  }]
  for(let prefix of prefixes) {
    if (prefix.startsWith("before:")) {
      filters.push({
        before: prefix.replace("before:", "").trim()
      })
    } else if (prefix.startsWith("after:")) {
      filters.push({
        after: prefix.replace("after:", "").trim()
      })
    } else if (prefix.startsWith("model_name:")) {
      filters.push({
        model_name: prefix.replace("model_name:", "").trim()
      })
    } else if (prefix.startsWith("model_hash:")) {
      filters.push({
        model_hash: prefix.replace("model_hash:", "").trim()
      })
    } else if (prefix.startsWith("controlnet_model:")) {
      filters.push({
        controlnet_model: prefix.replace("controlnet_model:", "").trim()
      })
    } else if (prefix.startsWith("controlnet_module:")) {
      filters.push({
        controlnet_module: prefix.replace("controlnet_module:", "").trim()
      })
    } else if (prefix.startsWith("agent:")) {
      filters.push({
        agent: prefix.replace("agent:", "").trim()
      })
    } else if (prefix.startsWith("file_path:")) {
      filters.push({
        file_path: prefix.replace("file_path:", "").trim()
      })
    } else if (prefix.startsWith("-tag:")) {
      filters.push({ "-tag": prefix })
    } else if (prefix.startsWith("-:")) {
      filters.push({ "-": prefix })
    } else if (prefix.startsWith("-file_path:")) {
      filters.push({
        "-file_path": prefix.replace("-file_path:", "").trim()
      })
    } else {
      let operators = ["-", "-=", "", "+=", "+"]
      let isnumber;
      for(let number of numbers) {
        for(let operator of operators) {
          if (prefix.startsWith(`${operator}${number.key}:`)) {
            isnumber = true
            filters.push({
              [`${operator}${number.key}`]: prefix.replace(`${operator}${number.key}:`, "").trim()
            })
            break;
          }
        }
        if (isnumber) break;
      }
      if (!isnumber) {
        tokens.push(prefix)
      }
    }
  }

  return db.transaction('r', db.files, function*() {
    let promises
    if (tokens.length > 0) {
      promises = tokens.map((token) => {
        if (token.startsWith("-tag:")) {
          return applyFilter(db.files.toCollection(), filters)
        } else if (token.startsWith("-:")) {
          return applyFilter(db.files.toCollection(), filters)
        } else if (token.startsWith("-file_path:")) {
          return applyFilter(db.files.toCollection(), filters)
        } else {
          let q = db.files.where('tokens').startsWithIgnoreCase(token)
          return applyFilter(q, filters)
        }
      })
    } else {
      let q = db.files.toCollection()
      promises = [applyFilter(q, filters)]
    }
    const results = yield Dexie.Promise.all(promises)
    const reduced = results.reduce ((a, b) => {
      const set = new Set(b);
      return a.filter(k => set.has(k));
    });
    return yield db.files.where(':id').anyOf (reduced).toArray();
  });
}
addEventListener("message", async event => {
  let { query, sorter, offset, limit, options } = event.data;
  let res = []

  let LIMIT = limit

  // Global filter application
  let globalQueries = await user.favorites.where({ global: 1 }).toArray()
  if (globalQueries.length > 0) {
    let appendStr = globalQueries.map((item) => { return item.query }).join(" ")
    if (query) {
      query = query + " " + appendStr
    } else {
      query = appendStr
    }
  }


  let count
  if (query) {

    res = await find(query)
    if (sorter.direction > 0) {
      if (sorter.compare === 0) {
        res.sort((x, y) => {
          return x[sorter.column] - y[sorter.column]
        })
      } else if (sorter.compare === 1) {
        res.sort((x, y) => {
          let xx = (x[sorter.column] && typeof x[sorter.column] === 'string' ? x[sorter.column] : "")
          let yy = (y[sorter.column] && typeof y[sorter.column] === 'string' ? y[sorter.column] : "")
          return xx.localeCompare(yy)
        })
      }
    } else if (sorter.direction < 0) {
      if (sorter.compare === 0) {
        res.sort((x, y) => {
          return y[sorter.column] - x[sorter.column]
        })
      } else if (sorter.compare === 1) {
        res.sort((x, y) => {
          let xx = (x[sorter.column] && typeof x[sorter.column] === 'string' ? x[sorter.column] : "")
          let yy = (y[sorter.column] && typeof y[sorter.column] === 'string' ? y[sorter.column] : "")
          return yy.localeCompare(xx)
        })
      }
    }

    count = res.length
    if (count > offset * LIMIT) {
      res = res.slice(offset * LIMIT, (offset+1) * LIMIT)
    } else {
      res = []
    }

  } else {
    if (sorter.direction > 0) {
      res = await db.files.orderBy(sorter.column).offset(offset * LIMIT).limit(LIMIT).toArray()
    } else if (sorter.direction < 0) {
      res = await db.files.orderBy(sorter.column).reverse().offset(offset * LIMIT).limit(LIMIT).toArray()
    }
    count = await db.files.count()
  }

  // if there's a checkpoint,
  // after sorting, remove everything that's after the reference item (as well as the reference item)
  if (options && options.checkpoint && options.prepend) {
    for(let i=0; i<res.length; i++) {
      let item = res[i]
      console.log("checkpoint", options.checkpoint)
      if (item[sorter.column].toString() === options.checkpoint.toString()) {
        res = res.slice(0, i)
        break;
      }
    }
  }

  postMessage({ res, count, options })
});
