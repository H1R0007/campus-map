import { describe, expect, it } from 'vitest';
import { cleanSheet, isStampText, stampBoxes } from '../src/import/sheetClean';
import { traceBuildingOutline } from '../src/import/outline';
import { traceOnSheet } from '../src/import/traceSheet';

/** Очистка листа перед поиском здания и полей (запись 82). */

const W = 300;
const H = 200;
/** Белый лист и штрихи по прямоугольникам [x0, y0, x1, y1) — тёмные. */
function sheet(...rects: [number, number, number, number][]) {
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) data.set([30, 30, 30, 255], (y * W + x) * 4);
  }
  return { width: W, height: H, data };
}
const dark = (src: { data: Uint8ClampedArray }, x: number, y: number) => src.data[(y * W + x) * 4] < 128;
/** Рамка-прямоугольник линией в 2 px. */
const outline = (x0: number, y0: number, x1: number, y1: number): [number, number, number, number][] => [
  [x0, y0, x1, y0 + 2],
  [x0, y1 - 2, x1, y1],
  [x0, y0, x0 + 2, y1],
  [x1 - 2, y0, x1, y1],
];

describe('надписи штампов', () => {
  it('штамп и заголовок узнаются, номера помещений — нет', () => {
    for (const text of ['ПОЭТАЖНЫЙ ПЛАН', 'Масштаб 1:200', 'Лист', 'Формат А4', '2 ЭТАЖ', 'ПОДВАЛ', 'Корпус А. План 1 этажа', 'ГБУ МосгорБТИ', 'Исполнитель', 'Проверил']) {
      expect(isStampText(text), text).toBe(true);
    }
    for (const text of ['А-101', '12,5', 'Лестница', 'Листопад', 'Кафедра АХЧ', 'Обтирочная']) {
      expect(isStampText(text), text).toBe(false);
    }
  });

  it('прямоугольник надписи — в пикселях повёрнутого листа', () => {
    const label = { text: 'Масштаб 1:200', x: 100, y: 50, width: 40, height: 10 };
    // Без поворота, область с (10, 0), масштаб 2: x 180…260, y 80…100.
    expect(stampBoxes([label], { width: 300, height: 200 }, 0, { x: 10, y: 0, width: 290, height: 200 }, 2)).toEqual([{ x: 180, y: 80, width: 80, height: 20 }]);
    // Поворот по часовой: точка (x, y) листа 300 × 200 встаёт в (200 − y, x).
    const [turned] = stampBoxes([label], { width: 300, height: 200 }, 90, { x: 0, y: 0, width: 200, height: 300 }, 1);
    expect(turned.x).toBeCloseTo(150, 6);
    expect(turned.y).toBeCloseTo(100, 6);
    expect(turned.width).toBeCloseTo(10, 6);
    expect(turned.height).toBeCloseTo(40, 6);
  });
});

describe('рамка листа', () => {
  it('стирается, а здание остаётся', () => {
    const clean = cleanSheet(sheet(...outline(6, 6, 294, 194), [60, 50, 160, 150]));
    expect(dark(clean, 150, 6)).toBe(false);
    expect(dark(clean, 6, 100)).toBe(false);
    expect(dark(clean, 100, 100)).toBe(true);
  });

  it('стена здания у края без рамки — не рамка', () => {
    // Здание у левого края: длинная стена в полосе края, но с одной стороны листа.
    const clean = cleanSheet(sheet(...outline(5, 20, 150, 180)));
    expect(dark(clean, 5, 100)).toBe(true);
  });

  it('без «frame» рамка не трогается: на картинке — рамка вокруг здания', () => {
    const clean = cleanSheet(sheet(...outline(6, 6, 294, 194), [60, 50, 160, 150]), { frame: false });
    expect(dark(clean, 150, 6)).toBe(true);
  });
});

describe('здание в плотной обрезке', () => {
  it('Г-образное здание в 3 px от края — Г, а не вся картинка', () => {
    // Стены линией в 2 px: верхнее крыло во всю ширину, нижнее — слева.
    const walls: [number, number, number, number][] = [
      [3, 3, 197, 5],
      [195, 3, 197, 60],
      [100, 58, 197, 60],
      [100, 58, 102, 97],
      [3, 95, 102, 97],
      [3, 3, 5, 97],
      // Комнаты: без стен внутри пустой контур похож на рамку листа с полем бумаги.
      ...[35, 65, 95, 125, 155].map((x): [number, number, number, number] => [x, 3, x + 2, 60]),
      [3, 78, 102, 80],
    ];
    const data = new Uint8ClampedArray(200 * 100 * 4).fill(255);
    for (const [x0, y0, x1, y1] of walls) for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) data.set([30, 30, 30, 255], (y * 200 + x) * 4);
    const found = traceBuildingOutline({ width: 200, height: 100, data })!;
    // Вырез Г — снаружи: точка (150, 85) не внутри контура.
    let inside = false;
    for (let i = 0, j = found.length - 1; i < found.length; j = i, i += 1) {
      const a = found[i];
      const b = found[j];
      if (a.y > 85 !== b.y > 85 && 150 < ((b.x - a.x) * (85 - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    expect(inside, found.map((p) => `${p.x},${p.y}`).join(' ')).toBe(false);
    expect(found.length).toBeGreaterThanOrEqual(6);
  });
});

describe('здание вплотную к краю обрезки', () => {
  it('прямоугольное здание в 3 px от всех краёв — по стенам, а не по краю картинки', () => {
    const walls: [number, number, number, number][] = [
      ...outline(3, 3, 197, 97),
      ...[40, 80, 120, 160].map((x): [number, number, number, number] => [x, 3, x + 2, 97]),
      [3, 50, 197, 52],
    ];
    const data = new Uint8ClampedArray(200 * 100 * 4).fill(255);
    for (const [x0, y0, x1, y1] of walls) for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) data.set([30, 30, 30, 255], (y * 200 + x) * 4);
    const found = traceBuildingOutline({ width: 200, height: 100, data })!;
    const xs = found.map((p) => p.x);
    const ys = found.map((p) => p.y);
    // Без поля бумаги вокруг зданием становилась вся картинка: от 0 до края.
    expect(Math.min(...xs), found.map((p) => `${p.x},${p.y}`).join(' ')).toBeGreaterThanOrEqual(2);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...xs)).toBeLessThanOrEqual(198);
  });
});

