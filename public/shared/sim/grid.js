export class Grid {
  constructor(cell, width, height) {
    this.cell = cell;
    this.cols = Math.ceil(width / cell) + 1;
    this.rows = Math.ceil(height / cell) + 1;
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    this.used = [];
  }

  clear() {
    for (const i of this.used) this.cells[i].length = 0;
    this.used.length = 0;
  }

  insert(e) {
    const c = this.cell;
    const x0 = Math.max(0, Math.floor((e.x - e.r) / c)), x1 = Math.min(this.cols - 1, Math.floor((e.x + e.r) / c));
    const y0 = Math.max(0, Math.floor((e.y - e.r) / c)), y1 = Math.min(this.rows - 1, Math.floor((e.y + e.r) / c));
    e._c0 = x0; e._c1 = x1; e._r0 = y0; e._r1 = y1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * this.cols + x;
      const cell = this.cells[i];
      if (cell.length === 0) this.used.push(i);
      cell.push(e);
    }
  }

  query(x, y, r, fn, stamp) {
    const c = this.cell;
    const x0 = Math.max(0, Math.floor((x - r) / c)), x1 = Math.min(this.cols - 1, Math.floor((x + r) / c));
    const y0 = Math.max(0, Math.floor((y - r) / c)), y1 = Math.min(this.rows - 1, Math.floor((y + r) / c));
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
      const cell = this.cells[gy * this.cols + gx];
      for (let k = 0; k < cell.length; k++) {
        const e = cell[k];
        if (e._q === stamp) continue;
        e._q = stamp;
        if (fn(e) === false) return;
      }
    }
  }
}
