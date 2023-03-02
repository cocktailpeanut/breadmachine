const exifr = require('./exifr.umd.js')
const path = require('path')
const fs = require('fs')
const escapeHtml = require('escape-html')
const yaml = require('js-yaml');
class Parser {
  constructor() {
  }
  async parse(filename) {
    let buf = await fs.promises.readFile(filename)
    let parsed = await exifr.parse(buf, true)
    let attrs = {}
    if (parsed.ImageWidth) attrs.width = parsed.ImageWidth
    if (parsed.ImageHeight) attrs.height = parsed.ImageHeight

    let app
    let meta
    if (parsed["sd-metadata"]) {
      app = "invokeai"
    } else if (parsed.parameters) {
      app = "automatic1111"
    } else if (parsed.ImageDescription) {
      app = "imaginairy"
    } else if (parsed.description && parsed.description.value) {
      app = "stablediffusion"
      parsed.parameters = parsed.description.value.replace("&#xA;", "\n")
    } else if (parsed.userComment) {
      app = "stablediffusion"
      let chars = parsed.userComment.filter((x) => {
        return x
      })
      let str = Buffer.from(chars).toString()
      str = str.replace(/^(UNICODE|ASCII)/, "")
      parsed.parameters = str
    } else if (parsed.Comment) {
      app = "novelai"
      attrs.prompt = parsed.Description
    } else {
      let SDKEYS = Object.keys(parsed).filter((x) => {
        return x.startsWith("SD:")
      })
      if (SDKEYS.length > 0) {
        app = "sygil"
      } else {
        app = "stablediffusion"
        meta = parsed
      }
    }

    if (app) {
      if (!meta) {
        meta = this.getMeta(parsed, attrs)
      }
    } else {
      // no app found => try parse from external txt file
      try {
        const parametersFilename = path.join(path.dirname(filename), path.basename(filename, path.extname(filename)) + '.txt');
        let str = await fs.promises.readFile(parametersFilename, 'utf8')
        meta = await this.getMeta({ parameters: str }, attrs)
        app = "stablediffusion"
      } catch (e) {
        if (e.code !== 'ENOENT') {
          throw e;
        }
      }
    }
    for(let key in meta) {
      if (typeof meta[key] === "string") {
        meta[key] = escapeHtml(meta[key])
      }
    }

    // sync only needs to synchronize from the agent xmp
    return this.convert({ ...attrs, ...meta, app })
  }

  async parseParametersText(parsed, parametersText) {

    const metadata = this.getMeta({
      ...parsed,
      parameters: parametersText
    })

    if (!metadata) {
      return parsed;
    }

    return { ...metadata, } // do not include "app" attribute because it's not possible to tell the app just from the parsed text file and there may be many other apps
  }

