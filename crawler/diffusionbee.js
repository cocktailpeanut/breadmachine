/*
exif {
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
{
	"model": "stable diffusion",
	"model_weights": "stable-diffusion-1.5",
	"model_hash": "cc6cb27103417325ff94f52b7a5d2dde45a7515b25c255d8e396c90014281516",
	"app_id": "invoke-ai/InvokeAI",
	"app_version": "v2.2.0",
	"image": {
		"prompt": [{
			"prompt": "a ((dog)) running in a park",
			"weight": 1.0
		}],
		"steps": 50,
		"cfg_scale": 7.5,
		"threshold": 0,
		"perlin": 0,
		"height": 512,
		"width": 512,
		"seed": 3561693215,
		"seamless": false,
		"hires_fix": false,
		"type": "txt2img",
		"postprocessing": null,
		"sampler": "k_lms",
		"variations": []
	}
}

*/

const path = require('path');
const { fdir } = require("fdir");
const os = require('os');
const fs = require('fs');
const meta = require('png-metadata')
const Parser = require('./parser')
class Diffusionbee {
  constructor(folderpath, gm) {
    this.folderpath = folderpath
    this.gm = gm
    this.parser = new Parser()
  }
  async init() {
    let str = await fs.promises.readFile(path.resolve(path.dirname(this.folderpath), "data.json"), "utf8")
    let data = JSON.parse(str)
    let history = data.history
    /****************************************************
    *
    *   mapping := {
    *     [filename]: {
    *       prompt,
    *       seed,
    *       key,
    *       img_w,
    *       img_h,
    *       dif_steps,
    *       guidence_scale
    *     }
    *   }
    *
    ****************************************************/
    this.mapping = {}
    this.batchIndex = {}
    for(let key in history) {
      let attrs = history[key]
      let imgs = attrs.imgs
      let exif = {}
      for(let key in attrs) {
        if (key !== "imgs") {
          exif[key] = "" + attrs[key]
        }
      }
      for(let i=0; i<imgs.length; i++) {
        let img = imgs[i]
        this.mapping[img] = exif
        this.batchIndex[img] = i
      }
    }
  }
  async extract(filename, force) {
    let user_info = await this.gm.user.get(filename)
    if (user_info.parsed) {
      // The XMP file already exists
      // USE THE XMP => Do nothing
    } else {
      // XMP does not exist
      // Try inspecting the image
      user_info = await this.gm.user.extract(filename)
    }
    return user_info
  }
  async sync(filename, force) {
    /******************************************************************************
    *   info := {
    *     parsed: {
    *       "xmp:gm": [
    *         { key: 'xmp:prompt', val: 'Steve Buscemi, itojunji style' },
    *         { key: 'xmp:sampler' },
    *         { key: 'xmp:steps', val: 25 },
    *         { key: 'xmp:cfg_scale' },
    *         { key: 'xmp:seed' },
    *         { key: 'xmp:negative_prompt', val: 'disfigured' },
    *         { key: 'xmp:model_name' },
    *         { key: 'xmp:model_url' },
    *         { key: 'xmp:agent' },
    *         { key: 'dc:subject' }
    *       ]
    *     }
    *   }
    ******************************************************************************/

    // 1. try to read metadata from the existing file
    // 2. Write to XMP
    // 3. Return the parsed metadata


    // 1. try to read metadata from the existing file
    let agent_info = await this.gm.agent.get(filename)
    if (agent_info) {
      // agent_info != null => image file exists
      // parse the DB and write to XMP
      let m = this.mapping[filename]
      if (m) {
        let seed = parseInt(m.seed) + 1234 * this.batchIndex[filename]
        let list = [{
          key: 'xmp:prompt',
          val: m.prompt,
        }, {
          key: 'xmp:sampler',
          val: "plms",
        }, {
          key: 'xmp:steps',
          val: (m.dif_steps ? parseInt(m.dif_steps) : null),
        }, {
          key: 'xmp:cfg_scale',
          val: (m["guidence_scale"] ? parseFloat(m["guidence_scale"]) : null),
        }, {
          key: 'xmp:input_strength',
          val: (m["inp_img_strength"] ? parseFloat(m["inp_img_strength"]) : null),
        }, {
          key: 'xmp:seed',
          val: seed,
        }, {
          key: 'xmp:negative_prompt',
          val: m.negative_prompt,
        }, {
          key: 'xmp:model_name',
          val: m.model_version,
        }, {
          key: 'xmp:model_url',
          val: null,  // reserved
        }, {
          key: 'xmp:agent',
          val: "diffusionbee"
        }, {
          key: 'xmp:width',
          val: m.img_w
        }, {
          key: 'xmp:height',
          val: m.img_h
        }]

        // 2. Write to XMP and set the new agent_info
        agent_info = await this.gm.agent.set(
          filename,
          { "xmp:gm": list },
//          { store: "memory" }
        )
      }
    } else {
      // agent_info: null => image file does not exist
      // IGNORE
    }

    // 2. crawl from user XMP
    let user_info = await this.extract(filename, force)

    // merge agent_info and user_info
    let parsed = (user_info.parsed ? { ...agent_info.parsed, ...user_info.parsed } : agent_info.parsed)

    // return the serialized version
    let serialized = await this.parser.serialize(this.folderpath, filename, parsed)
    serialized.id = agent_info.cid
    return serialized
  }
};
module.exports = Diffusionbee
