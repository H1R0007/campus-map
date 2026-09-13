import type { AliasManager, Graph } from '@campus-map/core';

/**
 * Места, на которые указывает неоднозначное название в поле маршрута.
 *
 * «Столовая» есть в нескольких корпусах: точка существует, но выбрать её за
 * человека нельзя (запись 7). Раньше такое поле молча оставалось
 * неразрешённым, а «Построить» — неактивной без объяснения. Теперь интерфейс
 * показывает варианты с корпусом и этажом.
 *
 * Учитывается только название, набранное целиком: при частичном вводе
 * вариантов и так достаточно в подсказках.
 *
 * @returns id мест в порядке объявления в данных — если их больше одного;
 *          иначе пустой список
 */
export function ambiguousMatches(
  query: string,
  graph: Graph | null,
  aliasManager: AliasManager | null
): readonly string[] {
  if (!query.trim() || graph === null || aliasManager === null) return NONE;

  // Алиас на удалённый узел выбрать всё равно нельзя — вариантом он не считается.
  const existing = aliasManager.resolveAll(query).filter((id) => graph.hasNode(id));

  return existing.length > 1 ? existing : NONE;
}

const NONE: readonly string[] = Object.freeze([]);
