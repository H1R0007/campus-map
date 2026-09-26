import { DEFAULT_PLACE_KINDS, placeKindsOf } from '@campus-map/core';
import type { PlaceKind } from '@campus-map/core';

/**
 * Виды точек, с которых начинает любой датасет, — затравка ядра: навигатор
 * знает о ней то же, что редактор.
 *
 * Это не код разметки, а заготовки: разметчик правит их и заводит свои прямо
 * в редакторе, и тогда каталог целиком уходит в `place-kinds.json` рядом с
 * данными. Пока каталог не тронут, файла нет, а редактор показывает этот
 * список.
 *
 * Лестницы, лифты и входы сюда не входят: это переходы, их ставит инструмент
 * «Переход».
 */
export const BUILT_IN_PLACE_KINDS: readonly PlaceKind[] = DEFAULT_PLACE_KINDS;

/**
 * Каталог видов, который видит разметчик: свой, если он его завёл, иначе
 * встроенный.
 */
export function visibleKinds(placeKinds: readonly PlaceKind[]): readonly PlaceKind[] {
  return placeKindsOf(placeKinds);
}

/** Название вида места по id; вида нет в каталоге — сам id. */
export function placeKindName(placeKinds: readonly PlaceKind[], id: string): string {
  return placeKindsOf(placeKinds).find((kind) => kind.id === id)?.name ?? id;
}

/**
 * Название для новой точки по шаблону вида.
 *
 * `{корпус}` — буква из названия корпуса («Корпус А» → «А»), `{этаж}` — номер
 * этажа, `{номер}` — то, что наберёт человек; до ввода на его месте пусто.
 * Без шаблона название не предлагается вовсе.
 */
export function kindNameTemplate(
  kind: PlaceKind,
  buildingName: string | undefined,
  floor: number | null
): string {
  if (!kind.namePattern) return '';

  const letter = buildingName?.match(/\p{Lu}\p{L}*$/u)?.[0]?.slice(0, 1) ?? '';
  return kind.namePattern
    .replace('{корпус}', letter)
    .replace('{этаж}', floor === null ? '' : String(floor))
    .replace('{номер}', '');
}
