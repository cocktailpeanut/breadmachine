const auth = require('basic-auth')
const compare = require('tsscmp')
class BasicAuth {
  constructor(up) {
    this.up = up
    console.log("this.up", this.up)
  }
  check (name, pass) {
    if (this.up[name]) {
      let expectedPassword = this.up[name]
      return compare(pass, expectedPassword)
    } else {
      return false;
    }
  }
  auth_redirect (req, res, next) {
    console.log("auth_redirect url", req.originalUrl)
    if (req.agent === "web") {
      const user = auth(req)
      console.log("# auth_redirect", user)
      if (!user || !this.check(user.name, user.pass)) {
        res.statusCode = 401
        res.redirect("/login")
      } else {
        console.log("2")
        next()
      }
    } else {
      next()
    }
  }
  auth (req, res, next) {
    console.log("auth url", req.originalUrl)
    if (req.agent === "web") {
      const user = auth(req)
      console.log("# auth", user)
      if (!user || !this.check(user.name, user.pass)) {
        console.log("failed")
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.end('Access denied')
      } else {
        console.log("passed")
        next()
      }
    } else {
      next()
    }
  }
}
module.exports = BasicAuth
