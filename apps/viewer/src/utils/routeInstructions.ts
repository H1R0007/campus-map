import type { Graph, BuildingMeta, AliasManager } from '@campus-map/core';

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

    const tr = graph.getTransitionType(a.id, b.id); // null если обычное ребро

    // Нас интересуют “события” (смена этажа/корпуса) — они и дают “объяснение маршрута”
    if (tr) {
      // Корпус изменился
      if (a.building !== b.building) {
        if (a.building === 'CAMPUS' && b.building !== 'CAMPUS') {
          steps.push({
            text: `Войдите в ${buildingLabel(b.building, buildingMetas)} (этаж ${b.floor}).`,
            hint: { mode: 'floor', buildingId: b.building, floor: b.floor },
          });
        } else if (a.building !== 'CAMPUS' && b.building === 'CAMPUS') {
          steps.push({
            text: `Выйдите в кампус.`,
            hint: { mode: 'campus' },
          });
        } else {
          // прямой переход между корпусами (bridge)
          steps.push({
            text: `Перейдите из ${buildingLabel(a.building, buildingMetas)} в ${buildingLabel(b.building, buildingMetas)}.`,
            hint: { mode: 'floor', buildingId: b.building, floor: b.floor },
          });
        }
        continue;
      }

      // Этаж изменился
      if (a.floor !== b.floor) {
        const dir = b.floor > a.floor ? 'Поднимитесь' : 'Спуститесь';
        const how =
          tr === 'stairs' ? 'по лестнице' :
          tr === 'lift' ? 'на лифте' :
          tr === 'door' ? 'через проход' :
          tr === 'bridge' ? 'по переходу' : 'через переход';

        steps.push({
          text: `${dir} ${how} на этаж ${b.floor}.`,
          hint: { mode: 'floor', buildingId: b.building, floor: b.floor },
        });
        continue;
      }

      // Переход внутри одного этажа (door/unknown) — можно кратко
      if (tr === 'door') {
        steps.push({ text: `Пройдите через дверь.` });
      }
    }
  }

  steps.push({
    text: `Финиш: ${nodeLabel(end.id, aliasManager)} — ${buildingLabel(end.building, buildingMetas)}${end.building === 'CAMPUS' ? '' : `, этаж ${end.floor}`}`,
    hint:
      end.building === 'CAMPUS'
        ? { mode: 'campus' }
        : { mode: 'floor', buildingId: end.building, floor: end.floor },
  });

  return steps;
}