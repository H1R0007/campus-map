import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import DxfParser from 'dxf-parser';
import { clueSource, fileClueText, guessPlace, roomNumberClue } from '../src/import/guess';
import type { Clue } from '../src/import/guess';
import { clampBox, contentBox } from '../src/import/trim';
import { composeSvgPlan, dxfToSvg, svgPageSize } from '../src/import/vector';
import { previewPlan } from '../src/import/output';
import type { DxfEntity } from '../src/import/vector';

/**
 * Разбор присланных планов (запись 48): догадка по тексту листа и имени
 * файла, обрезка полей, векторный план без перевода в картинку.
 */

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../tooling/browser/fixtures/plans');

const title = (text: string): Clue => ({ text, origin: 'title' });
const file = (text: string): Clue => ({ text, origin: 'file' });

describe('догадка по заголовку листа', () => {
  it.each([
    ['Корпус А. План 1 этажа', 'А', 1],
    ['Корпус А. План 2-го этажа', 'А', 2],
    ['Корпус А. Этаж 3', 'А', 3],
    ['План третьего этажа корпуса Б', 'Б', 3],
    ['Корп. В, 1-й этаж', 'В', 1],
    ['Корпус №2, этаж 4', '2', 4],
  ])('«%s» → корпус %s, этаж %s', (text, letter, floor) => {
    const guess = guessPlace([title(text)]);
    expect(guess.kind).toBe('floor');
    expect(guess.building?.letter).toBe(letter);
    expect(guess.floor?.floor).toBe(floor);
  });

  it('подвал, цоколь и антресоль', () => {
    expect(guessPlace([title('Корпус А. Подвал')]).floor).toMatchObject({ floor: -1 });
    expect(guessPlace([title('Цокольный этаж')]).floor).toMatchObject({ floor: 0 });
    expect(guessPlace([title('Антресоль 1 этажа')]).floor).toMatchObject({ floor: 1.5, label: '1А' });
    expect(guessPlace([title('План −1 этажа')]).floor).toMatchObject({ floor: -1 });
  });

  it('экспликация — не план; генплан — территория', () => {
    expect(guessPlace([title('Экспликация помещений')]).kind).toBe('skip');
    expect(guessPlace([title('Генеральный план')]).kind).toBe('campus');
    expect(guessPlace([file('genplan.jpg')]).kind).toBe('campus');
  });

  it('слово «корпоративный» — не корпус, «главный корпус» — без буквы', () => {
    expect(guessPlace([title('Корпоративный центр')]).building).toBeNull();
    expect(guessPlace([title('Корпус главный, этаж 2')]).building).toBeNull();
    // Окончание слова — не буква корпуса.
    expect(guessPlace([title('Лестница корпуса')]).building).toBeNull();
  });

  it('ничего не понятно — вида нет, человек выберет сам', () => {
    expect(guessPlace([title('Лист 7'), file('scan0003.jpg')])).toEqual({ kind: null, building: null, floor: null, kindFrom: null });
  });
});

describe('догадка по имени файла', () => {
  it('латиница имени: буква корпуса — кириллицей, и как стояла', () => {
    const guess = guessPlace([file('korpus-B-etazh-2.png')]);
    expect(guess.building).toMatchObject({ letter: 'Б', latin: 'b' });
    expect(guess.floor?.floor).toBe(2);
    expect(guessPlace([file('korpus-V-etazh-1.dxf')]).building?.letter).toBe('В');
    expect(guessPlace([file('korpus-A-podval.jpg')]).floor?.floor).toBe(-1);
  });

  it('дефис в имени — разделитель, а не минус', () => {
    expect(guessPlace([file('etazh-1.png')]).floor?.floor).toBe(1);
    expect(guessPlace([file('floor2.pdf')]).floor?.floor).toBe(2);
  });

  it('имя файла — без расширения и пути, цифры отделены', () => {
    expect(fileClueText('Планы/korpus_A-etazh3.png')).toBe('korpus A-etazh 3');
  });

  it('заголовок листа важнее имени файла, но пробелы берутся из него', () => {
    const guess = guessPlace([file('korpus-A-plany.pdf'), title('План 2-го этажа')]);
    expect(guess.building).toMatchObject({ letter: 'А', from: { origin: 'file' } });
    expect(guess.floor).toMatchObject({ floor: 2, from: { origin: 'title' } });
    expect(clueSource(guess.floor!.from)).toBe('по заголовку листа «План 2-го этажа»');
  });

  it('имя файла и заголовок спорят — прав заголовок', () => {
    // Файл назвали по первому листу, а листов в нём несколько.
    const guess = guessPlace([file('korpus-A-etazh-1.pdf'), title('Корпус Б. План 2-го этажа')]);
    expect(guess.building?.letter).toBe('Б');
    expect(guess.floor?.floor).toBe(2);
  });
});

