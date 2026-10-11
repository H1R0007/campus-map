import type { MapSize } from '@campus-map/core';
import { dilate, pageColor } from '../overlay/lineArt';
import type { Pixels } from '../overlay/lineArt';
import { applySimilarity, rotatedPage } from './planGeometry';
import type { SheetLabel } from './readers';
import { contentBox } from './trim';
import type { Box } from './trim';

/**
 * Очистка листа перед поиском здания и полей (запись 82): рамка листа и
 * штампы — не здание.
 *
 * Рамка — длинные линии у самого края листа: к ней прилипал чертёж, стоящий
 * близко к краю, а поля «обрезались» по ней, то есть никак. Штамп и заголовок
 * узнаются по надписям PDF («ПОЭТАЖНЫЙ ПЛАН», «Масштаб», «Исполнитель»,
 * «2 ЭТАЖ»…): стирается надпись и таблица, в которой она стоит. У картинки
 * надписей нет — у неё стирается только рамка.
 *
 * Чтобы не навредить: самый большой кусок чертежа (здание) и кусок под
 * щелчком «здание здесь» не стираются никогда, а «таблица» больше пятой части
 * листа таблицей не считается.
 */

interface Point {
  x: number;
  y: number;
}

/** Надписи штампов и заголовков листа. Без `\b`: в JavaScript он не видит кириллицу. */
const STAMP_TEXT: readonly RegExp[] = [
  /поэтажн/i,
  /экспликац/i,
  /масштаб/i,
  /исполнител/i,
  /проверил/i,
  /(^|[^а-яё])бти([^а-яё]|$)/i,
  /мосгорбти/i,
  /^формат/i,
  /^лист([\s.:№]|$)/i,
  /разрешен/i,
  /согласован/i,
  /сведения/i,
  /^подпись/i,
  /^дата([\s.:]|$)/i,
  /^изм([\s.]|$)/i,
  /этаж/i,
  /подвал/i,
  /цоколь/i,
  /мансард/i,
  /чердак/i,
  /^план([\s.]|$)/i,
  /план\s+\d/i,
];

export const isStampText = (text: string): boolean => STAMP_TEXT.some((pattern) => pattern.test(text.trim()));

/**
 * Надписи штампов — прямоугольники в пикселях картинки, на которой нарисована
 * область `area` повёрнутого листа в масштабе `scale`.
 */
export function stampBoxes(labels: readonly SheetLabel[], size: MapSize, rotation: number, area: Box, scale: number): Box[] {
  const { turn } = rotatedPage(size, rotation);
  return labels
    .filter((label) => isStampText(label.text))
    .map((label) => {
      const height = label.height ?? 8;
      const width = label.width ?? height * label.text.length * 0.6;
      // Углы надписи на неповёрнутом листе: от левого нижнего вправо и вверх.
      const corners = [
        { x: label.x, y: label.y },
        { x: label.x + width, y: label.y },
        { x: label.x, y: label.y - height },
        { x: label.x + width, y: label.y - height },
      ].map((corner) => {
        const p = applySimilarity(turn, corner);
        return { x: (p.x - area.x) * scale, y: (p.y - area.y) * scale };
      });
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
    });
}

/** Полоса у края листа, где ищется рамка, — доля стороны. */
const FRAME_BAND = 0.08;
/** Линия рамки — не короче этой доли стороны. */
const FRAME_RUN = 0.6;
/** «Таблица» штампа — не больше этой доли листа. */
const STAMP_MAX_SHARE = 0.2;

/**
 * Длинные линии у края — пиксели рамки листа. Рамка замкнута: линии хотя бы с
 * трёх сторон, иначе это не рамка, а, скорее, стена здания у края листа.
 */
function frameLines(content: Uint8Array, width: number, height: number): Uint8Array {
  const frame = new Uint8Array(content.length);
  let found = false;
  const mark = (along: number, across: number, horizontal: boolean) => {
    const length = horizontal ? width : height;
    const at = (i: number) => (horizontal ? across * width + i : i * width + across);
    let start = -1;
    let gap = 0;
    const flush = (end: number) => {
      if (start >= 0 && end - start >= length * FRAME_RUN) {
        found = true;
        for (let i = start; i < end; i += 1) if (content[at(i)]) frame[at(i)] = 1;
      }
      start = -1;
      gap = 0;
    };
    for (let i = 0; i < along; i += 1) {
      if (content[at(i)]) {
        if (start < 0) start = i;
        gap = 0;
      } else if (start >= 0 && (gap += 1) > 2) flush(i - gap + 1);
    }
    flush(along - gap);
  };
  const rows = Math.max(1, Math.round(height * FRAME_BAND));
  const columns = Math.max(1, Math.round(width * FRAME_BAND));
  const sides = [
    () => { for (let y = 0; y < rows; y += 1) mark(width, y, true); },
    () => { for (let y = height - rows; y < height; y += 1) mark(width, y, true); },
    () => { for (let x = 0; x < columns; x += 1) mark(height, x, false); },
    () => { for (let x = width - columns; x < width; x += 1) mark(height, x, false); },
  ];
  let closed = 0;
  for (const side of sides) {
    found = false;
    side();
    if (found) closed += 1;
  }
  return closed >= 3 ? frame : new Uint8Array(content.length);
}

