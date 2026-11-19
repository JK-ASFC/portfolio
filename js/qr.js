/* =============================================================
   LEONE — générateur de QR code (SVG), sans dépendance
   Mode octet (UTF-8), correction d'erreur M (~15 %), versions 1 à 10
   (jusqu'à 213 octets : largement assez pour une adresse du site).
   Algorithme : norme ISO/IEC 18004, structure inspirée de la bibliothèque
   « QR Code generator » de Project Nayuki (MIT).
   Usage : LEONE_QR.svg("https://…", { dark: "#14123a", light: "#fff" })
   ============================================================= */
(function () {
  // Niveau M, index = version (0 inutilisé)
  const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
  const NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
  const ECC_FORMAT_M = 0; // L=1, M=0, Q=3, H=2

  const bit = (x, i) => ((x >>> i) & 1) !== 0;

  function rawModules(ver) {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const na = Math.floor(ver / 7) + 2;
      r -= (25 * na - 10) * na - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  const dataCodewords = (ver) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];

  function alignPositions(ver) {
    if (ver === 1) return [];
    const n = Math.floor(ver / 7) + 2;
    const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    const res = [6];
    for (let pos = ver * 4 + 10; res.length < n; pos -= step) res.splice(1, 0, pos);
    return res;
  }

  /* ---- Reed-Solomon sur GF(256), polynôme 0x11D ---- */
  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(degree) {
    const res = new Array(degree).fill(0);
    res[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < res.length; j++) {
        res[j] = gfMul(res[j], root);
        if (j + 1 < res.length) res[j] ^= res[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return res;
  }
  function rsRemainder(data, divisor) {
    const res = divisor.map(() => 0);
    for (const b of data) {
      const factor = b ^ res.shift();
      res.push(0);
      divisor.forEach((coef, i) => (res[i] ^= gfMul(coef, factor)));
    }
    return res;
  }

  function utf8(text) {
    if (typeof TextEncoder !== "undefined") return Array.from(new TextEncoder().encode(text));
    return unescape(encodeURIComponent(text)).split("").map((c) => c.charCodeAt(0));
  }

  /** Matrice de modules (true = foncé) pour le texte donné. */
  function encode(text) {
    const bytes = utf8(String(text));
    let ver = 1;
    for (; ver <= 10; ver++) {
      const countBits = ver < 10 ? 8 : 16;
      if (4 + countBits + bytes.length * 8 <= dataCodewords(ver) * 8) break;
    }
    if (ver > 10) throw new Error("QR : texte trop long");

    /* ---- Flux de bits : mode octet, longueur, données, fin, bourrage ---- */
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(0x4, 4);
    push(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach((b) => push(b, 8));
    const capBits = dataCodewords(ver) * 8;
    push(0, Math.min(4, capBits - bits.length));
    push(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < capBits; pad ^= 0xec ^ 0x11) push(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((n, b) => (n << 1) | b, 0));

    /* ---- Blocs + correction d'erreur, puis entrelacement ---- */
    const numBlocks = NUM_BLOCKS[ver], eccLen = ECC_PER_BLOCK[ver];
    const rawCodewords = Math.floor(rawModules(ver) / 8);
    const numShort = numBlocks - (rawCodewords % numBlocks);
    const shortLen = Math.floor(rawCodewords / numBlocks);
    const div = rsDivisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, div);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const codewords = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= numShort) codewords.push(b[i]); });
    }

    /* ---- Motifs fixes ---- */
    const size = ver * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const setFn = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };

    for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const ap = alignPositions(ver), na = ap.length;
    for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        setFn(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const drawFormat = (mask) => {
      const d = (ECC_FORMAT_M << 3) | mask;
      let rem = d;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((d << 10) | rem) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setFn(8, i, bit(b, i));
      setFn(8, 7, bit(b, 6)); setFn(8, 8, bit(b, 7)); setFn(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(b, i));
      setFn(8, size - 8, true);
    };
    drawFormat(0); // réserve les emplacements
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const b = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const v = bit(b, i), a = size - 11 + (i % 3), c = Math.floor(i / 3);
        setFn(a, c, v); setFn(c, a, v);
      }
    }

    /* ---- Placement en zigzag ---- */
    let n = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
          if (!fn[y][x] && n < codewords.length * 8) {
            mod[y][x] = bit(codewords[n >>> 3], 7 - (n & 7));
            n++;
          }
        }
      }
    }

    /* ---- Masque : on garde celui qui a la plus faible pénalité ---- */
    const maskFn = [
      (x, y) => (x + y) % 2 === 0,
      (x, y) => y % 2 === 0,
      (x) => x % 3 === 0,
      (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
      (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
    ];
    const applyMask = (m) => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
        if (!fn[y][x] && maskFn[m](x, y)) mod[y][x] = !mod[y][x];
    };
    const penalty = () => {
      let p = 0, dark = 0;
      const line = (get) => {
        for (let a = 0; a < size; a++) {
          let run = 1, s = "";
          for (let b = 0; b < size; b++) {
            const v = get(a, b);
            s += v ? "1" : "0";
            if (b > 0 && v === get(a, b - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p += 1; }
            else run = 1;
          }
          const pad = "0000" + s + "0000";
          for (let i = pad.indexOf("1011101"); i >= 0; i = pad.indexOf("1011101", i + 1)) {
            if (pad.slice(i - 4, i) === "0000" || pad.slice(i + 7, i + 11) === "0000") p += 40;
          }
        }
      };
      line((a, b) => mod[a][b]);
      line((a, b) => mod[b][a]);
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
        const c = mod[y][x];
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
      }
      mod.forEach((row) => row.forEach((v) => { if (v) dark++; }));
      p += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
      return p;
    };
    let best = 0, bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m); drawFormat(m);
      const s = penalty();
      if (s < bestScore) { bestScore = s; best = m; }
      applyMask(m); // XOR : annule le masque
    }
    applyMask(best); drawFormat(best);
    return mod;
  }

  /** Code SVG (chaîne) avec une marge de 4 modules. */
  function svg(text, opts = {}) {
    const mod = encode(text);
    const size = mod.length, q = 4, full = size + q * 2;
    let d = "";
    mod.forEach((row, y) => row.forEach((v, x) => { if (v) d += `M${x + q},${y + q}h1v1h-1z`; }));
    const dark = opts.dark || "#000", light = opts.light || "#fff";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" shape-rendering="crispEdges" role="img" aria-label="${String(opts.label || "QR code").replace(/[&<>"]/g, "")}">` +
      `<rect width="${full}" height="${full}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
  }

  window.LEONE_QR = { encode, svg };
})();
