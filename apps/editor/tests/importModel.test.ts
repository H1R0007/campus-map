import { beforeEach, describe, expect, it } from 'vitest';
import { guessPlace } from '../src/import/guess';
import { checkPieces, floorFromText, importSummary, initialPiece, resolveBuilding, rotatePiece } from '../src/import/importModel';
import type { Piece } from '../src/import/importModel';
import { useHistoryStore } from '../src/stores/historyStore';
import { dataSnapshot, loadFixture, store } from './helpers/fixture';

/**
 * Окно «Планы из файлов» (запись 48): догадка превращается в решение по
 * листу, поворот не теряет обрезку, повторы и замены видны до импорта, а сам
 * импорт — одна правка.
 */

beforeEach(() => loadFixture());

const metas = () => store().buildingMetas;
const planFiles = () => store().planFiles;

describe('решение по листу из догадки', () => {
  it('корпус по букве имени, этаж по заголовку', () => {
    const guess = guessPlace([{ text: 'Корпус А. План 2-го этажа', origin: 'title' }]);
    const piece = initialPiece('s1', guess, metas(), {});
    expect(piece.target).toEqual({ kind: 'floor', building: { id: 'building_a' }, floorText: '2', label: '' });
    expect(piece.notes).toEqual([
      'Корпус А — по заголовку листа «Корпус А. План 2-го этажа»',
      'Этаж 2 — по заголовку листа «Корпус А. План 2-го этажа»',
    ]);
  });

  it('незнакомая буква — новый корпус', () => {
    const guess = guessPlace([{ text: 'korpus-G-etazh-1.png', origin: 'file' }]);
    expect(initialPiece('s1', guess, metas(), {}).target).toMatchObject({ building: { newName: 'Корпус Г' }, floorText: '1' });
  });

  it('буква имени файла латиницей находит корпус по коду в данных', () => {
    expect(resolveBuilding({ letter: 'Ц', latin: 'c', from: { text: '', origin: 'file' } }, metas())).toEqual({ newName: 'Корпус Ц' });
    const withC = new Map(metas());
    withC.set('building_c', { id: 'building_c', name: 'Корпус В', floors: [] });
    // «В» по имени важнее кода: у владельца «Корпус В» — это building_c.
    expect(resolveBuilding({ letter: 'В', latin: 'v', from: { text: '', origin: 'file' } }, withC)).toEqual({ id: 'building_c' });
    expect(resolveBuilding({ letter: 'Ц', latin: 'c', from: { text: '', origin: 'file' } }, withC)).toEqual({ id: 'building_c' });
  });

  it('догадка молчит — подставляется то, для чего открыли окно', () => {
    const nothing = guessPlace([{ text: 'scan0001.jpg', origin: 'file' }]);
    expect(initialPiece('s1', nothing, metas(), { building: 'building_a', floor: 2 }).target).toMatchObject({
      building: { id: 'building_a' },
      floorText: '2',
    });
    expect(initialPiece('s1', nothing, metas(), { campus: true }).target).toEqual({ kind: 'campus' });
    expect(initialPiece('s1', nothing, metas(), {}).notes).toEqual(['Корпус и этаж по файлу не угадать — укажите']);
  });

  it('экспликация пропускается с объяснением', () => {
    const piece = initialPiece('s1', guessPlace([{ text: 'Экспликация помещений', origin: 'title' }]), metas(), {});
    expect(piece.target).toEqual({ kind: 'skip' });
    expect(piece.notes[0]).toMatch(/^Похоже, не план/);
  });

  it('номер этажа из поля: минус, запятая', () => {
    expect(floorFromText('−1')).toBe(-1);
    expect(floorFromText('1,5')).toBe(1.5);
    expect(floorFromText('')).toBeNaN();
  });
});

describe('поворот', () => {
  const base: Piece = {
    id: 'p',
    sheetId: 's',
    rotation: 0,
    crop: { x: 10, y: 20, width: 100, height: 50 },
    trimmed: true,
    target: { kind: 'skip' },
    notes: [],
  };
  const size = { width: 400, height: 300 };

  it('по часовой: область поворачивается вместе с листом', () => {
    expect(rotatePiece(base, size, 1)).toMatchObject({ rotation: 90, crop: { x: 230, y: 10, width: 50, height: 100 } });
  });

  it('туда и обратно — та же область', () => {
    const back = rotatePiece(rotatePiece(base, size, 1), size, -1);
    expect(back.rotation).toBe(0);
    expect(back.crop).toEqual(base.crop);
    const around = [1, 1, 1, 1].reduce((piece) => rotatePiece(piece, size, 1), base);
    expect(around.crop).toEqual(base.crop);
  });
});

