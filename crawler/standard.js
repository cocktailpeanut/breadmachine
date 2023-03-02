const fs = require('fs');
const path = require('path');
const { fdir } = require("fdir");
const Parser = require('./parser')
class Standard {
  constructor(folderpath, gm) {
    this.folderpath = folderpath
    this.gm = gm
    this.parser = new Parser()
  }
  async init() {
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

    // 1. Try to read metadata from the image
    // 2. If the image exists, Write the parsed metadata to XMP
    // 3. Return the parsed metadata
    let agent_info = await this.gm.agent.get(filename)
    if (agent_info) {
      // agent_info != null => image file exists
      // parse the image file and write to XMP


      // info := { xmp, parsed }
      try {

        // 1. Try to read metadata from the image
        let list = await this.parser.parse(filename)
        // 2. Write to XMP and set the new agent_info
        agent_info = await this.gm.agent.set(
          filename,
          { "xmp:gm": list },
          { store: "memory" }
        )
      } catch (e) {
        console.log("ERROR sync", filename, e)
      }
    } else {
      // agent_info: null => image file does not exist
      // IGNORE
    }

    // 2. crawl from user XMP
    // user_info := { xmp, parsed, cid, path } 
    let user_info = await this.extract(filename, force)

    // merge agent_info and user_info
    let parsed = (user_info.parsed ? { ...agent_info.parsed, ...user_info.parsed } : agent_info.parsed)
    let serialized = await this.parser.serialize(this.folderpath, filename, parsed)
    serialized.id = agent_info.cid
    return serialized

  }
}
module.exports = Standard
