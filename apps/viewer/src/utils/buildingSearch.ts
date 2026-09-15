import type { BuildingMeta, CampusMeta } from '@campus-map/core';
import { buildingName } from '@campus-map/core';
import { LANGUAGES } from '../i18n/languages';

/** Регистр, «ё» и лишние пробелы не мешают совпадению. */
const normalize = (text: string) =>
  text.toLocaleLowerCase('ru').split('ё').join('е').split(' ').filter(Boolean).join(' ');

/**
 * Корпуса, чьё название на любом языке содержит запрос: «Корпус Б»,
 * «корпус б», «Building B».
 *
 * Помещения ищет `AliasManager`, а названия корпусов живут в метаданных
 * корпусов: без этого поиск «Корпус Б» ничего не находил.
 *
 * @returns id корпусов в порядке кампуса
 */
export function matchingBuildings(
  query: string,
  campusMeta: CampusMeta,
  buildingMetas: ReadonlyMap<string, BuildingMeta>
): string[] {
  const needle = normalize(query);
  if (needle === '') return [];

  return campusMeta.buildings
    .filter((building) => {
      const meta = buildingMetas.get(building.id);
      const names = meta
        ? [meta.name, ...LANGUAGES.map((language) => buildingName(meta, language))]
        : [building.name ?? building.id];
      return names.some((name) => normalize(name).includes(needle));
    })
    .map((building) => building.id);
}