/**
 * Лист без рамки и штампов. `frame` — стирать ли рамку: только когда на
 * картинке весь лист, а не рамка вокруг здания. `stamps` — надписи штампов
 * (`stampBoxes`). `keep` — точка «здание здесь»: её кусок не стирается.
 */
export function cleanSheet(src: Pixels, { frame = true, stamps = [], keep }: { frame?: boolean; stamps?: readonly Box[]; keep?: Point } = {}): Pixels {
  const { width, height, data } = src;
  const size = width * height;
  const bg = pageColor(src);
  const content = new Uint8Array(size);
  for (let p = 0, i = 0; p < size; p += 1, i += 4) {
    const dist = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
    content[p] = dist > 40 && data[i + 3] > 0 ? 1 : 0;
  }
  const removed = frame ? frameLines(content, width, height) : new Uint8Array(size);

  if (stamps.length > 0) {
    // Куски чертежа без рамки; соседние штрихи одной надписи и таблицы — один кусок.
    const rest = new Uint8Array(size);
    for (let p = 0; p < size; p += 1) rest[p] = content[p] && !removed[p] ? 1 : 0;
    const joined = dilate(rest, width, height, Math.max(1, Math.round(Math.max(width, height) * 0.002)));
    const label = new Int32Array(size);
    const boxes: { x0: number; y0: number; x1: number; y1: number; count: number }[] = [{ x0: 0, y0: 0, x1: 0, y1: 0, count: 0 }];
    const stack = new Int32Array(size);
    for (let start = 0; start < size; start += 1) {
      if (!joined[start] || label[start]) continue;
      const id = boxes.length;
      const box = { x0: width, y0: height, x1: 0, y1: 0, count: 0 };
      let top = 0;
      stack[top++] = start;
      label[start] = id;
      while (top > 0) {
        const p = stack[--top];
        const x = p % width;
        const y = (p - x) / width;
        box.count += rest[p];
        if (x < box.x0) box.x0 = x;
        if (x > box.x1) box.x1 = x;
        if (y < box.y0) box.y0 = y;
        if (y > box.y1) box.y1 = y;
        const visit = (q: number) => {
          if (joined[q] && !label[q]) {
            label[q] = id;
            stack[top++] = q;
          }
        };
        if (x + 1 < width) visit(p + 1);
        if (x > 0) visit(p - 1);
        if (y + 1 < height) visit(p + width);
        if (y > 0) visit(p - width);
      }
      boxes.push(box);
    }
    // Здание — самый большой кусок; и кусок под щелчком «здание здесь».
    let largest = 0;
    for (let id = 1; id < boxes.length; id += 1) if (boxes[id].count > boxes[largest].count) largest = id;
    const kept = keep ? label[Math.min(height - 1, Math.max(0, Math.round(keep.y))) * width + Math.min(width - 1, Math.max(0, Math.round(keep.x)))] : 0;
    const clear = (x0: number, y0: number, x1: number, y1: number, only?: number) => {
      for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(height - 1, Math.ceil(y1)); y += 1) {
        for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(width - 1, Math.ceil(x1)); x += 1) {
          const p = y * width + x;
          if (!content[p]) continue;
          const id = label[p];
          if (id === largest || (kept && id === kept)) continue;
          if (only === undefined || id === only) removed[p] = 1;
        }
      }
    };
    for (const stamp of stamps) {
      const pad = Math.max(2, stamp.height * 0.3);
      // Сама надпись — штрихи внутри её прямоугольника.
      clear(stamp.x - pad, stamp.y - pad, stamp.x + stamp.width + pad, stamp.y + stamp.height + pad);
      // Таблица вокруг надписи — кусок, чей прямоугольник её обнимает, и всё внутри него.
      const cx = stamp.x + stamp.width / 2;
      const cy = stamp.y + stamp.height / 2;
      for (let id = 1; id < boxes.length; id += 1) {
        const b = boxes[id];
        if (id === largest || id === kept || cx < b.x0 || cx > b.x1 || cy < b.y0 || cy > b.y1) continue;
        if ((b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) > size * STAMP_MAX_SHARE) continue;
        clear(b.x0, b.y0, b.x1, b.y1);
      }
    }
  }

  const out = new Uint8ClampedArray(data);
  for (let p = 0; p < size; p += 1) {
    if (!removed[p]) continue;
    out[p * 4] = bg[0];
    out[p * 4 + 1] = bg[1];
    out[p * 4 + 2] = bg[2];
  }
  return { width, height, data: out };
}

/**
 * Поля листа без рамки и штампов: прямоугольник содержимого на картинке всего
 * повёрнутого листа в масштабе `scale`. Без очистки поля «обрезались» по рамке
 * листа — то есть никак.
 */
export function sheetContentBox(src: Pixels, sheet: { labels: readonly SheetLabel[]; size: MapSize }, rotation: number, scale: number): Box | null {
  const page = rotatedPage(sheet.size, rotation).size;
  const clean = cleanSheet(src, { stamps: stampBoxes(sheet.labels, sheet.size, rotation, { x: 0, y: 0, ...page }, scale) });
  return contentBox(clean.data, clean.width, clean.height);
}
