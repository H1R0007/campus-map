import { CAMPUS_BUILDING_ID, searchablePlaceKinds } from '@campus-map/core';
import type { AliasManager, Graph, PlaceCategory, PlaceKind } from '@campus-map/core';
import type { Language } from '../i18n/languages';

/**
 * Выход — не вид места, а двери корпусов: внутренние концы входов,
 * заведённых переходами «Вход в корпус». У владельца «выход и вход везде одно
 * и то же», поэтому выходы отдельно не отмечают — навигатор находит их сам.
 *
 * Цель быстрой кнопки «Выход» и «к выходу» после прибытия. id вида места
 * такого быть не может: редактор строит id видов из латиницы и цифр.
 */
export const EXIT_TARGET: PlaceCategory = '@exit';

const exitCache = new WeakMap<Graph, readonly string[]>();

/** Точки выхода: точки корпусов, из которых переход «Вход в корпус» ведёт на территорию. */
export function exitNodesOf(graph: Graph): readonly string[] {
  const cached = exitCache.get(graph);
  if (cached) return cached;

  const exits = graph
    .getAllNodes()
    .filter(
      (node) =>
        node.building !== CAMPUS_BUILDING_ID &&
        graph.getNeighbors(node.id).some((other) => graph.getTransitionType(node.id, other) === 'entrance')
    )
    .map((node) => node.id);
  exitCache.set(graph, exits);
  return exits;
}

/** Все места вида: отмеченные в данных или, для выхода, двери корпусов. */
export function placeIdsOfKind(graph: Graph, aliasManager: AliasManager, kind: PlaceCategory): readonly string[] {
  return kind === EXIT_TARGET ? exitNodesOf(graph) : aliasManager.getIdsByCategory(kind);
}

/** Место — одно из мест вида. */
export function belongsToKind(graph: Graph, aliasManager: AliasManager, nodeId: string, kind: PlaceCategory): boolean {
  return placeIdsOfKind(graph, aliasManager, kind).includes(nodeId);
}

/**
 * Слова поиска всех мест вида: название на всех языках и слова из каталога.
 * Все языки сразу: студент набирает «toilet», не переключив интерфейс.
 */
export function categoryTermsOf(kinds: readonly PlaceKind[]): Record<PlaceCategory, string[]> {
  const terms: Record<PlaceCategory, string[]> = {};
  for (const kind of searchablePlaceKinds(kinds)) {
    const words = [kind.name, kind.nameEn, ...(kind.searchTerms ?? [])].filter(
      (word): word is string => typeof word === 'string' && word.trim().length > 0
    );
    terms[kind.id] = [...new Set(words)];
  }
  return terms;
}

/** Вид места по id; такого вида нет в каталоге — `undefined`. */
export function findPlaceKind(kinds: readonly PlaceKind[], id: PlaceCategory | null): PlaceKind | undefined {
  return id === null ? undefined : kinds.find((kind) => kind.id === id);
}

/**
 * Как назвать вид, среди мест которого выбирают: название из каталога на языке
 * интерфейса; выход — своим словом; вида нет в каталоге — его id.
 */
export function kindDisplayName(
  kinds: readonly PlaceKind[],
  kind: PlaceCategory,
  language: Language,
  exitLabel: string
): string {
  if (kind === EXIT_TARGET) return exitLabel;
  const found = findPlaceKind(kinds, kind);
  return found ? placeKindName(found, language) : kind;
}

/** Название вида на языке интерфейса; английского нет — русское. */
export function placeKindName(kind: PlaceKind, language: Language): string {
  return language === 'en' ? (kind.nameEn ?? kind.name) : kind.name;
}
