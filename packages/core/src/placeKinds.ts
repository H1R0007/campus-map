import type { PlaceKind } from './types/placeKind.js';

/**
 * Каталог видов, с которого начинает датасет без своего `place-kinds.json`.
 *
 * Это не список «разрешённых» видов, а затравка: разметчик правит, удаляет
 * и заводит свои виды прямо в редакторе, и тогда каталог целиком живёт в
 * данных — навигатор строит по нему быстрые кнопки, значки и поиск. Здесь
 * только коридор, помещение и три места быстрого поиска.
 *
 * Значки — из набора Tabler Icons (MIT, © Paweł Kuna), см.
 * `THIRD_PARTY_NOTICES.md`. Файл сгенерирован из пакета `@tabler/icons`:
 * значок хранится картинкой-адресом (`svgIconDataUrl`), чтобы навигатору не
 * нужна была вся библиотека.
 */
export const DEFAULT_PLACE_KINDS: readonly PlaceKind[] = [
  {
    id: 'corridor',
    name: 'Коридор',
    nameEn: 'Corridor',
    icon: 'tabler:walk',
    iconImage: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23000%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M12%204a1%201%200%201%200%202%200a1%201%200%201%200%20-2%200%22%2F%3E%3Cpath%20d%3D%22M7%2021l3%20-4%22%2F%3E%3Cpath%20d%3D%22M16%2021l-2%20-4l-3%20-3l1%20-6%22%2F%3E%3Cpath%20d%3D%22M6%2012l2%20-3l4%20-1l3%203l3%201%22%2F%3E%3C%2Fsvg%3E',
    color: 'muted',
    connect: true,
    chain: true,
  },
  {
    id: 'room',
    name: 'Помещение',
    nameEn: 'Room',
    icon: 'tabler:door',
    iconImage: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23000%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M14%2012v.01%22%2F%3E%3Cpath%20d%3D%22M3%2021h18%22%2F%3E%3Cpath%20d%3D%22M6%2021v-16a2%202%200%200%201%202%20-2h8a2%202%200%200%201%202%202v16%22%2F%3E%3C%2Fsvg%3E',
    color: 'node',
    namePattern: '{корпус}-{этаж}{номер}',
    connect: true,
  },
  {
    id: 'toilet',
    name: 'Туалет',
    nameEn: 'Toilet',
    icon: 'tabler:badge-wc',
    iconImage: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23000%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M3%207a2%202%200%200%201%202%20-2h14a2%202%200%200%201%202%202v10a2%202%200%200%201%20-2%202h-14a2%202%200%200%201%20-2%20-2v-10%22%2F%3E%3Cpath%20d%3D%22M6.5%209l.5%206l2%20-4l2%204l.5%20-6%22%2F%3E%3Cpath%20d%3D%22M17%2010.5a1.5%201.5%200%200%200%20-3%200v3a1.5%201.5%200%200%200%203%200%22%2F%3E%3C%2Fsvg%3E',
    color: 'place',
    searchTerms: ['туалет','уборная','санузел','wc','toilet','restroom','bathroom','lavatory'],
    place: true,
    quick: true,
    namePattern: 'Туалет',
    connect: true,
  },
  {
    id: 'food',
    name: 'Столовая',
    nameEn: 'Canteen',
    icon: 'tabler:tools-kitchen-2',
    iconImage: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23000%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M19%203v12h-5c-.023%20-3.681%20.184%20-7.406%205%20-12m0%2012v6h-1v-3m-10%20-14v17m-3%20-17v3a3%203%200%201%200%206%200v-3%22%2F%3E%3C%2Fsvg%3E',
    color: 'place',
    searchTerms: ['столовая','столовка','буфет','кафе','еда','поесть','обед','кофе','canteen','cafeteria','cafe','food','eat','lunch','coffee'],
    place: true,
    quick: true,
    namePattern: 'Столовая',
    connect: true,
  },
  {
    id: 'cloakroom',
    name: 'Гардероб',
    nameEn: 'Cloakroom',
    icon: 'tabler:hanger',
    iconImage: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23000%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M14%206a2%202%200%201%200%20-4%200c0%201.667%20.67%203%202%204h-.008l7.971%204.428a2%202%200%200%201%201.029%201.749v.823a2%202%200%200%201%20-2%202h-14a2%202%200%200%201%20-2%20-2v-.823a2%202%200%200%201%201.029%20-1.749l7.971%20-4.428%22%2F%3E%3C%2Fsvg%3E',
    color: 'place',
    searchTerms: ['гардероб','гардеробная','раздевалка','верхняя одежда','cloakroom','coat check','wardrobe'],
    place: true,
    quick: true,
    namePattern: 'Гардероб',
    connect: true,
  },
];

/** Каталог видов датасета: свой, если он есть, иначе затравка. */
export function placeKindsOf(kinds: readonly PlaceKind[]): readonly PlaceKind[] {
  return kinds.length > 0 ? kinds : DEFAULT_PLACE_KINDS;
}

/**
 * Виды — места быстрого поиска: их id и есть вид места (`category`) в
 * `aliases.json`. Коридор и помещение сюда не входят: по ним не ищут
 * «ближайший».
 */
export function searchablePlaceKinds(kinds: readonly PlaceKind[]): PlaceKind[] {
  return placeKindsOf(kinds).filter((kind) => kind.place === true);
}

/** Узел значка: тег и атрибуты — формат наборов вроде Tabler Icons. */
export type IconNode = readonly [string, Readonly<Record<string, string>>];

/**
 * Значок из узлов SVG — картинкой-адресом для данных.
 *
 * Обводка чёрная: навигатор и редактор рисуют значок маской, цветом текста
 * вокруг, — так он подстраивается под тёмную тему и под нажатую кнопку.
 */
export function svgIconDataUrl(nodes: readonly IconNode[]): string {
  const body = nodes
    .map(
      ([tag, attrs]) =>
        `<${tag}${Object.entries(attrs)
          .filter(([key]) => key !== 'key')
          .map(([key, value]) => ` ${key}="${value}"`)
          .join('')}/>`
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Картинка значка, которую данные могут нести: SVG или PNG адресом `data:`. */
export function isIconImage(value: string): boolean {
  return /^data:image\/(svg\+xml|png)[,;]/.test(value) && value.length <= MAX_ICON_IMAGE_LENGTH;
}

/**
 * Предел размера значка в данных. Значок едет в `place-kinds.json`, который
 * навигатор грузит целиком, — картинка на сотни килобайт замедлила бы старт
 * на телефоне.
 */
export const MAX_ICON_IMAGE_LENGTH = 64 * 1024;
