import type { BuildingMeta, MapNode, Transition } from '@campus-map/core';
import { CAMPUS_BUILDING_ID, CAMPUS_FLOOR } from '@campus-map/core';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export interface ValidateDatasetParams {
  nodes: Map<string, MapNode>;
  transitions: Transition[];
  buildingMetas: Map<string, BuildingMeta>;
}

/**
 * Проверяет структурную целостность датасета.
 *
 * Сообщения на русском: их читает команда разметки в панели диагностики, а не
 * машина. Ошибка означает «данные противоречат формату», предупреждение —
 * «формально допустимо, но почти наверняка не то, что имелось в виду».
 *
 * Связность графа здесь намеренно не проверяется: это делает
 * `findConnectedComponents` из ядра, и результат уходит в панель статистики.
 * Держать вторую реализацию обхода означало бы два разных ответа на один
 * вопрос.
 */
export function validateDataset(params: ValidateDatasetParams): ValidationResult {
  const { nodes, transitions, buildingMetas } = params;

  const errors: string[] = [];
  const warnings: string[] = [];

  // Соседи должны существовать: иначе маршрутизатор теряет ребро молча.
  for (const [id, node] of nodes) {
    for (const neighbor of node.neighbors) {
      if (!nodes.has(neighbor)) {
        errors.push(`Узел «${id}» ссылается на несуществующего соседа «${neighbor}»`);
      }
    }
  }

  // Асимметрия допустима (одностороннее движение), но почти всегда случайна.
  for (const [id, node] of nodes) {
    for (const neighbor of node.neighbors) {
      const other = nodes.get(neighbor);
      if (!other) continue;

      if (!other.neighbors.includes(id)) {
        warnings.push(
          `Ребро не симметрично: «${id}» → «${neighbor}» есть, обратного «${neighbor}» → «${id}» нет`
        );
      }
    }
  }

  // Переход между этажами обязан опираться на существующие узлы с обеих сторон.
  for (const transition of transitions) {
    if (!nodes.has(transition.fromNode)) {
      errors.push(`Переход ссылается на несуществующий начальный узел «${transition.fromNode}»`);
    }
    if (!nodes.has(transition.toNode)) {
      errors.push(`Переход ссылается на несуществующий конечный узел «${transition.toNode}»`);
    }
  }

  // Принадлежность узла корпусу и этажу должна подтверждаться meta.json.
  for (const [id, node] of nodes) {
    if (node.building === CAMPUS_BUILDING_ID) {
      if (node.floor !== CAMPUS_FLOOR) {
        warnings.push(
          `Узел территории кампуса «${id}» имеет floor=${node.floor}, ожидается ${CAMPUS_FLOOR}`
        );
      }
      continue;
    }

    const meta = buildingMetas.get(node.building);
    if (!meta) {
      errors.push(`Узел «${id}» ссылается на неизвестный корпус «${node.building}»`);
      continue;
    }

    if (!meta.floors.some((floor) => floor.floor === node.floor)) {
      const listed = meta.floors.map((floor) => floor.floor).join(', ') || '—';
      errors.push(
        `Узел «${id}» ссылается на этаж ${node.floor}, но в meta.json корпуса ` +
          `«${node.building}» объявлены этажи: ${listed}`
      );
    }
  }

  return { errors, warnings };
}
