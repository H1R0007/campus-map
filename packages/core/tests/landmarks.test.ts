import { describe, expect, it } from 'vitest';
import { MAX_LANDMARK_LENGTH, MAX_PHOTO_BLUR, PHOTO_FILE, landmarkText, loadDataset, photoPath, photoUrl } from '../src/index.js';
import type { MapNode } from '../src/index.js';
import { memorySource } from './helpers/memorySource.js';

/**
 * Ориентир и фото точки в данных (запись 85).
 *
 * Битая запись не роняет загрузку: навигатор открывается, просто без этого
 * ориентира или фото, а разметчик видит, что именно не принято.
 */

async function loadPoint(fields: Record<string, unknown>): Promise<{ node: MapNode | undefined; warnings: string[] }> {
  const { dataset, warnings } = await loadDataset(
    memorySource({
      'campus/meta.json': { buildings: [], mapSize: { width: 1200, height: 800 } },
      'campus/graph.json': { nodes: [{ id: 'campus_corner', x: 10, y: 20, neighbors: [], ...fields }] },
      'transitions.json': { transitions: [] },
      'aliases.json': { aliases: [] },
    })
  );
  return { node: dataset.nodes.find((n) => n.id === 'campus_corner'), warnings };
}

const PHOTO = { file: '3f2a9c1b7d4e8a01.webp', width: 1600, height: 1200 };

describe('ориентир точки', () => {
  it('название, фраза и перевод читаются; пробелы по краям срезаются', async () => {
    const { node, warnings } = await loadPoint({
      landmark: {
        name: '  Кофейный автомат ',
        at: 'у кофейного автомата',
        translations: { en: { name: 'Coffee machine', at: 'at the coffee machine' } },
      },
    });

    expect(warnings).toEqual([]);
    expect(node?.landmark).toEqual({
      name: 'Кофейный автомат',
      at: 'у кофейного автомата',
      translations: { en: { name: 'Coffee machine', at: 'at the coffee machine' } },
    });
  });

  it('фраза необязательна', async () => {
    const { node, warnings } = await loadPoint({ landmark: { name: 'Турникеты' } });

    expect(warnings).toEqual([]);
    expect(node?.landmark).toEqual({ name: 'Турникеты' });
  });

  it('без названия ориентира нет — и сказано, у какой точки', async () => {
    const { node, warnings } = await loadPoint({ landmark: { at: 'у автомата' } });

    expect(node?.landmark).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('campus_corner');
    expect(warnings[0]).toContain('нет названия');
  });

  it('слишком длинное название — не подпись, а описание: пропущено', async () => {
    const { node, warnings } = await loadPoint({ landmark: { name: 'а'.repeat(MAX_LANDMARK_LENGTH + 1) } });

    expect(node?.landmark).toBeUndefined();
    expect(warnings).toHaveLength(1);
  });

  it('неверная фраза или перевод отбрасываются по отдельности, название остаётся', async () => {
    const { node, warnings } = await loadPoint({
      landmark: { name: 'Кофейный автомат', at: 42, translations: { EN: { name: 'Coffee machine' }, en: { at: 'at it' } } },
    });

    expect(node?.landmark).toEqual({ name: 'Кофейный автомат' });
    expect(warnings).toHaveLength(3);
  });

  it('ориентир — объект, а не строка', async () => {
    const { node, warnings } = await loadPoint({ landmark: 'кофейный автомат' });

    expect(node?.landmark).toBeUndefined();
    expect(warnings).toHaveLength(1);
  });
});

describe('фото точки', () => {
  it('читаются в порядке файла: первое — главное', async () => {
    const second = { file: 'aaaaaaaaaaaaaaaa.png', width: 640, height: 480 };
    const { node, warnings } = await loadPoint({ photos: [PHOTO, second] });

    expect(warnings).toEqual([]);
    expect(node?.photos).toEqual([PHOTO, second]);
  });

  it('имя файла — только отпечаток и растровый формат: пути, SVG и маленькая копия не принимаются', async () => {
    const bad = [
      '../secret.webp',
      'photos/3f2a9c1b7d4e8a01.webp',
      '3F2A9C1B7D4E8A01.webp',
      '3f2a9c1b7d4e8a01.svg',
      '3f2a9c1b7d4e8a01.small.webp',
      '3f2a9c1b.webp',
    ];
    const { node, warnings } = await loadPoint({ photos: [...bad.map((file) => ({ ...PHOTO, file })), PHOTO] });

    expect(node?.photos).toEqual([PHOTO]);
    expect(warnings).toHaveLength(bad.length);
    for (const file of bad) expect(PHOTO_FILE.test(file)).toBe(false);
  });

  it('размер — целые положительные пиксели', async () => {
    const { node, warnings } = await loadPoint({
      photos: [
        { ...PHOTO, width: 0 },
        { ...PHOTO, height: 12.5 },
        { ...PHOTO, width: '1600' },
        PHOTO,
      ],
    });

    expect(node?.photos).toEqual([PHOTO]);
    expect(warnings).toHaveLength(3);
  });

  it('повтор одного фото у точки пропускается', async () => {
    const { node, warnings } = await loadPoint({ photos: [PHOTO, PHOTO] });

    expect(node?.photos).toEqual([PHOTO]);
    expect(warnings).toHaveLength(1);
  });

  it('не список — предупреждение, точка без фото', async () => {
    const { node, warnings } = await loadPoint({ photos: PHOTO });

    expect(node?.photos).toBeUndefined();
    expect(warnings).toHaveLength(1);
  });
});

