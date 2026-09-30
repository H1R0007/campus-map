/**
 * Линии из картинки плана (запись 62) — без чертежа, по самим пикселям.
 *
 * Наложение двух планов полупрозрачностью смешивало заливки в кашу. Вместо
 * этого эталон рисуется поверх цветными линиями, а под ним виден второй план
 * целиком. Линии берутся из картинки:
 *
 * - `darkLines` — стены: тёмное становится цветным, светлое (лист, заливки
 *   комнат) — прозрачным;
 * - `colorEdges` — границы заливок по перепаду цвета: на генплане здания —
 *   пятна, а не стены;
 * - `outerContour` — только внешний контур здания: щели дверей закрываются,
 *   снаружи — заливка от края картинки, надпись-заголовок отпадает как
 *   отдельный кусок.
 *
 * Функции чистые: пиксели RGBA на входе и на выходе, без холста — их
 * запускает фоновый поток (`lineArt.worker.ts`), их же проверяют тесты.
 */

export interface Pixels {
  width: number;
  height: number;
  /** RGBA по строкам, 4 байта на пиксель. */
  data: Uint8ClampedArray;
}

/** Цвет линий: красный эталон наложения. */
export type Tint = readonly [number, number, number];

export const REFERENCE_TINT: Tint = [224, 49, 122];

/**
 * Насколько чутко искать линии, от 0 до 1: у бледного скана линии светлее, и
 * порог нужно поднять.
 */
export const DEFAULT_STRENGTH = 0.5;

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const luminance = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

function paint(out: Uint8ClampedArray, p: number, tint: Tint, alpha: number): void {
  const i = p * 4;
  out[i] = tint[0];
  out[i + 1] = tint[1];
  out[i + 2] = tint[2];
  out[i + 3] = Math.round(alpha * 255);
}

/** Тёмное — цветом, светлое — прозрачным. */
export function darkLines(src: Pixels, tint: Tint, strength = DEFAULT_STRENGTH): Pixels {
  const hi = 110 + 60 * clamp01(strength);
  const lo = hi - 65;
  const out = new Uint8ClampedArray(src.width * src.height * 4);
  const d = src.data;
  for (let p = 0, i = 0; p < src.width * src.height; p += 1, i += 4) {
    const alpha = clamp01((hi - luminance(d, i)) / (hi - lo)) * (d[i + 3] / 255);
    if (alpha > 0) paint(out, p, tint, alpha);
  }
  return { width: src.width, height: src.height, data: out };
}

/** Перепад цвета — линией: граница заливки, как у здания на генплане. */
export function colorEdges(src: Pixels, tint: Tint, strength = DEFAULT_STRENGTH): Pixels {
  const { width, height, data: d } = src;
  const lo = 60 - 40 * clamp01(strength);
  const hi = lo + 50;
  // Лёгкое размытие 3×3 гасит шум сжатия JPEG, иначе каждый его квадрат —
  // тоже «граница».
  const blur = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const i = (yy * width + xx) * 4;
          r += d[i];
          g += d[i + 1];
          b += d[i + 2];
          n += 1;
        }
      }
      const j = (y * width + x) * 3;
      blur[j] = r / n;
      blur[j + 1] = g / n;
      blur[j + 2] = b / n;
    }
  }
  const at = (x: number, y: number, c: number) =>
    blur[(Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))) * 3 + c];
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let m = 0;
      for (let c = 0; c < 3; c += 1) {
        const gx = at(x + 1, y - 1, c) + 2 * at(x + 1, y, c) + at(x + 1, y + 1, c) - at(x - 1, y - 1, c) - 2 * at(x - 1, y, c) - at(x - 1, y + 1, c);
        const gy = at(x - 1, y + 1, c) + 2 * at(x, y + 1, c) + at(x + 1, y + 1, c) - at(x - 1, y - 1, c) - 2 * at(x, y - 1, c) - at(x + 1, y - 1, c);
        m += gx * gx + gy * gy;
      }
      const alpha = clamp01((Math.sqrt(m) / 4 - lo) / (hi - lo));
      if (alpha > 0) paint(out, y * width + x, tint, alpha);
    }
  }
  return { width, height, data: out };
}

/** Расширение маски квадратом радиуса `r`: построчно, затем по столбцам. */
export function dilate(mask: Uint8Array, width: number, height: number, r: number): Uint8Array {
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    let last = -Infinity;
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x]) last = x;
      if (x - last <= r) tmp[y * width + x] = 1;
    }
    last = Infinity;
    for (let x = width - 1; x >= 0; x -= 1) {
      if (mask[y * width + x]) last = x;
      if (last - x <= r) tmp[y * width + x] = 1;
    }
  }
  for (let x = 0; x < width; x += 1) {
    let last = -Infinity;
    for (let y = 0; y < height; y += 1) {
      if (tmp[y * width + x]) last = y;
      if (y - last <= r) out[y * width + x] = 1;
    }
    last = Infinity;
    for (let y = height - 1; y >= 0; y -= 1) {
      if (tmp[y * width + x]) last = y;
      if (last - y <= r) out[y * width + x] = 1;
    }
  }
  return out;
}

