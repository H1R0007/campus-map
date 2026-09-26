import { CAMPUS_BUILDING_ID, createCampusProjection, floorLabel } from '@campus-map/core';
import type { BuildingMeta, CampusMeta, MapNode } from '@campus-map/core';
import { planScopeKey } from './planFiles';
import { plural } from './labels';

/**
 * Проверка структуры: корпуса, этажи, планы, привязка к территории
 * (запись 51).
 *
 * Эти находки — не ошибки разметки, а то, чего навигатору не хватит: корпус
 * без места на территории выключает время в пути во всём кампусе, этаж без
 * плана — серое поле. У каждой находки — действие, которое её исправляет.
 */

export type StructureAction =
  | { kind: 'measure' }
  | { kind: 'place'; building: string }
  | { kind: 'open'; building: string; floor: number | null }
  | { kind: 'plan'; building: string | null; floor: number | null }
  | { kind: 'align'; building: string | null; floor: number | null };

export interface StructureIssue {
  text: string;
  action: StructureAction;
  /** Подпись кнопки действия. */
  actionLabel: string;
  /** Навигатор покажет это людям: сохранение спросит подтверждения. */
  navigator: boolean;
}

export interface StructureInput {
  campusMeta: CampusMeta | null;
  buildingMetas: ReadonlyMap<string, BuildingMeta>;
  planFiles: ReadonlyMap<string, string>;
  nodes: ReadonlyMap<string, MapNode>;
}

/** Доля размера плана, на которую точка может выйти за край: двери на самой кромке. */
const EDGE_TOLERANCE = 0.02;

export function structureChecks({ campusMeta, buildingMetas, planFiles, nodes }: StructureInput): StructureIssue[] {
  const issues: StructureIssue[] = [];
  const campusMpp = campusMeta?.metersPerPixel;

  if (campusMeta && campusMpp === undefined) {
    issues.push({
      text: 'Масштаб территории не задан: без метров навигатор не показывает время в пути и корпуса не поставить на территорию',
      action: { kind: 'measure' },
      actionLabel: 'Задать масштаб…',
      navigator: true,
    });
  }

  const unplaced = new Map<string, string[]>();
  if (campusMeta && campusMpp !== undefined) {
    for (const floor of createCampusProjection(campusMeta, buildingMetas.values()).unplacedFloors) {
      if (floor.buildingId === CAMPUS_BUILDING_ID) continue;
      unplaced.set(floor.buildingId, [...(unplaced.get(floor.buildingId) ?? []), ...floor.missing]);
    }
  }

  for (const meta of buildingMetas.values()) {
    if (meta.floors.length === 0) {
      issues.push({
        text: `Корпус «${meta.name}» без этажей: в навигаторе его не открыть`,
        action: { kind: 'open', building: meta.id, floor: null },
        actionLabel: 'Открыть',
        navigator: true,
      });
      continue;
    }
    const missing = unplaced.get(meta.id);
    if (missing) {
      const onlyHeight = missing.every((field) => field.startsWith('elevationMeters'));
      issues.push(
        onlyHeight
          ? {
              text: `У корпуса «${meta.name}» не заданы высоты этажей: без них навигатор не считает время на лестницах, и время в пути пропадает во всём кампусе`,
              action: { kind: 'open', building: meta.id, floor: null },
              actionLabel: 'Открыть корпус',
              navigator: true,
            }
          : {
              text: `Корпус «${meta.name}» не поставлен на территорию: пока он не на своём месте, время в пути пропадает во всём кампусе`,
              action: { kind: 'place', building: meta.id },
              actionLabel: 'Поставить…',
              navigator: true,
            }
      );
    }
  }

  // Планы: нет файла — серое поле в навигаторе.
  if (campusMeta && !planFiles.has(planScopeKey(null, null))) {
    issues.push({
      text: 'У территории нет плана',
      action: { kind: 'plan', building: null, floor: null },
      actionLabel: 'Добавить план…',
      navigator: true,
    });
  }
  for (const meta of buildingMetas.values()) {
    for (const floor of meta.floors) {
      if (planFiles.has(planScopeKey(meta.id, floor.floor))) continue;
      issues.push({
        text: `У этажа ${floorLabel(meta, floor.floor)} корпуса «${meta.name}» нет плана: в навигаторе вместо плана пустое поле`,
        action: { kind: 'plan', building: meta.id, floor: floor.floor },
        actionLabel: 'Добавить план…',
        navigator: true,
      });
    }
  }

  // Точки за краем плана — чаще всего план заменили, а точки не совместили.
  const outside = new Map<string, number>();
  const sizeOf = (building: string, floor: number) =>
    building === CAMPUS_BUILDING_ID ? campusMeta?.mapSize : buildingMetas.get(building)?.floors.find((item) => item.floor === floor)?.mapSize;
  for (const node of nodes.values()) {
    const size = sizeOf(node.building, node.floor);
    if (!size) continue;
    const marginX = size.width * EDGE_TOLERANCE;
    const marginY = size.height * EDGE_TOLERANCE;
    if (node.x < -marginX || node.y < -marginY || node.x > size.width + marginX || node.y > size.height + marginY) {
      const key = `${node.building}|${node.floor}`;
      outside.set(key, (outside.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of outside) {
    const [building, floorText] = key.split('|');
    const floor = Number(floorText);
    const campus = building === CAMPUS_BUILDING_ID;
    const meta = buildingMetas.get(building);
    issues.push({
      text: `${campus ? 'На территории' : `На этаже ${floorLabel(meta, floor)} корпуса «${meta?.name ?? building}»`} ${count} ${plural(count, ['точка', 'точки', 'точек'])} за краем плана — похоже, план заменили, а точки не совместили`,
      action: { kind: 'align', building: campus ? null : building, floor: campus ? null : floor },
      actionLabel: 'Совместить…',
      navigator: false,
    });
  }

  return issues;
}