describe('догадка по номерам помещений', () => {
  it('самый частый корпус и этаж', () => {
    const clue = roomNumberClue(['А-201', 'А-202', 'А-205', 'Б-101', 'лестница']);
    expect(clue).toEqual({ text: 'корпус А, 2 этаж', origin: 'rooms' });
    expect(guessPlace([clue!]).floor?.floor).toBe(2);
  });

  it('один номер или ничья — не догадка', () => {
    expect(roomNumberClue(['А-201'])).toBeNull();
    expect(roomNumberClue(['А-201', 'А-202', 'Б-101', 'Б-102'])).toBeNull();
  });
});

describe('поля листа', () => {
  function sheet(width: number, height: number, ink: (x: number, y: number) => boolean) {
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (ink(x, y)) data.set([20, 20, 20, 255], (y * width + x) * 4);
      }
    }
    return data;
  }

  it('рамка плана — содержимое, белое вокруг — поля', () => {
    const data = sheet(200, 100, (x, y) => (x === 40 || x === 160) && y >= 20 && y <= 80 || (y === 20 || y === 80) && x >= 40 && x <= 160);
    expect(contentBox(data, 200, 100)).toEqual({ x: 38, y: 18, width: 125, height: 65 });
  });

  it('одиночная пылинка скана поле не сдвигает', () => {
    const data = sheet(200, 100, (x, y) => (x === 5 && y === 5) || (x >= 50 && x <= 150 && y >= 30 && y <= 70));
    expect(contentBox(data, 200, 100)).toMatchObject({ x: 48, y: 28 });
  });

  it('пустой лист — нечего обрезать', () => {
    expect(contentBox(sheet(50, 50, () => false), 50, 50)).toBeNull();
  });

  it('область не выходит за лист', () => {
    expect(clampBox({ x: -10, y: 5, width: 500, height: 20 }, { width: 100, height: 100 })).toEqual({ x: 0, y: 5, width: 100, height: 20 });
  });
});

