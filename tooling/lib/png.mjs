/**
 * Кодирование PNG без зависимостей — через встроенный zlib.
 *
 * Общее для иконок PWA (`generate-pwa-assets.mjs`) и тестовых фото кампуса
 * (`lib/test-photos.mjs`).
 */

import zlib from 'node:zlib';

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
 * @param {Record<string, string>} [text] текстовые пометки (`tEXt`): ключ → значение, латиницей
 */
export function encodePng(width, height, rgba, text = {}) {
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

  const notes = Object.entries(text).map(([key, value]) => chunk('tEXt', Buffer.from(`${key}\0${value}`, 'latin1')));

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...notes,
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Текстовые пометки PNG (`tEXt`): ключ → значение. Для файла не PNG — `null`.
 * @param {Buffer} buffer
 * @returns {Record<string, string> | null}
 */
export function readPngText(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(signature)) return null;

  const text = {};
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'tEXt') {
      const data = buffer.subarray(offset + 8, offset + 8 + length);
      const zero = data.indexOf(0);
      if (zero > 0) text[data.toString('latin1', 0, zero)] = data.toString('latin1', zero + 1);
    }
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  return text;
}
