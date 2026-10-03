/**
 * Тестовые «фото» точек кампуса — нарисованные, не снятые (запись 85).
 *
 * Репозиторий публичный: настоящие фото вуза в нём не лежат. Навигатору и
 * проверкам нужны картинки, похожие на фото по весу и размеру, поэтому здесь
 * они рисуются фигурами: коридор с кофейным автоматом, дверь с табличкой,
 * вход в корпус. В углу каждой — «ТЕСТ», чтобы её не приняли за настоящую.
 *
 * Каждая картинка помечена в самом файле (`tEXt` PNG, `TEST_PHOTO_MARK`):
 * по этой пометке тесты ядра отличают тестовую картинку от настоящего фото,
 * случайно сохранённого в `data/photos/`.
 *
 * Сцена описана в условных единицах 320 × 240 и рисуется с двойным
 * сглаживанием: на полотне вдвое крупнее, затем усредняется.
 */

import { createHash } from 'node:crypto';
import { encodePng } from './png.mjs';

/** Пометка тестовой картинки в PNG. */
export const TEST_PHOTO_MARK = { 'campus-map': 'test-photo' };

/** Полное фото — как у настоящих, маленькое — вдвое меньше по каждой стороне. */
export const TEST_PHOTO_SIZE = { width: 1280, height: 960 };

const SCENE = { width: 320, height: 240 };
const SUPERSAMPLE = 2;

/* ------------------------------------------------------------------ */
/* Полотно                                                             */
/* ------------------------------------------------------------------ */

function hex(color) {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function createCanvas(width, height) {
  const scale = (width / SCENE.width) * SUPERSAMPLE;
  const w = width * SUPERSAMPLE;
  const h = height * SUPERSAMPLE;
  const pixels = new Uint8Array(w * h * 3);

  /** Заливка многоугольника по правилу чёт-нечет, точки — в единицах сцены. */
  function polygon(points, color) {
    const [r, g, b] = hex(color);
    const scaled = points.map(([x, y]) => [x * scale, y * scale]);
    const top = Math.max(0, Math.floor(Math.min(...scaled.map((p) => p[1]))));
    const bottom = Math.min(h - 1, Math.ceil(Math.max(...scaled.map((p) => p[1]))));

    for (let y = top; y <= bottom; y += 1) {
      const cy = y + 0.5;
      const crossings = [];
      for (let i = 0; i < scaled.length; i += 1) {
        const [x1, y1] = scaled[i];
        const [x2, y2] = scaled[(i + 1) % scaled.length];
        if ((y1 <= cy && y2 > cy) || (y2 <= cy && y1 > cy)) crossings.push(x1 + ((cy - y1) / (y2 - y1)) * (x2 - x1));
      }
      crossings.sort((a, c) => a - c);
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        const from = Math.max(0, Math.round(crossings[i]));
        const to = Math.min(w, Math.round(crossings[i + 1]));
        for (let x = from; x < to; x += 1) {
          const at = (y * w + x) * 3;
          pixels[at] = r;
          pixels[at + 1] = g;
          pixels[at + 2] = b;
        }
      }
    }
  }

  const rect = (x, y, width, height, color) =>
    polygon(
      [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
      ],
      color
    );

  /** Круг многоугольником — для ручки двери хватает. */
  function circle(cx, cy, radius, color) {
    const points = [];
    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2;
      points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
    }
    polygon(points, color);
  }

  /** Строка пиксельным шрифтом 5 × 7; `size` — высота буквы в единицах сцены. */
  function text(value, x, y, size, color) {
    const cell = size / 7;
    let cursor = x;
    for (const char of value) {
      const glyph = GLYPHS[char];
      if (!glyph) throw new Error(`Нет буквы «${char}» в шрифте тестовых фото`);
      glyph.forEach((row, rowIndex) => {
        [...row].forEach((bit, column) => {
          if (bit === '#') rect(cursor + column * cell, y + rowIndex * cell, cell, cell, color);
        });
      });
      cursor += cell * 6;
    }
  }

  /** Ширина строки в единицах сцены. */
  const textWidth = (value, size) => (size / 7) * (value.length * 6 - 1);

  /** Пикселей RGBA размера `width × height`: среднее по квадратам `factor × factor`. */
  function downsample(factor) {
    const outW = w / factor;
    const outH = h / factor;
    const rgba = new Uint8Array(outW * outH * 4);
    const area = factor * factor;
    for (let y = 0; y < outH; y += 1) {
      for (let x = 0; x < outW; x += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let dy = 0; dy < factor; dy += 1) {
          for (let dx = 0; dx < factor; dx += 1) {
            const at = ((y * factor + dy) * w + x * factor + dx) * 3;
            r += pixels[at];
            g += pixels[at + 1];
            b += pixels[at + 2];
          }
        }
        const out = (y * outW + x) * 4;
        rgba[out] = Math.round(r / area);
        rgba[out + 1] = Math.round(g / area);
        rgba[out + 2] = Math.round(b / area);
        rgba[out + 3] = 255;
      }
    }
    return { width: outW, height: outH, rgba };
  }

  return { polygon, rect, circle, text, textWidth, downsample };
}

/* ------------------------------------------------------------------ */
/* Шрифт                                                               */
/* ------------------------------------------------------------------ */

const GLYPHS = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  А: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  В: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  Д: ['.###.', '.#.#.', '.#.#.', '.#.#.', '.#.#.', '#####', '#...#'],
  Е: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  К: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  О: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  П: ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#'],
  Р: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  С: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  Т: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  У: ['#...#', '#...#', '#...#', '.####', '....#', '#...#', '.###.'],
  Х: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
};