describe('векторный план', () => {
  const svg = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200"/></svg>';

  it('размер листа — из width/height или viewBox', () => {
    expect(svgPageSize(svg)).toEqual({ width: 400, height: 200 });
    expect(svgPageSize('<svg viewBox="0 0 120 80"></svg>')).toEqual({ width: 120, height: 80 });
    expect(svgPageSize('<html></html>')).toBeNull();
  });

  it('обрезка и масштаб — через viewBox и размер, рисунок вложен без пролога', () => {
    const plan = composeSvgPlan(svg, { width: 400, height: 200 }, 0, { x: 100, y: 50, width: 200, height: 100 }, 2);
    expect(plan.size).toEqual({ width: 400, height: 200 });
    expect(plan.svg).toContain('viewBox="100 50 200 100"');
    expect(plan.svg).not.toContain('<?xml');
    expect(plan.svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" x="0" y="0" width="400" height="200">');
  });

  it('поворот на 90° меняет стороны и сдвигает рисунок в лист', () => {
    const plan = composeSvgPlan(svg, { width: 400, height: 200 }, 90, null, 1);
    expect(plan.size).toEqual({ width: 200, height: 400 });
    expect(plan.svg).toContain('matrix(0 1 -1 0 200 0)');
  });
});

describe('чертёж DXF', () => {
  const parsed = new DxfParser().parseSync(readFileSync(path.join(fixtures, 'korpus-V-etazh-1.dxf'), 'utf8'));
  const result = dxfToSvg((parsed?.entities ?? []) as DxfEntity[])!;

  it('рисует линии и подписи, ось y — вниз', () => {
    expect(result.svg).toContain('<polygon');
    expect(result.svg).toContain('<text');
    expect(result.svg).toContain('Корпус В. План 1 этажа');
    // Чертёж 60 × 20 плюс поля и заголовок над ним: лист шире, чем выше.
    expect(result.size.width).toBeGreaterThan(result.size.height);
  });

  it('подписи чертежа — подсказки: заголовок и номера помещений', () => {
    const texts = result.texts.map((text) => text.text);
    expect(texts).toEqual(expect.arrayContaining(['В-101', 'В-102', 'Корпус В. План 1 этажа']));
    // Заголовок выше плана — у него меньший y (ось вниз).
    const heading = result.texts.find((text) => text.text.startsWith('Корпус'))!;
    const room = result.texts.find((text) => text.text === 'В-101')!;
    expect(heading.y).toBeLessThan(room.y);
  });

  it('пустой чертёж — плана нет', () => {
    expect(dxfToSvg([])).toBeNull();
  });
});

describe('каким получится план', () => {
  const sheet = (kind: 'pdf' | 'image' | 'tiff' | 'svg' | 'dxf', ext: string, width: number, height: number, bilevel = false) => ({
    kind,
    ext,
    size: { width, height },
    bilevel,
  });
  const whole = { rotation: 0, crop: null };

  it('картинка без поворота и обрезки — файл как есть', () => {
    expect(previewPlan(sheet('image', 'jpg', 3000, 2000), whole)).toEqual({ format: 'jpg', size: { width: 3000, height: 2000 }, scale: 1, asIs: true });
    expect(previewPlan(sheet('image', 'webp', 800, 600), whole)).toMatchObject({ format: 'webp', asIs: true });
  });

  it('обрезанная или повёрнутая картинка пересохраняется: PNG — PNG, скан — JPG', () => {
    const crop = { rotation: 0, crop: { x: 10, y: 10, width: 1000, height: 500 } };
    expect(previewPlan(sheet('image', 'png', 3000, 2000), crop)).toMatchObject({ format: 'png', size: { width: 1000, height: 500 }, asIs: false });
    expect(previewPlan(sheet('image', 'jpg', 3000, 2000), { rotation: 90, crop: null })).toMatchObject({
      format: 'jpg',
      size: { width: 2000, height: 3000 },
      asIs: false,
    });
    expect(previewPlan(sheet('image', 'gif', 300, 200), whole)).toMatchObject({ format: 'jpg', asIs: false });
  });

  it('TIFF в одну краску — чертёж, в PNG; цветной — в JPG', () => {
    expect(previewPlan(sheet('tiff', 'tif', 5000, 3000, true), whole).format).toBe('png');
    expect(previewPlan(sheet('tiff', 'tif', 5000, 3000), whole).format).toBe('jpg');
  });

  it('огромный скан уменьшается до предела холста', () => {
    expect(previewPlan(sheet('tiff', 'tif', 16384, 8192), whole)).toMatchObject({ scale: 0.5, size: { width: 8192, height: 4096 } });
  });

  it('PDF — в PNG длинной стороной 4000 точек, по обрезанной области', () => {
    expect(previewPlan(sheet('pdf', 'pdf', 842, 595), whole)).toMatchObject({ format: 'png', size: { width: 4000, height: 2827 } });
    expect(previewPlan(sheet('pdf', 'pdf', 842, 595), { rotation: 0, crop: { x: 0, y: 0, width: 400, height: 200 } }).size).toEqual({ width: 4000, height: 2000 });
  });

  it('вектор остаётся вектором; мелкий SVG растягивается, DXF — до 3000', () => {
    expect(previewPlan(sheet('svg', 'svg', 2400, 1200), whole)).toEqual({ format: 'svg', size: { width: 2400, height: 1200 }, scale: 1, asIs: false });
    expect(previewPlan(sheet('svg', 'svg', 600, 300), whole).size).toEqual({ width: 1500, height: 750 });
    expect(previewPlan(sheet('dxf', 'dxf', 64, 24), whole)).toMatchObject({ format: 'svg', size: { width: 3000, height: 1125 } });
  });
});
