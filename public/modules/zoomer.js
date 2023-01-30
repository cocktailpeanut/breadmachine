class Zoomer {
  constructor(app) {
    this.app = app
  }
  async init() {
    let id
    window.addEventListener('resize', () => {
      clearTimeout(id);
      id = setTimeout(() => {
        this.resized()
      }, 1000);
    });
    this.resized()
  }
  resized () {
    this.defaultwidth = 200;
    if (this.app && this.app.zoom) {
      this.cardwidth = this.defaultwidth * this.app.zoom / 100;
      this.fontsize = Math.max(0.8 * this.app.zoom/100, 0.5)
    } else {
      this.cardwidth = this.defaultwidth
      this.fontsize = 0.8
    }
    // need to subtract 5 because we're using custom scrollbar with width 15
    // (to deal with a chromium bug)
    let width = document.body.clientWidth - 10;
    let leftover = width % this.cardwidth;
    let count = Math.floor(width / this.cardwidth)
    let new_cardwidth
    let i = 1;
    while(true) {
      //new_cardwidth = this.cardwidth + Math.floor(leftover / count) - i
      new_cardwidth = this.cardwidth + (leftover / count) - i
      if (new_cardwidth * count <= width) {
        break;
      }
      i++
    }
    document.body.style.setProperty("--card-width", `${new_cardwidth}px`)
    document.body.style.setProperty("--font-size", `${this.fontsize}rem`);
  }
}
