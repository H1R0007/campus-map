import { describe, expect, it } from 'vitest';
import { ROOF_LABEL_HEIGHT, placeRoofLabels } from '../src/utils/roofLabels';
import type { RoofLabelCandidate } from '../src/utils/roofLabels';

/** Корпус-прямоугольник на экране с названием по центру. */
function building(x: number, y: number, width: number, height: number, labelWidth: number, wanted = true): RoofLabelCandidate {
  return {
    center: { x: x + width / 2, y: y + height / 2 },
    width: labelWidth,
    height: ROOF_LABEL_HEIGHT,
    box: { minX: x, minY: y, maxX: x + width, maxY: y + height },
    priority: Math.max(width, height),
    wanted,
  };
}

describe('placeRoofLabels', () => {
  it('название шире своей крыши, но рядом никого — подписано', () => {
    // Мелкий корпус на общем виде: 40 px, название — 76 px.
    expect(placeRoofLabels([building(100, 100, 40, 20, 76)])).toEqual([true]);
  });

  it('общий вид тестового кампуса: подписаны все три корпуса', () => {
    // Положения с телефона 390 px на первом экране: А и Б рядом через переход,
    // В в стороне; «Корпус А» — 60 px текста.
    const campus = [building(45, 316, 70, 26, 60), building(132, 317, 56, 24, 60), building(210, 330, 64, 40, 60)];
    expect(placeRoofLabels(campus)).toEqual([true, true, true]);
  });

  it('названия налезают друг на друга — подписан более длинный корпус', () => {
    // Корпуса один под другим: названия сталкиваются, а чужих крыш не задевают.
    const small = building(10, 0, 30, 20, 60);
    const large = building(0, 24, 80, 20, 60);
    expect(placeRoofLabels([small, large])).toEqual([false, true]);
  });

  it('название задевает чужой корпус — не подписано, даже если чужое не подписано', () => {
    const tiny = building(100, 100, 20, 20, 90);
    // Длинный корпус вплотную справа, его название не нужно (корпус открыт).
    const neighbour = building(125, 90, 120, 40, 76, false);
    expect(placeRoofLabels([tiny, neighbour])).toEqual([false, false]);
  });

  it('ненужное название не занимает места', () => {
    const open = building(0, 0, 200, 60, 76, false);
    const far = building(400, 0, 40, 20, 76);
    expect(placeRoofLabels([open, far])).toEqual([false, true]);
  });

  it('при равной длине место у первого по порядку — порядок не прыгает от кадра к кадру', () => {
    const upper = building(0, 0, 40, 20, 60);
    const lower = building(0, 24, 40, 20, 60);
    expect(placeRoofLabels([upper, lower])).toEqual([true, false]);
  });
});
