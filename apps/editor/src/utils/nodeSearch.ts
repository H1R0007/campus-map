import { AliasManager } from '@campus-map/core';
import type { AliasEntry, MapNode } from '@campus-map/core';

/** Найденный узел и название, по которому он нашёлся. */
export interface NodeSearchHit {
  node: MapNode;
  /** Форма названия, совпавшая с запросом; `null` — нашёлся по id или координатам. */
  matched: string | null;
}

/** На сколько пикселей плана точка может отстоять от введённых координат. */
const COORDINATE_TOLERANCE = 30;

const MAX_RESULTS = 50;

/**
 * Индекс названий для нечёткого поиска — один на одно состояние названий.
 *
 * Ключ — сами карты названий и переводов из стора: после правки названий
 * стор создаёт новые, и индекс строится заново; пока названия не менялись,
 * каждое нажатие клавиши ищет по готовому.
 */
const indexes = new WeakMap<ReadonlyMap<string, readonly string[]>, { translations: unknown; manager: AliasManager }>();

function indexOf(
  aliases: ReadonlyMap<string, readonly string[]>,
  translations: ReadonlyMap<string, NonNullable<AliasEntry['translations']>>
): AliasManager {
  const cached = indexes.get(aliases);
  if (cached && cached.translations === translations) return cached.manager;

  const manager = new AliasManager();
  manager.load(
    [...aliases].map(([id, names]) => ({ id, names: [...names], translations: translations.get(id) }))
  );
  indexes.set(aliases, { translations, manager });
  return manager;
}

/**
 * Поиск узлов редактора.
 *
 * Названия ищет тот же `AliasManager` ядра, что и навигатор: опечатки
 * («Аудитори 101»), другая раскладка и латинские буквы вместо русских
 * («a-101») находят место. Раньше редактор искал точный кусок текста и не
 * находил того, что студент в навигаторе находит.
 *
 * Порядок: точный id, затем названия по убыванию сходства, затем id,
 * содержащие запрос. Запрос «100, 200» ищет узлы у этой точки плана.
 */
export function searchNodeHits(
  query: string,
  nodes: ReadonlyMap<string, MapNode>,
  aliases: ReadonlyMap<string, readonly string[]>,
  translations: ReadonlyMap<string, NonNullable<AliasEntry['translations']>> = new Map()
): NodeSearchHit[] {
  const q = query.trim();
  if (!q) return [];

  const point = q.replace(/[()]/g, '').trim().match(/^(-?\d+)\s*[,\s]\s*(-?\d+)$/);
  if (point) {
    const x = Number.parseInt(point[1], 10);
    const y = Number.parseInt(point[2], 10);
    return [...nodes.values()]
      .filter((node) => Math.abs(node.x - x) < COORDINATE_TOLERANCE && Math.abs(node.y - y) < COORDINATE_TOLERANCE)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
      .slice(0, MAX_RESULTS)
      .map((node) => ({ node, matched: null }));
  }

  const hits: NodeSearchHit[] = [];
  const taken = new Set<string>();
  const take = (id: string, matched: string | null) => {
    const node = nodes.get(id);
    if (!node || taken.has(id)) return;
    taken.add(id);
    hits.push({ node, matched });
  };

  const lower = q.toLowerCase();
  if (nodes.has(q)) take(q, null);

  for (const suggestion of indexOf(aliases, translations).suggest(q, Number.POSITIVE_INFINITY)) {
    take(suggestion.id, suggestion.alias);
    if (hits.length >= MAX_RESULTS) return hits;
  }

  for (const id of nodes.keys()) {
    if (id.toLowerCase().includes(lower)) take(id, null);
    if (hits.length >= MAX_RESULTS) break;
  }

  return hits;
}