describe('проверка до импорта', () => {
  const floorPiece = (id: string, building: Piece['target'] extends infer T ? (T extends { building: infer B } ? B : never) : never, floorText: string): Piece => ({
    id,
    sheetId: id,
    rotation: 0,
    crop: null,
    trimmed: false,
    target: { kind: 'floor', building, floorText, label: '' },
    notes: [],
  });

  it('два листа на один этаж — оба с проблемой', () => {
    const checks = checkPieces([floorPiece('a', { id: 'building_a' }, '3'), floorPiece('b', { id: 'building_a' }, '3')], metas(), planFiles());
    expect(checks.get('a')?.problem).toMatch(/ещё один лист/);
    expect(checks.get('b')?.problem).toMatch(/ещё один лист/);
  });

  it('этаж с планом — замена, без проблемы', () => {
    const checks = checkPieces([floorPiece('a', { id: 'building_a' }, '2')], metas(), planFiles());
    expect(checks.get('a')).toEqual({
      problem: null,
      note: 'У этажа 2 уже есть план — новый заменит его. Точки этажа сохранят прежние координаты: если масштаб нового плана другой, совместите их с планом после добавления',
    });
  });

  it('нет корпуса или номера — не добавить', () => {
    const checks = checkPieces([floorPiece('a', null, '2'), floorPiece('b', { newName: 'Корпус Г' }, 'два')], metas(), planFiles());
    expect(checks.get('a')?.problem).toBe('Выберите корпус');
    expect(checks.get('b')?.problem).toMatch(/Укажите номер этажа/);
  });

  it('итог словами', () => {
    const pieces = [floorPiece('a', { id: 'building_a' }, '3'), floorPiece('b', { id: 'building_a' }, '4')];
    expect(importSummary(pieces)).toBe('Добавить 2 этажа');
    expect(importSummary([...pieces, { ...pieces[0], id: 'c', target: { kind: 'campus' } }])).toBe('Добавить 2 этажа и план территории');
  });
});

describe('импорт одной правкой', () => {
  const PLAN = { key: 'sha1:' + '1'.repeat(40), format: 'png' as const, mapSize: { width: 1000, height: 500 } };

  it('новый корпус, новые и существующие этажи, территория — одна запись, отмена всё убирает', () => {
    const before = { data: dataSnapshot(), buildings: JSON.stringify([...metas().values()]), plans: [...planFiles()] };
    const problem = store().importPlans({
      floors: [
        { building: { newName: 'Корпус Г' }, floor: 1, plan: PLAN },
        { building: { newName: 'корпус г' }, floor: 2, label: '2', plan: PLAN },
        { building: { id: 'building_a' }, floor: 2, plan: { ...PLAN, format: 'webp' } },
        { building: { id: 'building_a' }, floor: 3, plan: PLAN },
      ],
      campus: PLAN,
    });

    expect(problem).toBeNull();
    expect(useHistoryStore.getState().entries).toHaveLength(1);
    expect(useHistoryStore.getState().entries[0].description).toBe('Планы из файлов: 4 этажа, план территории');
    expect(metas().get('building_g')?.floors.map((floor) => floor.floor)).toEqual([1, 2]);
    expect(metas().get('building_a')?.floors.map((floor) => [floor.floor, floor.planFormat])).toEqual([
      [1, 'svg'],
      [2, 'webp'],
      [3, 'png'],
    ]);
    expect(planFiles().get('building_g/2')).toBe(PLAN.key);
    expect(planFiles().get('campus')).toBe(PLAN.key);
    expect(store().campusMeta?.planFormat).toBe('png');
    // Открыт первый добавленный этаж.
    expect([store().currentBuilding, store().currentFloor]).toEqual(['building_g', 1]);

    store().undo();
    expect({ data: dataSnapshot(), buildings: JSON.stringify([...metas().values()]), plans: [...planFiles()] }).toEqual(before);
  });

  it('два листа на один этаж и занятое имя корпуса — отказ без записи', () => {
    expect(
      store().importPlans({
        floors: [
          { building: { id: 'building_a' }, floor: 3, plan: PLAN },
          { building: { id: 'building_a' }, floor: 3, plan: PLAN },
        ],
      })
    ).toMatch(/Два листа на один этаж/);
    expect(store().importPlans({ floors: [{ building: { newName: 'Корпус А' }, floor: 1, plan: PLAN }] })).toMatch(/уже есть/);
    expect(store().importPlans({ floors: [] })).toBe('Нечего добавлять');
    expect(useHistoryStore.getState().entries).toEqual([]);
  });
});
