import type { Graph, BuildingMeta, AliasManager, TransitionType } from '@campus-map/core';
import { transitionTypeLabel } from '@campus-map/core';

export type RouteStep = {
  text: string;
  hint?: {
    mode: 'campus' | 'floor';
    buildingId?: string;
    floor?: number;
  };
};

function buildingLabel(buildingId: string, buildingMetas: Map<string, BuildingMeta>): string {
  if (buildingId === 'CAMPUS') return 'Кампус';
  const m = buildingMetas.get(buildingId);
  return m?.name ?? buildingId;
}

function nodeLabel(id: string, aliasManager: AliasManager | null): string {
  const a = aliasManager?.getPrimaryAliasForId(id);
  return a ?? id;
}

function getTransitionVerb(type: TransitionType, direction: 'up' | 'down' | 'same'): string {
  switch (type) {
    case 'stairs':
      return direction === 'up' ? 'Поднимитесь по лестнице' : 
             direction === 'down' ? 'Спуститесь по лестнице' : 
             'Пройдите по лестнице';
    case 'lift':
      return direction === 'up' ? 'Поднимитесь на лифте' : 
             direction === 'down' ? 'Спуститесь на лифте' : 
             'Воспользуйтесь лифтом';
    case 'bridge':
      return 'Перейдите по переходу';
    case 'entrance':
      return 'Пройдите через вход';
    default:
      return 'Пройдите';
  }
}

export function buildRouteSteps(params: {
  graph: Graph;
  path: string[];
  buildingMetas: Map<string, BuildingMeta>;
  aliasManager: AliasManager | null;
}): RouteStep[] {
  const { graph, path, buildingMetas, aliasManager } = params;
  const steps: RouteStep[] = [];

  if (path.length < 2) return steps;

  const start = graph.getNode(path[0]);
  const end = graph.getNode(path[path.length - 1]);
  if (!start || !end) return steps;

  // Старт
  steps.push({
    text: `Старт: ${nodeLabel(start.id, aliasManager)} — ${buildingLabel(start.building, buildingMetas)}${start.building === 'CAMPUS' ? '' : `, этаж ${start.floor}`}`,
    hint:
      start.building === 'CAMPUS'
        ? { mode: 'campus' }
        : { mode: 'floor', buildingId: start.building, floor: start.floor },
  });

  for (let i = 1; i < path.length; i++) {
    const a = graph.getNode(path[i - 1]);
    const b = graph.getNode(path[i]);
    if (!a || !b) continue;

    const tr = graph.getTransitionType(a.id, b.id);

    if (tr) {
      // Смена корпуса
      if (a.building !== b.building) {
        if (a.building === 'CAMPUS' && b.building !== 'CAMPUS') {
          steps.push({
            text: `Войдите в ${buildingLabel(b.building, buildingMetas)} (этаж ${b.floor}).`,
            hint: { mode: 'floor', buildingId: b.building, floor: b.floor },
          });
        } else if (a.building !== 'CAMPUS' && b.building === 'CAMPUS') {
          steps.push({
            text: `Выйдите на территорию кампуса.`,
            hint: { mode: 'campus' },
          });
        } else {
          // Переход между корпусами (bridge)
          steps.push({
            text: `Перейдите из ${buildingLabel(a.building, buildingMetas)} в ${buildingLabel(b.building, buildingMetas)}.`,
            hint: { mode: 'floor', buildingId: b.building, floor: b.floor },
          });
        }
        continue;
      }

      // Смена этажа
      if (a.floor !== b.floor) {
        const direction = b.floor > a.floor ? 'up' : 'down';
        const verb = getTransitionVerb(tr, direction);

        steps.push({
          text: `${verb} на этаж ${b.floor}.`,
          hint: { mode: 'floor', buildingId: b.building, floor: b.floor },
        });
        continue;
      }

      // Переход на том же этаже (entrance внутри здания — редко, но возможно)
      if (tr === 'entrance') {
        steps.push({ text: `Пройдите через ${transitionTypeLabel(tr).toLowerCase()}.` });
      }
    }
  }

  // Финиш
  steps.push({
    text: `Финиш: ${nodeLabel(end.id, aliasManager)} — ${buildingLabel(end.building, buildingMetas)}${end.building === 'CAMPUS' ? '' : `, этаж ${end.floor}`}`,
    hint:
      end.building === 'CAMPUS'
        ? { mode: 'campus' }
        : { mode: 'floor', buildingId: end.building, floor: end.floor },
  });

  return steps;
}