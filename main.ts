// The World — 25 November 2026.
// A stdlib-only Node 22 program that draws a newspaper front page (1024x1024 PNG)
// summing up the day's world news, and writes it to /output/entry.png.
// No network, no randomness, no clock: two runs write identical bytes.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ------------------------------------------------------------------ CRC32
const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ------------------------------------------------------------------ PNG
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width: number, height: number, rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter: none
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (1 + width * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ 5x7 font
// Each glyph is 7 rows of 5 cells ('#' = ink). Only capitals are needed:
// all copy is set in capitals, newspaper style.
const GLYPHS: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#..##', '#.#.#', '##..#', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.....', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '(': ['...##', '..#..', '.#...', '.#...', '.#...', '..#..', '...##'],
  ')': ['##...', '..#..', '...#.', '...#.', '...#.', '..#..', '##...'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '&': ['.##..', '#..#.', '#..#.', '.#...', '#.#.#', '#..#.', '.##.#'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '#.##.', '#..##'],
  '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'],
};

function normalize(text: string): string {
  return text
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/•/g, '-')
    .toUpperCase();
}

// ------------------------------------------------------------------ canvas
const W = 1024;
const H = 1024;
const INK = 0;
const PAPER = 255;

class Page {
  pixels = new Uint8Array(W * H * 3).fill(PAPER);

  px(x: number, y: number): void {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = (y * W + x) * 3;
    this.pixels[i] = INK;
    this.pixels[i + 1] = INK;
    this.pixels[i + 2] = INK;
  }