/** Цвет листа — самый частый цвет по краю картинки (с точностью до 8 единиц). */
export function pageColor(src: Pixels): [number, number, number] {
  const { width, height, data: d } = src;
  const counts = new Map<number, number>();
  const add = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (let x = 0; x < width; x += 1) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    add(0, y);
    add(width - 1, y);
  }
  let best = 0;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return [((best >> 10) & 31) * 8 + 4, ((best >> 5) & 31) * 8 + 4, (best & 31) * 8 + 4];
}

/** Ширина щели двери, которую закрывает силуэт, — от размера картинки. */
const gapOf = (width: number, height: number) => Math.max(4, Math.round(Math.max(width, height) * 0.018));

/**
 * Силуэт здания: маска 0/1 размером с картинку, 1 — внутри внешнего контура.
 *
 * Всё, что отличается от цвета листа, — здание; щели дверей закрываются
 * расширением на `gap`; снаружи — то, до чего дотекает заливка от края
 * картинки; расширение возвращается назад; остаётся самый большой кусок —
 * надпись-заголовок и штамп отпадают.
 *
 * @param gap ширина щели, которую закрыть, пиксели; по умолчанию — от размера картинки
 */
export function silhouette(src: Pixels, gap = gapOf(src.width, src.height)): Uint8Array {
  const { width, height, data: d } = src;
  const size = width * height;
  const bg = pageColor(src);
  const content = new Uint8Array(size);
  for (let p = 0, i = 0; p < size; p += 1, i += 4) {
    const dist = Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
    content[p] = dist > 40 && d[i + 3] > 0 ? 1 : 0;
  }
  const closed = dilate(content, width, height, gap);

  // Снаружи — куда дотекает заливка от края по «пустому».
  const outside = new Uint8Array(size);
  const stack = new Int32Array(size);
  let top = 0;
  const push = (x: number, y: number) => {
    const p = y * width + x;
    if (outside[p] || closed[p]) return;
    outside[p] = 1;
    stack[top++] = p;
  };
  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }
  while (top > 0) {
    const p = stack[--top];
    const x = p % width;
    const y = (p - x) / width;
    if (x + 1 < width) push(x + 1, y);
    if (x > 0) push(x - 1, y);
    if (y + 1 < height) push(x, y + 1);
    if (y > 0) push(x, y - 1);
  }

  // Расширение назад: снаружи растёт на `gap` обратно к стенам.
  const outsideBack = dilate(outside, width, height, gap);

  // Самый большой связный кусок «внутри».
  const label = new Int32Array(size);
  let best = 0;
  let bestSize = 0;
  let next = 0;
  for (let start = 0; start < size; start += 1) {
    if (outsideBack[start] || label[start]) continue;
    next += 1;
    let count = 0;
    top = 0;
    stack[top++] = start;
    label[start] = next;
    while (top > 0) {
      const p = stack[--top];
      count += 1;
      const x = p % width;
      const y = (p - x) / width;
      const visit = (q: number) => {
        if (!outsideBack[q] && !label[q]) {
          label[q] = next;
          stack[top++] = q;
        }
      };
      if (x + 1 < width) visit(p + 1);
      if (x > 0) visit(p - 1);
      if (y + 1 < height) visit(p + width);
      if (y > 0) visit(p - width);
    }
    if (count > bestSize) {
      bestSize = count;
      best = next;
    }
  }

  const mask = new Uint8Array(size);
  if (best !== 0) for (let p = 0; p < size; p += 1) if (label[p] === best) mask[p] = 1;
  return mask;
}

/**
 * Внешний контур здания (запись 62) — граница силуэта (`silhouette`)
 * толщиной в несколько пикселей.
 *
 * @param gap ширина щели, которую закрыть, пиксели; по умолчанию — от размера картинки
 */
export function outerContour(src: Pixels, tint: Tint, gap = gapOf(src.width, src.height)): Pixels {
  const { width, height } = src;
  const size = width * height;
  const inside = silhouette(src, gap);

  // Граница куска, толщиной в несколько пикселей — видна при любом приближении.
  const edge = new Uint8Array(size);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      if (!inside[p]) continue;
      const border = x === 0 || y === 0 || x === width - 1 || y === height - 1 || !inside[p - 1] || !inside[p + 1] || !inside[p - width] || !inside[p + width];
      if (border) edge[p] = 1;
    }
  }
  const thick = dilate(edge, width, height, Math.max(2, Math.round(Math.max(width, height) * 0.0025)));
  const out = new Uint8ClampedArray(size * 4);
  for (let p = 0; p < size; p += 1) if (thick[p]) paint(out, p, tint, 1);
  return { width, height, data: out };
}

export type LineArtKind = 'lines' | 'edges' | 'contour';

export function lineArt(kind: LineArtKind, src: Pixels, tint: Tint, strength = DEFAULT_STRENGTH): Pixels {
  if (kind === 'lines') return darkLines(src, tint, strength);
  if (kind === 'edges') return colorEdges(src, tint, strength);
  return outerContour(src, tint);
}
