import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { panoramaLinks } from '@campus-map/core';
import type { DatasetSource, PanoramaLink, RoutePanoramaView } from '@campus-map/core';
import { distanceText, linkLabel, sideOf, spotName } from '../src/tour/describe';
import { imageYaw, panOf, planBearing, worldBearing } from '../src/tour/frame';
import { loadTour } from '../src/tour/loadTour';
import { buildTourRoute, pickStepView } from '../src/tour/route';

/**
 * Подписи и шаги прототипа на тестовом кампусе `data/` с его `panoramas.json`
 * (запись 90). Числа и имена — тестового кампуса: поменяется он — поменяются
 * и ожидания здесь.
 */

const DATA_DIR = path.resolve(__dirname, '../../../data');

const fsSource: DatasetSource = {
  async readJson(relative) {
    const file = path.join(DATA_DIR, relative);
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as unknown) : null;
  },
};

const tour = await loadTour(fsSource);

function link(from: string, to: string): PanoramaLink {
  const found = panoramaLinks(tour.graph, tour.panoramas, from, { planRotation: tour.planRotation }).find(
    (entry) => entry.target === to
  );
  if (!found) throw new Error(`нет стрелки ${from} → ${to}`);
  return found;
}

describe('данные экскурсии тестового кампуса', () => {
  it('panoramas.json разбирается без предупреждений', () => {
    expect(tour.warnings).toEqual([]);
    expect(tour.panoramas.size).toBeGreaterThan(0);
  });

  it('с каждого снимка есть куда шагнуть', () => {
    for (const node of tour.panoramas.keys()) {
      expect(panoramaLinks(tour.graph, tour.panoramas, node, { planRotation: tour.planRotation }).length, node).toBeGreaterThan(0);
    }
  });
});

describe('подписи', () => {
  it('имя точки без названия — по переходу в ней или рядом', () => {
    expect(spotName(tour, 'a2_dean')).toBe('Деканат');
    expect(spotName(tour, 'a1_lift')).toBe('Лифт');
    expect(spotName(tour, 'campus_entrance_a')).toBe('Вход — Корпус А');
    expect(spotName(tour, 'a1_corridor_4')).toBe('Коридор, рядом А-101');
    expect(spotName(tour, 'a1_corridor_7')).toBe('Коридор у лифта');
  });

  it('стрелка между этажами и через вход', () => {
    expect(linkLabel(tour, 'a1_corridor_7', link('a1_corridor_7', 'a2_corridor_6'))).toBe('На лифте вверх — этаж 2');
    expect(linkLabel(tour, 'a2_corridor_6', link('a2_corridor_6', 'a1_corridor_7'))).toBe('На лифте вниз — этаж 1');
    expect(linkLabel(tour, 'a1_entrance', link('a1_entrance', 'campus_entrance_a'))).toBe('Выйти на улицу');
    expect(linkLabel(tour, 'campus_entrance_a', link('campus_entrance_a', 'a1_entrance'))).toBe('Войти: Корпус А');
    expect(linkLabel(tour, 'a1_corridor_4', link('a1_corridor_4', 'a1_canteen'))).toBe('Столовая');
  });

  it('сторона — относительно взгляда, с запасом 35° на «впереди»', () => {
    expect(sideOf(10, 350)).toBe('впереди');
    expect(sideOf(35, 0)).toBe('впереди');
    expect(sideOf(36, 0)).toBe('справа');
    expect(sideOf(180, 0)).toBe('сзади');
    expect(sideOf(144, 0)).toBe('справа');
    expect(sideOf(0, 90)).toBe('слева');
  });

  it('расстояние', () => {
    expect(distanceText(null)).toBeNull();
    expect(distanceText(0.4)).toBe('рядом');
    expect(distanceText(9.6)).toBe('10 м');
  });
});

describe('углы просмотрщика', () => {
  it('план ↔ территория — поворотом плана', () => {
    expect(worldBearing(350, 20)).toBe(10);
    expect(planBearing(10, 20)).toBe(350);
    expect(panOf(10, 20)).toBe(30);
  });

  it('угол на снимке — от его середины, в (−180, 180]', () => {
    expect(imageYaw(100, 52)).toBe(48);
    expect(imageYaw(10, 200)).toBe(170);
    expect(imageYaw(30, 200)).toBe(-170);
  });
});

describe('показать этот поворот', () => {
  it('от площади до деканата: у каждого шага свой снимок, у лифта снимка нет', () => {
    const route = buildTourRoute(tour, tour.panoramas, tour.planRotation, 'campus_square', 'a2_dean');
    expect(route).not.toBeNull();
    expect(route!.steps.map((step) => [step.title, step.place, step.view?.node ?? null])).toEqual([
      ['Дойдите до входа', 'Корпус А', 'campus_entrance_a'],
      ['Войдите в корпус', 'Корпус А', 'a1_entrance'],
      ['Дойдите до лифта', 'Лифт', 'a1_hall'],
      ['Поднимитесь на лифте', 'этаж 2', null],
      ['Идите до цели', 'Деканат', 'a2_corridor_6'],
    ]);
  });

  it('к выходу — «Дойдите до выхода» и «Выйдите на улицу»', () => {
    const route = buildTourRoute(tour, tour.panoramas, tour.planRotation, 'a1_canteen', 'campus_gate');
    expect(route!.steps.slice(0, 2).map((step) => [step.title, step.place])).toEqual([
      ['Дойдите до выхода', 'Территория'],
      ['Выйдите на улицу', 'Территория'],
    ]);
  });

  it('снимок на стыке шагов достаётся первому из них', () => {
    const views = [
      { pathIndex: 3, node: 'x' },
      { pathIndex: 5, node: 'y' },
    ] as RoutePanoramaView[];
    expect(pickStepView(views, [0, 3], null)?.node).toBe('x');
    expect(pickStepView(views, [3, 6], views[0])?.node).toBe('y');
    expect(pickStepView(views, [3, 4], views[0])).toBeNull();
  });
});