  rect(x: number, y: number, w: number, h: number): void {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) this.px(xx, yy);
  }

  char(x: number, y: number, ch: string, s: number): void {
    const g = GLYPHS[ch] ?? GLYPHS['?'];
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 5; c++)
        if (g[r][c] === '#') this.rect(x + c * s, y + r * s, s, s);
  }

  textWidth(text: string, s: number): number {
    const t = normalize(text);
    if (t.length === 0) return 0;
    return t.length * 6 * s - s;
  }

  text(x: number, y: number, text: string, s: number): void {
    const t = normalize(text);
    for (let i = 0; i < t.length; i++) this.char(x + i * 6 * s, y, t[i], s);
  }

  textCenter(cx: number, y: number, text: string, s: number): void {
    this.text(cx - Math.floor(this.textWidth(text, s) / 2), y, text, s);
  }

  // Wrap normalized text to lines fitting maxW. Returns the lines.
  wrap(text: string, s: number, maxW: number): string[] {
    const words = normalize(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const trial = cur ? cur + ' ' + w : w;
      if (this.textWidth(trial, s) <= maxW) {
        cur = trial;
      } else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // Draw wrapped text; explicit \n forces a break. Returns height used.
  paragraph(x: number, y: number, text: string, s: number, maxW: number, lh: number): number {
    let yy = y;
    for (const part of text.split('\n')) {
      for (const line of this.wrap(part, s, maxW)) {
        this.text(x, yy, line, s);
        yy += lh;
      }
    }
    return yy - y;
  }
}

// ------------------------------------------------------------------ stories
// All six stories happened on, or were first reported on, 25 November 2026.
interface Story {
  kicker: string;
  headline: string; // \n forces a line break
  deck: string;
  source: string;
}

const LEAD: Story = {
  kicker: 'CYBERATTACK',
  headline: "CIA AND SPY CHIEF'S OFFICE\nHIT BY CYBERATTACK",
  deck: "THE CIA AND THE SPY CHIEF'S OFFICE WERE HIT IN AN APPARENT HACK OF AN UNCLASSIFIED SYSTEM. NO CLASSIFIED DATA WAS TOUCHED. EARLY SIGNS POINT TO CHINA.",
  source: 'CNN',
};

const GRID: Story[] = [
  {
    kicker: 'TRADE SECRETS',
    headline: 'HUAWEI GUILTY OF\nTRADE-SECRETS THEFT',
    deck: 'A U.S. JURY FOUND HUAWEI GUILTY ON 10 OF 12 COUNTS, INCLUDING BANK FRAUD.',
    source: 'AFP',
  },
  {
    kicker: 'DEPORTATION',
    headline: 'ABREGO GARCIA\nFLIES TO SPAIN',
    deck: 'HE FLEW TO MADRID UNDER A DEAL THAT SPARED HIM DEPORTATION TO LIBERIA.',
    source: 'ABC NEWS',
  },
  {
    kicker: 'EBOLA',
    headline: 'WHO PULLS STAFF OUT\nOF CONGO HOSPITAL',
    deck: 'STAFF LEFT A HOSPITAL IN ITURI AFTER THREE DAYS SHELTERING FROM FIGHTING.',
    source: 'WHO',
  },
  {
    kicker: 'IOWA',
    headline: 'ARMY TO BLAST\nLEAD AZIDE',
    deck: '9,500 LB GOES UP AT 9 A.M. TODAY, THE LARGEST SUCH BLAST IN NEARLY 50 YEARS.',
    source: 'DES MOINES REGISTER',
  },
];

const SPORT: Story = {
  kicker: 'SPORT',
  headline: '15-YEAR-OLD SMASHES 204 OFF 53 BALLS',
  deck: 'VAIBHAV SURYAVANSHI HIT 204 OFF 53 BALLS, WITH 28 SIXES — THE FASTEST LIST A DOUBLE CENTURY EVER.',
  source: 'MYKHEL',
};

// ------------------------------------------------------------------ layout
const MX = 32; // side margin
const CW = W - MX * 2; // 960 content width

function drawStory(p: Page, x: number, y: number, w: number, s: Story, headScale: number, deckScale: number): number {
  let yy = y;
  p.text(x, yy, s.kicker, 2);
  yy += 20;
  yy += p.paragraph(x, yy, s.headline, headScale, w, headScale * 8);
  yy += 8;
  yy += p.paragraph(x, yy, s.deck, deckScale, w, deckScale * 8);
  yy += 8;
  p.text(x, yy, 'SOURCE: ' + s.source, 2);
  yy += 14;
  return yy - y;
}

function main(): void {
  const p = new Page();

  // Frame: outer thick border + thin inner rule.
  p.rect(12, 12, W - 24, 4);
  p.rect(12, H - 16, W - 24, 4);
  p.rect(12, 12, 4, H - 24);
  p.rect(W - 16, 12, 4, H - 24);
  p.rect(22, 22, W - 44, 2);
  p.rect(22, H - 24, W - 44, 2);

  let y = 36;
  // Masthead
  p.textCenter(W / 2, y, 'THE WORLD', 12);
  y += 12 * 7 + 12;
  p.textCenter(W / 2, y, 'WEDNESDAY, 25 NOVEMBER 2026', 3);
  y += 3 * 7 + 10;
  p.rect(MX, y, CW, 5);
  y += 14;

  // Lead story, full width
  y += drawStory(p, MX, y, CW, LEAD, 5, 3);
  y += 10;
  p.rect(MX, y, CW, 3);
  y += 16;

  // Two-column grid, two rows
  const colW = Math.floor((CW - 24) / 2);
  const rowH = 190;
  for (let r = 0; r < 2; r++) {
    const rowY = y + r * rowH;
    drawStory(p, MX, rowY, colW, GRID[r * 2], 4, 3);
    drawStory(p, MX + colW + 24, rowY, colW, GRID[r * 2 + 1], 4, 3);
    // vertical divider between columns
    p.rect(MX + colW + 11, rowY + 4, 2, rowH - 28);
  }
  y += rowH * 2 + 4;
  p.rect(MX, y, CW, 3);
  y += 16;

  // Sport strip, full width
  y += drawStory(p, MX, y, CW, SPORT, 4, 3);
  y += 8;

  // Footer: sources line only (the date already sits under the masthead).
  p.rect(MX, H - 64, CW, 3);
  p.textCenter(W / 2, H - 48, 'SOURCES: CNN - AFP - ABC NEWS - WHO - DES MOINES REGISTER - MYKHEL', 2);

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), encodePNG(W, H, p.pixels));
}

main();
