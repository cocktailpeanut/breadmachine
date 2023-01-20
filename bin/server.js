const path = require('path')
const Breadboard = require('../index');
const breadboard = new Breadboard();
(async () => {
  await breadboard.init({
    theme: "default",
    config: path.resolve(__dirname, "breadboard.yaml")
  })
})();