  convert(e, options) {
  /*
  automatic111 {
    width: 512,
    height: 512,
    Steps: '20',
    Sampler: 'DDIM',
    'CFG scale': '7',
    Seed: '76682',
    Size: '512x512',
    'Model hash': '38b5677b',
    'Variation seed': '458188939',
    'Variation seed strength': '0.06',
    prompt: 'lake ness monster, procam style'
  }
  invokeAI {
    "width": 512,
    "height": 512,
    "prompt": "a ((dog)) running in a park",
    "steps": 50,
    "cfg_scale": 7.5,
    "threshold": 0,
    "perlin": 0,
    "seed": 3561693215,
    "seamless": false,
    "hires_fix": false,
    "type": "txt2img",
    "postprocessing": null,
    "sampler": "k_lms",
    "variations": [],
    "weight": 1,
    "model": "stable diffusion",
    "model_weights": "stable-diffusion-1.5",
    "model_hash": "cc6cb27103417325ff94f52b7a5d2dde45a7515b25c255d8e396c90014281516",
    "app_id": "invoke-ai/InvokeAI",
    "app_version": "v2.2.0"
  }
  diffusionbee {
    "prompt": "mafia santa, retro style",
    "seed": "15982",
    "img_w": "768",
    "img_h": "768",
    "key": "0.6032483614978881",
    "guidence_scale": "7.5",
    "dif_steps": "50",
    "model_version": "custom_retrodiffusion2_fp16",
    "negative_prompt": "blurry, disfigured"
  }
  */

    const x = {}
    if (options && options.agent) {
      x["xmp:agent"] = options.agent
    } else if (e.agent) {
      x["xmp:agent"] = e.agent
    } else if (e.Agent) {
      x["xmp:agent"] = e.Agent
    } else if (e.app) {
      if (e.app === "invokeai") {
        if (e.app_id && e.app_version) {
          x["xmp:agent"] = `${e.app_id}`// ${e.app_version}`
        }
      } else if (e.app === "automatic1111") {
        x["xmp:agent"] = e.app
      } else {
        x["xmp:agent"] = e.app
      }
    }

    if (e.Size) {
      let [width, height] = e.Size.split("x")
      x["xmp:width"] = parseInt(width)
      x["xmp:height"] = parseInt(height)
    } else if (e.size) {
      let [width, height] = e.size.split("x")
      x["xmp:width"] = parseInt(width)
      x["xmp:height"] = parseInt(height)
    }

    if (options && options.width) {
      x["xmp:width"] = parseInt(options.width)
    } else if (e.width) {
      x["xmp:width"] = parseInt(e.width)
    } else if (e.img_w) {
      x["xmp:width"] = parseInt(e.img_w)
    } else if (e.Width) {
      x["xmp:width"] = parseInt(e.Width)
    }
    if (options && options.height) {
      x["xmp:height"] = parseInt(options.height)
    } else if (e.height) {
      x["xmp:height"] = parseInt(e.height)
    } else if (e.img_h) {
      x["xmp:height"] = parseInt(e.img_h)
    } else if (e.Height) {
      x["xmp:height"] = parseInt(e.Height)
    }

    if (options && options.cfg) {
      x["xmp:cfg_scale"] = options.cfg
    } else if (e["CFG scale"]) {
      x["xmp:cfg_scale"] = parseFloat(e["CFG scale"])
    } else if (e.cfg_scale) {
      x["xmp:cfg_scale"] = parseFloat(e.cfg_scale)
    } else if (e["Guidance Scale"]) {
      x["xmp:cfg_scale"] = parseFloat(e["Guidance Scale"])
    } else if (e.guidance_scale) {
      x["xmp:cfg_scale"] = parseFloat(e.guidance_scale)
    } else if (e.scale) {
      x["xmp:cfg_scale"] = parseFloat(e.scale)
    } else if (e["prompt-strength"]) {
      x["xmp:cfg_scale"] = parseFloat(e["prompt-strength"])
    }

    if (options && options.input_strength) {
      x["xmp:input_strength"] = options.input_strength
    } else if (e["Denoising strength"]) {
      x["xmp:input_strength"] = parseFloat(e["Denoising strength"])
    } else if (e.inp_img_strength) {
      x["xmp:input_strength"] = parseFloat(e.inp_img_strength)
    } else if (e.strength) {
      x["xmp:input_strength"] = parseFloat(e.strength)
    } else if (e.Strength) {
      x["xmp:input_strength"] = parseFloat(e.Strength)
    } else if (e["init-image-strength"]) {
      x["xmp:input_strength"] = parseFloat(e["init-image-strength"])
    }

    if (options && options.seed) {
      x["xmp:seed"] = options.seed
    } else if (e.Seed) {
      x["xmp:seed"] = parseInt(e.Seed)
    } else if (e.seed) {
      x["xmp:seed"] = parseInt(e.seed)
    }

    if (options && options.negative) {
      x["xmp:negative_prompt"] = options.negative
    } else if (e["Negative prompt"]) {
      x["xmp:negative_prompt"] = e["Negative prompt"]
    } else if (e.negative_prompt) {
      x["xmp:negative_prompt"] = e.negative_prompt
    } else if (e["negative-prompt"]) {
      x["xmp:negative_prompt"] = e["negative-prompt"]
    } else if (e.uc) {
      x["xmp:negative_prompt"] = e.uc
    } else {
      // invokeai does negative prompts differently (included in the prompt), so need to parse the prompt to extract negative prompts
      if (e.prompt && Array.isArray(e.prompt) && e.prompt[0].prompt) {
        // test for invokeAI negative prompt syntax
        let negative_chunks = []
        let positive_chunks = []
        for(let chunk of e.prompt) {
          if (chunk.prompt && typeof chunk.prompt === "string") {
            let matches = [...chunk.prompt.matchAll(/\[([^\]]+)\]/g)].map((m) => {
              return m[1]
            })
            if (matches.length > 0) {
              negative_chunks = negative_chunks.concat(matches)
            }
            let positive = chunk.prompt.replaceAll(/\[[^\]]+\]/g, "").trim()
            positive_chunks.push(positive)
          }
        }
        if (negative_chunks.length > 0) {
          x["xmp:negative_prompt"] = escapeHtml(negative_chunks.join(", "))
        }
        x["xmp:prompt"] = escapeHtml(positive_chunks.join(" "))
      }
    }

    if (options && options.sampler) {
      x["xmp:sampler"] = options.sampler
    } else if (e.Sampler) {
      x["xmp:sampler"] = e.Sampler
    } else if (e.sampler) {
      x["xmp:sampler"] = e.sampler
    } else if (e.sampler_name) {
      x["xmp:sampler"] = e.sampler_name
    } else if (e["sampler-type"]) {
      x["xmp:sampler"] = e["sampler-type"]
    } else if (e["sampler_name"]) {
      x["xmp:sampler"] = e["sampler_name"]
    } else if (e.Scheduler) {
      x["xmp:sampler"] = e.Scheduler
    }

    if (options && options.steps) {
      x["xmp:steps"] = options.steps
    } else if (e.Steps) {
      x["xmp:steps"] = e.Steps
    } else if (e.steps) {
      x["xmp:steps"] = e.steps
    } else if (e.num_inference_steps) {
      x["xmp:steps"] = e.num_inference_steps
    } else if (e.ddim_steps) {
      x["xmp:steps"] = parseInt(e.ddim_steps)
    }

    if (!x["xmp:prompt"]) {
      x["xmp:prompt"] = e.prompt
    }

    if (options && options.model) {
      x["xmp:model_name"] = options.model
    } else if (e.model_version) {
      x["xmp:model_name"] = e.model_version
    } else if (e.model_weights) {
      x["xmp:model_name"] = e.model_weights
    } else if (e.Model) {
      x["xmp:model_name"] = e.Model
    } else if (e.model_name) {
      x["xmp:model_name"] = e.model_name
    } else if (e.use_stable_diffusion_model) {
      let modelname = e.use_stable_diffusion_model
      if (/\\/.test(modelname)) {
        // windows
        x["xmp:model_name"] = path.win32.parse(modelname).name
      } else {
        x["xmp:model_name"] = path.posix.parse(modelname).name
      }
    }

    if (options && options.model_hash) {
      x["xmp:model_hash"] = options.model_hash
    } else if (e.Model_hash) {
      x["xmp:model_hash"] = e.Model_hash
    } else if (e["Model hash"]) {
      x["xmp:model_hash"] = e["Model hash"]
    } else if (e["model hash"]) {
      x["xmp:model_hash"] = e["model hash"]
    } else if (e.model_hash) {
      x["xmp:model_hash"] = e.model_hash
    }

    if (options && options.model_url) {
      x["xmp:model_url"] = options.model_url
    } else if (e.Model_url) {
      x["xmp:model_url"] = e.Model_url
    } else if (e.model_url) {
      x["xmp:model_url"] = e.model_url
    }

    if (options && options.subject) {
      x["dc:subject"] = options.subject
    } else if (e.subject) {
      x["dc:subject"] = e.subject
    } else if (e.Subject) {
      x["dc:subject"] = e.Subject
    }

    if (options && options.aesthetic_score) {
      x["xmp:aesthetic_score"] = parseFloat(options.aesthetic_score)
    } else if (e.aesthetic_score) {
      x["xmp:aesthetic_score"] = parseFloat(e.aesthetic_score)
    } else if (e.Score) {
      x["xmp:aesthetic_score"] = parseFloat(e.Score)
    }

    if (options && options.controlnet_module) {
      x["xmp:controlnet_module"] = options.controlnet_module
    } else if (e["ControlNet Module"]) {
      x["xmp:controlnet_module"] = e["ControlNet Module"]
    }

    if (options && options.controlnet_model) {
      x["xmp:controlnet_model"] = options.controlnet_model
    } else if (e["ControlNet Model"]) {
      x["xmp:controlnet_model"] = e["ControlNet Model"]
    }

    if (options && options.controlnet_weight) {
      x["xmp:controlnet_weight"] = parseFloat(options.controlnet_weight)
    } else if (e["ControlNet Weight"]) {
      x["xmp:controlnet_weight"] = parseFloat(e["ControlNet Weight"])
    }

    if (options && options.controlnet_guidance_strength) {
      x["xmp:controlnet_guidance_strength"] = parseFloat(options.controlnet_guidance_strength)
    } else if (e["ControlNet Guidance Strength"]) {
      x["xmp:controlnet_guidance_strength"] = parseFloat(e["ControlNet Guidance Strength"])
    }

    let keys = [
      "xmp:prompt",
      "xmp:sampler",
      "xmp:steps",
      "xmp:cfg_scale",
      "xmp:input_strength",
      "xmp:seed",
      "xmp:negative_prompt",
      "xmp:model_name",
      "xmp:model_hash",
      "xmp:model_url",
      "xmp:agent",
      "xmp:width",
      "xmp:height",
      "xmp:aesthetic_score",
      "xmp:controlnet_module",
      "xmp:controlnet_model",
      "xmp:controlnet_weight",
      "xmp:controlnet_guidance_strength",
      "dc:subject",
    ]

    let list = []
    for(let key of keys) {
      if (x[key]) {
        list.push({ key, val: x[key] })
      } else {
        list.push({ key })
      }
    }

    return list

  }
  applyType(item) {
    let integers = ["xmp:steps", "xmp:seed", "xmp:width", "xmp:height"]
    let floats = ["xmp:cfg_scale", "xmp:input_strength", "xmp:aesthetic_score", "xmp:controlnet_weight", "xmp:controlnet_guidance_strength"]
    if (integers.includes(item.key)) {
      return parseInt(item.val)
    }

    if (floats.includes(item.key)) {
      return parseFloat(item.val)
    }

    return item.val
  }
  async serialize(root_path, file_path, parsed) {
    let o = {}
    if (parsed) {
      const keys = [{
        prefix: "xmp:",
        key: "xmp:gm",
        type: "object"
      }, {
        prefix: "dc:",
        key: "dc:subject",
        type: "array"
      }]

      for(let { key, prefix, type } of keys) {
        if (parsed[key]) {
          for(let i=0; i<parsed[key].length; i++) {
            /********************************************************************************
            *
            *   item := 
            *
            *     object: {
            *       key: 'xmp:model_hash',
            *       val: 'cc6cb27103417325ff94f52b7a5d2dde45a7515b25c255d8e396c90014281516'
            *     },
            *
            *     array: {
            *       val: "favorite"
            *     }
            *
            *********************************************************************************/
            let item = parsed[key][i]
            if (type === "array") {
              let k = key.replace(prefix, "").toLowerCase()
              if (o[k]) {
                o[k].push(item.val)
              } else {
                o[k] = [item.val]
              }
            } else if (type === "object") {
              if (typeof item.val !== "undefined") {
                let k = item.key.replace(prefix, "").toLowerCase()
                o[k] = this.applyType(item)
              }
            }
          }
        }
      }
    }
    let stat = await fs.promises.stat(file_path)
    let btime = new Date(stat.birthtime).getTime()
    let mtime = new Date(stat.mtime).getTime()
    return { ...o, root_path, file_path, mtime, btime }
  }
  getMeta(parsed, attr) {
    if (parsed["sd-metadata"]) {
      let p = JSON.parse(parsed["sd-metadata"])
      let image = p.image
      delete p.image
      if (attr) {
        if (attr.width) image.width = parseInt(attr.width)
        if (attr.height) image.height = parseInt(attr.height)
      }
      return { ...image, ...p, }
    } else if (parsed.Comment) {
      let p = JSON.parse(parsed.Comment)
      if (attr) {
        if (attr.width) p.width = parseInt(attr.width)
        if (attr.height) p.height = parseInt(attr.height)
        if (attr.prompt) p.prompt = attr.prompt
      }
      return p
    } else if (parsed.ImageDescription) {
      const [m, _prompt, width, height, kv] = /^"?(.*)"? ([0-9]+)x([0-9]+)px (negative-prompt:.+)$/.exec(parsed.ImageDescription)
      const regex = /([\w-]+):("[^"]+"|[\w]+)/g;
      const attrs = {};
      let match;
      while ((match = regex.exec(kv))) {
        attrs[match[1]] = isNaN(match[2])
          ? match[2].replace(/"/g, '')
          : match[2]
      }
      attrs.prompt = _prompt;
      attrs.width = width;
      attrs.height = height;
      return attrs
    } else if (parsed["SD:width"]) {
      let cleaned = {}
      for(let key in parsed) {
        if (key.startsWith("SD:")) {
          cleaned[key.replace("SD:", "")] = parsed[key]
        }
      }
      return cleaned
    } else if (parsed.parameters) {
      try {
        /**********************************************
        *
        *   1. try the following format first:
        *
        *   key: val; key: val; key: val;...
        *
        **********************************************/
        // mochidiffusion
        if (/^Include in Image.*Generator: Mochi Diffusion.*/g.test(parsed.parameters)) {
          let re = /([^:]+):([^:]+); /g
          let items = [...parsed.parameters.matchAll(re)].map((item) => {
            return {
              key: item[1].trim(),
              val: item[2].trim()
            }
          })
          let attrs = {}
          for(let kv of items) {
            attrs[kv.key] = kv.val
          }

          attrs.prompt = attrs["Include in Image"]
          attrs.negative_prompt = attrs["Exclude in Image"]
          if (attr) {
            if (attr.width) attrs.width = parseInt(attr.width)
            if (attr.height) attrs.height = parseInt(attr.height)
          }
          return attrs
        } else {
          /**********************************************
          *
          *   2. try the following format second:
          *
          *   prompt
          *   key: val
          *   key: val
          *   key: val
          *
          **********************************************/
          let lines = parsed.parameters.split(/\r?\n/)
          const attrs = yaml.load(lines.slice(1).join("\n"))
          return { prompt: lines[0], ...attrs }
        }
      } catch (e) {
        /*******************************************************************
        *
        *   If the parse fails, try the following format (automatic1111):
        *
        *   prompt
        *   Negative prompt: .... (optional)
        *   key: val, key: val, key: val
        *
        *******************************************************************/
        let lines = parsed.parameters.split(/\r?\n/).filter((x) => {
          return x && x.length > 0
        })

        // last line is the attributes
        // last - 1 line
        //    if it starts with "Negative prompt:", is the negative prompt
        //    otherwise, there is no negative prompt
        // The rest lines are treated as the prompt

        let re = /([^:]+):([^:]+)(,|$|\n)/g
        let kvs = lines[lines.length-1]
        let items = [...kvs.matchAll(re)].map((item) => {
          return {
            key: item[1].trim(),
            val: item[2].trim()
          }
        })

        let negative
        if (lines.length >= 3 && lines[lines.length-2].startsWith("Negative prompt:")) {
          negative = true
          items.push({
            key: "Negative prompt",
            val: lines[lines.length-2].replace(/Negative prompt:[ ]?/, "")
          })
        }

        let promptStr
        if (negative) {
          promptStr = lines.slice(0, -2).join("\n")
        } else {
          promptStr = lines.slice(0, -1).join("\n")
        }

        let attrs = {}
        for(let kv of items) {
          attrs[kv.key] = kv.val
        }

        attrs.prompt = promptStr
        if (attr) {
          if (attr.width) attrs.width = parseInt(attr.width)
          if (attr.height) attrs.height = parseInt(attr.height)
        }
        return attrs

      }
    }
  }
}
module.exports = Parser