describe('поиск на листе', () => {
  /** Лист-подделка: рисует белое поле с квадратом-зданием и запоминает, какую область просили. */
  const fakeSheet = () => {
    const asked: { x: number; y: number; width: number; height: number }[] = [];
    return {
      asked,
      sheet: {
        size: { width: 300, height: 200 },
        labels: [],
        render: async (_rotation: number, area: { x: number; y: number; width: number; height: number } | null, scale: number) => {
          const region = area ?? { x: 0, y: 0, width: 300, height: 200 };
          asked.push(region);
          const width = Math.round(region.width * scale);
          const height = Math.round(region.height * scale);
          const data = new Uint8ClampedArray(width * height * 4).fill(255);
          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
              const px = region.x + x / scale;
              const py = region.y + y / scale;
              if (px > 100 && px < 200 && py > 50 && py < 150) data.set([30, 30, 30, 255], (y * width + x) * 4);
            }
          }
          return { width, height, getContext: () => ({ getImageData: () => ({ data }) }) } as unknown as HTMLCanvasElement;
        },
      },
    };
  };

  it('почти весь лист — ищется весь: обрезка не срезает рамке стороны', async () => {
    const { asked, sheet } = fakeSheet();
    const found = await traceOnSheet(sheet, 0, { x: 5, y: 0, width: 295, height: 195 });
    expect(asked[0]).toEqual({ x: 0, y: 0, width: 300, height: 200 });
    expect(found).not.toBeNull();
  });

  it('рамка вокруг здания — ищется в ней', async () => {
    const { asked, sheet } = fakeSheet();
    await traceOnSheet(sheet, 0, { x: 90, y: 40, width: 120, height: 120 });
    expect(asked[0]).toEqual({ x: 90, y: 40, width: 120, height: 120 });
  });
});

describe('штампы по надписям', () => {
  // Здание и таблица штампа справа внизу с текстом внутри.
  const drawing = (): [number, number, number, number][] => [
    ...outline(30, 30, 170, 150),
    [30, 90, 170, 92],
    ...outline(220, 160, 290, 190),
    [222, 174, 288, 175],
    [228, 166, 260, 171],
  ];
  const label = { x: 227, y: 164, width: 35, height: 9 };

  it('таблица с надписью штампа стирается целиком, здание — нет', () => {
    const clean = cleanSheet(sheet(...drawing()), { frame: false, stamps: [label] });
    expect(dark(clean, 240, 160)).toBe(false);
    expect(dark(clean, 240, 168)).toBe(false);
    expect(dark(clean, 240, 174)).toBe(false);
    expect(dark(clean, 30, 100)).toBe(true);
  });

  it('надпись внутри здания здание не стирает', () => {
    const clean = cleanSheet(sheet(...drawing()), { frame: false, stamps: [{ x: 60, y: 60, width: 30, height: 9 }] });
    expect(dark(clean, 30, 100)).toBe(true);
    expect(dark(clean, 100, 91)).toBe(true);
  });

  it('маленькое здание с надписью внутри не стирается: самый большой кусок — здание', () => {
    // Здание меньше пятой части листа — «таблицей» по размеру оно бы сошло.
    const clean = cleanSheet(sheet(...outline(40, 40, 140, 140), [40, 90, 140, 92]), { frame: false, stamps: [{ x: 60, y: 60, width: 30, height: 9 }] });
    expect(dark(clean, 40, 100)).toBe(true);
    expect(dark(clean, 100, 91)).toBe(true);
  });

  it('заголовок из двух слов стирается по прямоугольнику надписи', () => {
    // «2 ЭТАЖ»: два слова-куска, середина надписи — в пробеле между ними.
    const clean = cleanSheet(sheet(...outline(30, 60, 170, 180), [30, 120, 170, 122], [60, 20, 80, 30], [100, 20, 140, 30]), {
      frame: false,
      stamps: [{ x: 60, y: 20, width: 80, height: 10 }],
    });
    expect(dark(clean, 70, 25)).toBe(false);
    expect(dark(clean, 120, 25)).toBe(false);
    expect(dark(clean, 30, 100)).toBe(true);
  });

  it('кусок под щелчком «здание здесь» не стирается', () => {
    const clean = cleanSheet(sheet(...drawing()), { frame: false, stamps: [label], keep: { x: 221, y: 175 } });
    expect(dark(clean, 240, 160)).toBe(true);
  });
});
