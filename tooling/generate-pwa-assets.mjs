#!/usr/bin/env node
/**
 * Генератор PWA-ассетов навигатора.
 *
 * Иконки объявлены в манифесте и в `index.html`, но самих файлов в
 * репозитории не было: по этим адресам SPA-fallback отдавал `index.html`,
 * поэтому установка приложения как PWA не работала.
 *
 * Сейчас брендбук вуза не предоставлен, поэтому генерируется нейтральная
 * заглушка в фирменном синем из `tailwind.config.js`. Скрипт существует,
 * чтобы её можно было пересобрать и чтобы замена на официальные ассеты была
 * воспроизводимой: достаточно поменять функции рисования.
 *
 * Запуск:  node tooling/generate-pwa-assets.mjs
 * Зависимостей нет — PNG кодируется через встроенный zlib.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(repoRoot, 'apps', 'viewer', 'public');

/** Фирменный синий навигатора (primary-500 в tailwind.config.js). */
const BRAND = { r: 0x00, g: 0x63, b: 0xcc };
const WHITE = { r: 0xff, g: 0xff, b: 0xff };

/* ------------------------------------------------------------------ */
/* Кодирование PNG                                                     */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([length, body, crc]);
}

/**
 * Собирает PNG из массива пикселей RGBA.
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba длина = width * height * 4
 */
function encodePng(width, height, rgba) {
  // Каждая строка предваряется байтом фильтра (0 = без фильтрации).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.subarray(y * stride, (y + 1) * stride).forEach((v, i) => {
      raw[y * (stride + 1) + 1 + i] = v;
    });
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // бит на канал
  ihdr[9] = 6; // цветовой тип: RGBA
  ihdr[10] = 0; // сжатие
  ihdr[11] = 0; // фильтр
  ihdr[12] = 0; // без чересстрочности

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ */
/* Рисование                                                           */
/* ------------------------------------------------------------------ */

/**
 * Рендерит иконку «маркер на карте» в скруглённом квадрате.
 * Суперсэмплинг 4×4: форма рисуется на вчетверо большем полотне и
 * усредняется, поэтому края получаются сглаженными без внешних библиотек.
 */
function renderIcon(size) {
  const scale = 4;
  const w = size * scale;
  const h = size * scale;
  const buffer = new Uint8Array(w * h * 4);

  const cornerRadius = size * 0.22 * scale;
  const pinCenterX = w * 0.5;
  const pinCenterY = h * 0.42;
  const pinRadius = size * 0.2 * scale;
  const holeRadius = size * 0.085 * scale;
  const tipY = h * 0.8;
  const tipHalfWidth = size * 0.105 * scale;
  const shoulderY = pinCenterY + pinRadius * 0.55;

  const inRoundedRect = (x, y) => {
    const left = cornerRadius;
    const right = w - cornerRadius;
    const top = cornerRadius;
    const bottom = h - cornerRadius;

    if (x < cornerRadius || x > w - cornerRadius || y < cornerRadius || y > h - cornerRadius) {
      const cx = Math.min(Math.max(x, left), right);
      const cy = Math.min(Math.max(y, top), bottom);
      return Math.hypot(x - cx, y - cy) <= cornerRadius;
    }
    return true;
  };

  const inTriangle = (x, y) => {
    if (y < shoulderY || y > tipY) return false;
    const t = (y - shoulderY) / (tipY - shoulderY);
    const halfWidth = tipHalfWidth * (1 - t);
    return Math.abs(x - pinCenterX) <= halfWidth;
  };

  const inPin = (x, y) =>
    Math.hypot(x - pinCenterX, y - pinCenterY) <= pinRadius || inTriangle(x, y);

  const inHole = (x, y) => Math.hypot(x - pinCenterX, y - pinCenterY) <= holeRadius;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;

      if (!inRoundedRect(x, y)) {
        buffer[i + 3] = 0; // прозрачно за пределами скруглённого квадрата
        continue;
      }

      const color = inPin(x, y) && !inHole(x, y) ? WHITE : BRAND;
      buffer[i] = color.r;
      buffer[i + 1] = color.g;
      buffer[i + 2] = color.b;
      buffer[i + 3] = 255;
    }
  }

  // Усреднение суперсэмпла.
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const i = ((y * scale + sy) * w + (x * scale + sx)) * 4;
          r += buffer[i];
          g += buffer[i + 1];
          b += buffer[i + 2];
          a += buffer[i + 3];
        }
      }

      const n = scale * scale;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }

  return encodePng(size, size, out);
}

/**
 * Маскируемая иконка: фигура занимает меньшую площадь, а фон залит целиком,
 * чтобы адаптивные оболочки Android не обрезали изображение.
 */
function renderMaskableIcon(size) {
  const buffer = new Uint8Array(size * size * 4);
  const inner = renderIcon(Math.round(size * 0.7));
  const innerSize = Math.round(size * 0.7);
  const offset = Math.round((size - innerSize) / 2);

  // Фон без скруглений.
  for (let i = 0; i < size * size; i++) {
    buffer[i * 4] = BRAND.r;
    buffer[i * 4 + 1] = BRAND.g;
    buffer[i * 4 + 2] = BRAND.b;
    buffer[i * 4 + 3] = 255;
  }

  // Накладываем внутреннюю иконку с альфа-композитингом.
  for (let y = 0; y < innerSize; y++) {
    for (let x = 0; x < innerSize; x++) {
      const si = (y * innerSize + x) * 4;
      const alpha = inner[si + 3] / 255;
      if (alpha === 0) continue;

      const di = ((y + offset) * size + (x + offset)) * 4;
      for (let c = 0; c < 3; c++) {
        buffer[di + c] = Math.round(inner[si + c] * alpha + buffer[di + c] * (1 - alpha));
      }
      buffer[di + 3] = 255;
    }
  }

  return encodePng(size, size, buffer);
}

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0063CC"/>
  <path d="M32 12a13 13 0 0 0-13 13c0 9.5 13 25 13 25s13-15.5 13-25a13 13 0 0 0-13-13z" fill="#fff"/>
  <circle cx="32" cy="25" r="5" fill="#0063CC"/>
</svg>
`;

const ROBOTS_TXT = `# Навигатор по корпусам — внутренний сервис, индексация не нужна.
User-agent: *
Disallow: /
`;

/* ------------------------------------------------------------------ */

mkdirSync(publicDir, { recursive: true });

const outputs = [
  ['favicon.svg', FAVICON_SVG],
  ['robots.txt', ROBOTS_TXT],
  ['apple-touch-icon.png', renderIcon(180)],
  ['pwa-192x192.png', renderIcon(192)],
  ['pwa-512x512.png', renderIcon(512)],
  ['pwa-maskable-512x512.png', renderMaskableIcon(512)],
];

for (const [name, content] of outputs) {
  const target = path.join(publicDir, name);
  writeFileSync(target, content);
  const size = Buffer.byteLength(content);
  console.log(`  ${name.padEnd(26)} ${size.toLocaleString('ru-RU')} байт`);
}

console.log(`\nСгенерировано ${outputs.length} файлов в ${path.relative(repoRoot, publicDir)}`);
