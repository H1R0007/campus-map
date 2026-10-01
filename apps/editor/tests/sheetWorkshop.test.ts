import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, fitView, nearestEdgePoint, toPage, toScreen, visiblePart, zoomAt } from '../src/import/sheetView';
import { emptyHistory, record, redo, undo } from '../src/import/pieceHistory';
import { insertOutlinePoint } from '../src/import/outline';

/** Мастерская листов (запись 80): вид листа, «+» на линии, отмена. */

describe('вид листа', () => {
  const page = { width: 2384, height: 1684 }; // А1 в пунктах
  const area = { width: 1000, height: 700 };

  it('весь лист — посередине, с полями', () => {
    const view = fitView(area, page, 20);
    expect(view.scale).toBeCloseTo(Math.min(960 / 2384, 660 / 1684), 9);
    const corner = toScreen(view, { x: 0, y: 0 });
    const far = toScreen(view, { x: page.width, y: page.height });
    expect(corner.x + far.x).toBeCloseTo(area.width, 6);
    expect(corner.y + far.y).toBeCloseTo(area.height, 6);
  });

  it('колесо приближает в точке под курсором: она остаётся под ним', () => {
    const view = fitView(area, page);
    const at = { x: 731, y: 222 };
    const before = toPage(view, at);
    const zoomed = zoomAt(view, 3, at, view.scale);
    expect(zoomed.scale).toBeCloseTo(view.scale * 3, 9);
    const after = toPage(zoomed, at);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('масштаб — в пределах долей «весь лист»', () => {
    const view = fitView(area, page);
    expect(zoomAt(view, 1000, { x: 0, y: 0 }, view.scale).scale).toBeCloseTo(view.scale * MAX_ZOOM, 9);
    expect(zoomAt(view, 0.001, { x: 0, y: 0 }, view.scale).scale).toBeCloseTo(view.scale * MIN_ZOOM, 9);
  });

  it('видимая часть листа — для отрисовки чётко при приближении', () => {
    const view = { scale: 2, x: -200, y: -100 };
    expect(visiblePart(view, area, page)).toEqual({ x: 100, y: 50, width: 500, height: 350 });
    expect(visiblePart({ scale: 1, x: 5000, y: 0 }, area, page)).toBeNull();
  });
});

describe('«+» на линии контура', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  const view = { scale: 2, x: 10, y: 10 };

  it('ближайшая точка на ребре под указателем — в единицах листа', () => {
    // Верхнее ребро на экране — y = 10; указатель на 6 px ниже, посередине.
    expect(nearestEdgePoint(square, view, { x: 110, y: 16 }, 10)).toEqual({ index: 0, point: { x: 50, y: 0 } });
  });

  it('далеко от линий и у самого угла «+» нет', () => {
    expect(nearestEdgePoint(square, view, { x: 110, y: 60 }, 10)).toBeNull();
    // У угла тянут угол, а не ставят новый.
    expect(nearestEdgePoint(square, view, { x: 13, y: 12 }, 10)).toBeNull();
  });

  it('дуги не участвуют: у них ручка в середине', () => {
    const arc = square.map((point, index) => (index === 0 ? { ...point, bulge: 0.5 } : point));
    expect(nearestEdgePoint(arc, view, { x: 110, y: 16 }, 10)).toBeNull();
  });

  it('щелчок по «+» ставит угол там, куда щёлкнули, между концами ребра', () => {
    expect(insertOutlinePoint(square, 1, { x: 100, y: 30 })).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 30 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]);
  });
});

describe('отмена в мастерской', () => {
  it('отмена и повтор возвращают состояния по очереди', () => {
    let history = emptyHistory<string>();
    history = record(history, 'a');
    history = record(history, 'b');
    const first = undo(history, 'c')!;
    expect(first.value).toBe('b');
    const second = undo(first.history, first.value)!;
    expect(second.value).toBe('a');
    expect(undo(second.history, second.value)).toBeNull();
    const again = redo(second.history, second.value)!;
    expect(again.value).toBe('b');
  });

  it('правки одного поля подряд — одна запись; новая правка стирает повтор', () => {
    let history = emptyHistory<string>();
    history = record(history, '', 'floor');
    history = record(history, '1', 'floor');
    history = record(history, '12', 'floor');
    expect(history.past).toEqual(['']);
    const back = undo(history, '123')!;
    expect(back.value).toBe('');
    const changed = record(back.history, '', 'rotate');
    expect(changed.future).toEqual([]);
  });
});
