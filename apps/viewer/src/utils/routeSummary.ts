import type { Graph, PathResult } from '@campus-map/core';
import { CAMPUS_BUILDING_ID, floorKey } from '@campus-map/core';
import { messagesFor } from '../i18n';
import type { Language } from '../i18n/languages';
import { pluralize } from '../i18n/plural';
import { formatDuration } from './routeInstructions';
import type { RouteStep } from './routeInstructions';

/**
 * Длина для показа: «430 м».
 *
 * До 10 м — как есть, дальше — с округлением до десятков: метры оценены по
 * плану, а не измерены шагомером, и «427 м» обещало бы точность, которой нет.
 * Приблизительность выражена округлением, а не значком «~»: он уже стоит у
 * времени рядом, и второй в той же строке ничего не добавлял.
 */
export function formatDistance(meters: number, language: Language): string {
  const rounded = meters < 10 ? Math.max(1, Math.round(meters)) : Math.round(meters / 10) * 10;
  return messagesFor(language).route.distance(rounded);
}

/**
 * Подпись шага: длина пешего участка или время перехода — что полезнее знать
 * о шаге. У начала, прибытия и в пиксельном режиме подписи нет.
 */
export function stepMeta(step: RouteStep, language: Language): string | null {
  if (step.kind === 'walk' && step.distanceMeters !== null) return formatDistance(step.distanceMeters, language);
  if (step.kind === 'transition' && step.durationSeconds !== null) return formatDuration(step.durationSeconds, language);
  return null;
}

/**
 * Сводка маршрута одной строкой — для свёрнутой карточки и заголовка шагов.
 *
 * В метрическом режиме это время и длина: «~6 мин · 430 м». В пиксельном
 * времени и метров нет (выдуманное число хуже отсутствующего), и сводка
 * говорит, через что проходит путь: «2 корпуса, 3 этажа». Территория кампуса
 * корпусом и этажом не считается.
 */
export function routeSummary(graph: Graph, route: PathResult, language: Language): string {
  const messages = messagesFor(language);

  if (route.durationSeconds !== null && route.distanceMeters !== null) {
    return `${formatDuration(route.durationSeconds, language)} · ${formatDistance(route.distanceMeters, language)}`;
  }

  const buildings = new Set<string>();
  const floors = new Set<string>();

  for (const nodeId of route.path) {
    const node = graph.getNode(nodeId);
    if (!node || node.building === CAMPUS_BUILDING_ID) continue;
    buildings.add(node.building);
    floors.add(floorKey(node.building, node.floor));
  }

  const parts: string[] = [];
  if (buildings.size > 1) {
    parts.push(`${buildings.size} ${pluralize(language, buildings.size, messages.route.buildingsWord)}`);
  }
  if (floors.size > 0) {
    parts.push(`${floors.size} ${pluralize(language, floors.size, messages.route.floorsWord)}`);
  }

  return parts.length > 0 ? parts.join(', ') : messages.map.campus;
}
