import type { PlaceKind } from '@campus-map/core';

/**
 * Виды точек, с которых начинает любой датасет.
 *
 * Это не код разметки, а заготовки: разметчик правит их и заводит свои прямо
 * в редакторе, и тогда каталог целиком уходит в `place-kinds.json` рядом с
 * данными. Пока каталог не тронут, файла нет, а редактор показывает этот
 * список — так у чистого датасета не появляется файла, который никто не
 * просил.
 *
 * `{корпус}` и `{этаж}` в шаблоне названия подставляет редактор, `{номер}` —
 * место, куда встанет курсор.
 */
export const BUILT_IN_PLACE_KINDS: readonly PlaceKind[] = [
  { id: 'corridor', name: 'Коридор', icon: 'move', color: 'muted', connect: true },
  {
    id: 'room',
    name: 'Помещение',
    icon: 'door',
    color: 'node',
    namePattern: '{корпус}-{этаж}{номер}',
    connect: true,
  },
  { id: 'toilet', name: 'Туалет', icon: 'toilet', color: 'place', namePattern: 'Туалет', category: 'toilet', connect: true },
  { id: 'food', name: 'Столовая', icon: 'food', color: 'place', namePattern: 'Столовая', category: 'food', connect: true },
  {
    id: 'cloakroom',
    name: 'Гардероб',
    icon: 'cloakroom',
    color: 'place',
    namePattern: 'Гардероб',
    category: 'cloakroom',
    connect: true,
  },
  {
    id: 'stairs',
    name: 'Лестница',
    icon: 'stairs',
    color: 'portal',
    namePattern: 'Лестница',
    isPortal: true,
    transition: 'stairs',
    stack: true,
    connect: true,
  },
  {
    id: 'lift',
    name: 'Лифт',
    icon: 'lift',
    color: 'portal',
    namePattern: 'Лифт',
    isPortal: true,
    transition: 'lift',
    stack: true,
    connect: true,
  },
  {
    id: 'entrance',
    name: 'Вход',
    icon: 'entrance',
    color: 'portal',
    namePattern: 'Вход',
    isPortal: true,
    transition: 'entrance',
    category: 'exit',
    connect: true,
  },
];

/**
 * Каталог видов, который видит разметчик: свой, если он его завёл, иначе
 * встроенный.
 */
export function visibleKinds(placeKinds: readonly PlaceKind[]): readonly PlaceKind[] {
  return placeKinds.length > 0 ? placeKinds : BUILT_IN_PLACE_KINDS;
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