describe('файлы фото', () => {
  it('маленькая копия лежит рядом с полной', () => {
    expect(photoPath('3f2a9c1b7d4e8a01.webp')).toBe('photos/3f2a9c1b7d4e8a01.webp');
    expect(photoPath('3f2a9c1b7d4e8a01.webp', 'small')).toBe('photos/3f2a9c1b7d4e8a01.small.webp');
    expect(photoPath('3f2a9c1b7d4e8a01.png', 'small')).toBe('photos/3f2a9c1b7d4e8a01.small.png');
  });

  it('адрес учитывает базовый путь развёртывания', () => {
    expect(photoUrl('3f2a9c1b7d4e8a01.jpg', 'small', '/campus/data/')).toBe('/campus/data/photos/3f2a9c1b7d4e8a01.small.jpg');
  });
});

describe('ориентир на языке интерфейса', () => {
  const landmark = {
    name: 'Кофейный автомат',
    at: 'у кофейного автомата',
    translations: { en: { name: 'Coffee machine', at: 'at the coffee machine' } },
  };

  it('на языке данных — исходные название и фраза', () => {
    expect(landmarkText(landmark, 'ru', 'ru')).toEqual({ name: 'Кофейный автомат', at: 'у кофейного автомата' });
  });

  it('с переводом — перевод', () => {
    expect(landmarkText(landmark, 'en', 'ru')).toEqual({ name: 'Coffee machine', at: 'at the coffee machine' });
  });

  it('без перевода фразы на чужом языке нет: в чужое предложение её не вставить', () => {
    expect(landmarkText({ name: 'Турникеты', at: 'у турникетов' }, 'en', 'ru')).toEqual({ name: 'Турникеты', at: null });
    expect(landmarkText({ ...landmark, translations: { en: { name: 'Coffee machine' } } }, 'en', 'ru')).toEqual({
      name: 'Coffee machine',
      at: null,
    });
  });
});

describe('исправления поворотов и исходный снимок (запись 87)', () => {
  it('исправленные повороты читаются; неверные и повторы — с предупреждением', async () => {
    const { node, warnings } = await loadPoint({
      landmark: {
        name: 'Автомат',
        turns: [
          { from: 'a', to: 'b', turn: 'left' },
          { from: 'a', to: 'b', turn: 'right' },
          { from: 'a', to: 'a', turn: 'left' },
          { from: 'a', to: 'c', turn: 'diagonal' },
        ],
      },
    });

    expect(node?.landmark?.turns).toEqual([{ from: 'a', to: 'b', turn: 'left' }]);
    expect(warnings).toHaveLength(3);
  });

  it('исходный снимок у фото — имя-отпечаток; другое имя пропускается, фото остаётся', async () => {
    const { node, warnings } = await loadPoint({
      photos: [
        { ...PHOTO, source: 'a1b2c3d4e5f60718.jpg' },
        { file: 'aaaaaaaaaaaaaaaa.png', width: 640, height: 480, source: 'IMG_0001.JPG' },
      ],
    });

    expect(node?.photos).toEqual([
      { ...PHOTO, source: 'a1b2c3d4e5f60718.jpg' },
      { file: 'aaaaaaaaaaaaaaaa.png', width: 640, height: 480 },
    ]);
    expect(warnings).toHaveLength(1);
  });
});

describe('размытые участки фото (запись 88)', () => {
  const FACE = { x: 0.1, y: 0.2, width: 0.15, height: 0.25 };

  it('рамки в долях фото читаются, у самого края — тоже', async () => {
    const edge = { x: 0.95, y: 0.9, width: 0.05, height: 0.1 };
    const { node, warnings } = await loadPoint({ photos: [{ ...PHOTO, blur: [FACE, edge] }] });

    expect(warnings).toEqual([]);
    expect(node?.photos?.[0].blur).toEqual([FACE, edge]);
  });

  it('рамка за краем фото, нулевая или не числом — пропускается с предупреждением, фото и другие рамки остаются', async () => {
    const bad = [
      { x: 0.9, y: 0.1, width: 0.2, height: 0.1 },
      { x: 0.1, y: 0.1, width: 0, height: 0.1 },
      { x: -0.1, y: 0.1, width: 0.2, height: 0.1 },
      { x: '0.1', y: 0.1, width: 0.2, height: 0.1 },
      { x: 0.1, y: 0.1, width: 0.2 },
      'лицо',
    ];
    const { node, warnings } = await loadPoint({ photos: [{ ...PHOTO, blur: [...bad, FACE] }] });

    expect(node?.photos).toEqual([{ ...PHOTO, blur: [FACE] }]);
    expect(warnings).toHaveLength(bad.length);
    expect(warnings[0]).toContain('campus_corner');
    expect(warnings[0]).toContain(PHOTO.file);
  });

  it('не список или только битые рамки — поля нет; лишние сверх предела отбрасываются', async () => {
    const notList = await loadPoint({ photos: [{ ...PHOTO, blur: FACE }] });
    expect(notList.node?.photos).toEqual([PHOTO]);
    expect(notList.warnings).toHaveLength(1);

    const allBad = await loadPoint({ photos: [{ ...PHOTO, blur: [{ x: 2, y: 0, width: 1, height: 1 }] }] });
    expect(allBad.node?.photos?.[0]).not.toHaveProperty('blur');

    const many = await loadPoint({ photos: [{ ...PHOTO, blur: Array.from({ length: MAX_PHOTO_BLUR + 3 }, () => FACE) }] });
    expect(many.node?.photos?.[0].blur).toHaveLength(MAX_PHOTO_BLUR);
    expect(many.warnings).toHaveLength(1);
  });
});