/* ------------------------------------------------------------------ */
/* Сцены                                                               */
/* ------------------------------------------------------------------ */

/** Коридор в перспективе: потолок, пол, стены, дальняя стена с дверью. */
function corridor(c) {
  c.rect(0, 0, 320, 240, '#d9d3c6');
  c.polygon([[0, 0], [320, 0], [206, 86], [114, 86]], '#ece8df');
  c.polygon([[0, 240], [320, 240], [206, 152], [114, 152]], '#a8a092');
  c.polygon([[0, 0], [114, 86], [114, 152], [0, 240]], '#cdc6b6');
  c.polygon([[320, 0], [206, 86], [206, 152], [320, 240]], '#c3bbaa');
  c.rect(114, 86, 92, 66, '#e2ddd1');
  c.rect(150, 104, 20, 48, '#8a7e6c');
  c.polygon([[128, 26], [192, 26], [184, 36], [136, 36]], '#fffaf0');
  c.polygon([[140, 56], [180, 56], [176, 62], [144, 62]], '#fffaf0');
  c.polygon([[156, 240], [164, 240], [162, 152], [158, 152]], '#bfb6a5');
}

const SCENES = {
  /** Развилка: проход налево и кофейный автомат за ним. */
  junction(c) {
    corridor(c);
    c.polygon([[24, 24], [66, 55], [66, 182], [24, 214]], '#8f877b');
    c.polygon([[24, 214], [66, 182], [92, 182], [60, 214]], '#bdb4a3');
    c.polygon([[72, 60], [100, 80], [100, 166], [72, 186]], '#9b3a2c');
    c.polygon([[76, 72], [96, 86], [96, 112], [76, 99]], '#f2dcaa');
    c.polygon([[80, 124], [92, 132], [92, 146], [80, 139]], '#3b2a24');
    c.polygon([[248, 70], [282, 48], [282, 116], [248, 130]], '#ece6d8');
  },

  /** Дверь аудитории с табличкой «А-305». */
  door305(c) {
    c.rect(0, 0, 320, 240, '#e3ded3');
    c.rect(0, 206, 320, 34, '#b3ab9c');
    c.rect(96, 30, 96, 176, '#5f5141');
    c.rect(104, 38, 80, 168, '#7f6b55');
    c.rect(112, 48, 64, 70, '#8d7861');
    c.rect(112, 128, 64, 70, '#8d7861');
    c.circle(174, 124, 5, '#d8c9a6');
    c.rect(206, 68, 70, 34, '#0a3f86');
    c.text('А-305', 241 - c.textWidth('А-305', 14) / 2, 78, 14, '#ffffff');
    c.rect(40, 110, 16, 24, '#f4f1ea');
  },

  /** Главный вход корпуса снаружи: стеклянные двери, козырёк, надпись «ВХОД». */
  entrance(c) {
    c.rect(0, 0, 320, 240, '#cfe0ee');
    c.rect(0, 40, 320, 170, '#c9b9a4');
    for (const x of [24, 64, 236, 276]) c.rect(x, 60, 26, 40, '#8fa9bf');
    for (const x of [24, 64, 236, 276]) c.rect(x, 120, 26, 40, '#8fa9bf');
    c.rect(96, 78, 128, 132, '#6d6253');
    c.rect(104, 98, 54, 112, '#a9c3d6');
    c.rect(162, 98, 54, 112, '#a9c3d6');
    c.rect(158, 98, 4, 112, '#6d6253');
    c.polygon([[84, 70], [236, 70], [228, 82], [92, 82]], '#4d453b');
    c.rect(124, 50, 72, 18, '#0a3f86');
    c.text('ВХОД', 160 - c.textWidth('ВХОД', 10) / 2, 54, 10, '#ffffff');
    c.rect(0, 210, 320, 30, '#9d968b');
    c.rect(86, 210, 148, 8, '#b7b0a5');
    c.rect(78, 218, 164, 8, '#c4bdb2');
  },
};

/* ------------------------------------------------------------------ */
/* Файлы                                                               */
/* ------------------------------------------------------------------ */

/** Имя файла по содержимому: 16 знаков SHA-256, как у настоящих фото. */
function fingerprint(buffer) {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}

/**
 * Рисует сцену: полное фото и маленькое, PNG с пометкой тестовой картинки.
 *
 * @param {keyof typeof SCENES} scene
 * @returns {{ file: string, width: number, height: number, full: Buffer, small: Buffer }}
 */
export function renderTestPhoto(scene) {
  const draw = SCENES[scene];
  if (!draw) throw new Error(`Нет тестовой сцены «${scene}»`);

  const { width, height } = TEST_PHOTO_SIZE;
  const canvas = createCanvas(width, height);
  draw(canvas);

  // «ТЕСТ» в углу — поверх сцены, чтобы картинку не приняли за настоящее фото.
  canvas.rect(8, 8, 46, 20, '#ffffff');
  canvas.text('ТЕСТ', 31 - canvas.textWidth('ТЕСТ', 8) / 2, 14, 8, '#b42318');

  const big = canvas.downsample(SUPERSAMPLE);
  const little = canvas.downsample(SUPERSAMPLE * 2);
  const full = encodePng(big.width, big.height, big.rgba, TEST_PHOTO_MARK);
  const small = encodePng(little.width, little.height, little.rgba, TEST_PHOTO_MARK);

  return { file: `${fingerprint(full)}.png`, width: big.width, height: big.height, full, small };
}

export const TEST_PHOTO_SCENES = Object.keys(SCENES);
