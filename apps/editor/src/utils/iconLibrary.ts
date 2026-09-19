import { svgIconDataUrl } from '@campus-map/core';
import type { IconNode } from '@campus-map/core';

/**
 * Библиотека значков для видов мест — Tabler Icons (MIT, см.
 * `THIRD_PARTY_NOTICES.md`), больше пяти тысяч значков без логотипов брендов.
 *
 * Метки библиотеки английские, поэтому для частых мест кампуса есть подборка
 * с русскими названиями и словами — по ним ищут «кофе», «врач», «печать».
 * Выбранный значок едет в данные картинкой (`iconImage`): навигатору
 * библиотека не нужна.
 */

/** Значок подборки: имя в библиотеке, русское название и слова для поиска. */
export interface CuratedIcon {
  name: string;
  label: string;
  words: string;
}

/** Подборка «для кампуса» — то, что чаще всего нужно на карте вуза. */
export const CURATED_ICON_GROUPS: readonly { title: string; icons: readonly CuratedIcon[] }[] = [
  {
    title: 'Еда и напитки',
    icons: [
      { name: 'tools-kitchen-2', label: 'Столовая', words: 'еда обед кафе буфет' },
      { name: 'coffee', label: 'Кофе', words: 'кофейня напитки кафе' },
      { name: 'cup', label: 'Чай', words: 'напитки' },
      { name: 'glass-full', label: 'Напитки', words: 'бар' },
      { name: 'bottle', label: 'Вода', words: 'кулер питьевая' },
      { name: 'pizza', label: 'Пицца', words: 'фастфуд' },
      { name: 'burger', label: 'Фастфуд', words: 'бургер еда' },
      { name: 'bread', label: 'Выпечка', words: 'буфет пекарня' },
      { name: 'salad', label: 'Салат', words: 'здоровая еда' },
      { name: 'ice-cream-2', label: 'Мороженое', words: 'сладости' },
      { name: 'candy', label: 'Сладости', words: 'вендинг автомат' },
      { name: 'apple', label: 'Фрукты', words: 'еда' },
    ],
  },
  {
    title: 'Учёба',
    icons: [
      { name: 'school', label: 'Учёба', words: 'университет' },
      { name: 'book', label: 'Библиотека', words: 'книги читальный зал' },
      { name: 'books', label: 'Книги', words: 'библиотека' },
      { name: 'notebook', label: 'Тетрадь', words: 'конспект' },
      { name: 'presentation', label: 'Аудитория', words: 'лекция зал' },
      { name: 'certificate', label: 'Деканат', words: 'документы справки' },
      { name: 'flask', label: 'Лаборатория', words: 'химия опыты' },
      { name: 'microscope', label: 'Микроскоп', words: 'лаборатория биология' },
      { name: 'calculator', label: 'Калькулятор', words: 'математика' },
      { name: 'device-desktop', label: 'Компьютерный класс', words: 'компьютер пк' },
      { name: 'printer', label: 'Печать', words: 'принтер распечатать копировальный центр' },
      { name: 'copy', label: 'Копирование', words: 'ксерокс' },
      { name: 'backpack', label: 'Студенту', words: 'рюкзак' },
      { name: 'world', label: 'Международный отдел', words: 'иностранцы' },
    ],
  },
  {
    title: 'Здоровье',
    icons: [
      { name: 'first-aid-kit', label: 'Медпункт', words: 'врач аптечка медицина' },
      { name: 'stethoscope', label: 'Врач', words: 'медпункт поликлиника' },
      { name: 'pill', label: 'Аптека', words: 'лекарства' },
      { name: 'heartbeat', label: 'Здоровье', words: 'медицина' },
      { name: 'dental', label: 'Стоматолог', words: 'зубы' },
      { name: 'wheelchair', label: 'Доступная среда', words: 'инвалид колясочник' },
      { name: 'mood-smile', label: 'Психолог', words: 'поддержка' },
    ],
  },
  {
    title: 'Службы и быт',
    icons: [
      { name: 'badge-wc', label: 'Туалет', words: 'wc уборная санузел' },
      { name: 'man', label: 'Мужской', words: 'туалет' },
      { name: 'woman', label: 'Женский', words: 'туалет' },
      { name: 'hanger', label: 'Гардероб', words: 'одежда раздевалка' },
      { name: 'baby-carriage', label: 'Мать и дитя', words: 'комната детская' },
      { name: 'bath', label: 'Душ', words: 'ванная' },
      { name: 'wash-machine', label: 'Прачечная', words: 'стирка' },
      { name: 'bed', label: 'Общежитие', words: 'отдых сон' },
      { name: 'sofa', label: 'Зона отдыха', words: 'диван коворкинг' },
      { name: 'info-circle', label: 'Информация', words: 'справка стойка' },
      { name: 'help', label: 'Помощь', words: 'вопросы' },
      { name: 'shield', label: 'Охрана', words: 'безопасность пост' },
      { name: 'lock', label: 'Камера хранения', words: 'шкафчики' },
      { name: 'key', label: 'Ключи', words: 'вахта' },
      { name: 'id-badge-2', label: 'Пропуска', words: 'бюро пропусков' },
      { name: 'mail', label: 'Почта', words: 'письма' },
      { name: 'trash', label: 'Урна', words: 'мусор' },
      { name: 'recycle', label: 'Раздельный сбор', words: 'переработка' },
      { name: 'smoking', label: 'Место для курения', words: 'курилка' },
      { name: 'fire-extinguisher', label: 'Огнетушитель', words: 'пожар' },
    ],
  },
  {
    title: 'Деньги и покупки',
    icons: [
      { name: 'cash', label: 'Касса', words: 'оплата деньги' },
      { name: 'credit-card', label: 'Оплата картой', words: 'терминал' },
      { name: 'building-bank', label: 'Банк', words: 'банкомат' },
      { name: 'shopping-cart', label: 'Магазин', words: 'покупки' },
      { name: 'basket', label: 'Лавка', words: 'покупки' },
      { name: 'gift', label: 'Сувениры', words: 'подарки' },
      { name: 'receipt', label: 'Бухгалтерия', words: 'чеки счета' },
    ],
  },
  {
    title: 'Техника и связь',
    icons: [
      { name: 'wifi', label: 'Wi-Fi', words: 'интернет' },
      { name: 'plug', label: 'Розетки', words: 'электричество' },
      { name: 'battery-charging', label: 'Зарядка', words: 'телефон' },
      { name: 'phone', label: 'Телефон', words: 'звонок' },
      { name: 'device-laptop', label: 'Ноутбук', words: 'коворкинг' },
      { name: 'headphones', label: 'Наушники', words: 'аудио' },
      { name: 'camera', label: 'Фото', words: 'съёмка' },
    ],
  },
  {
    title: 'Спорт и культура',
    icons: [
      { name: 'ball-football', label: 'Стадион', words: 'футбол спорт' },
      { name: 'ball-basketball', label: 'Спортзал', words: 'баскетбол' },
      { name: 'swimming', label: 'Бассейн', words: 'плавание' },
      { name: 'barbell', label: 'Тренажёрный зал', words: 'фитнес' },
      { name: 'run', label: 'Спорт', words: 'бег' },
      { name: 'music', label: 'Музыка', words: 'хор' },
      { name: 'theater', label: 'Актовый зал', words: 'сцена театр' },
      { name: 'movie', label: 'Кинозал', words: 'кино' },
      { name: 'palette', label: 'Искусство', words: 'рисование' },
      { name: 'microphone', label: 'Конференц-зал', words: 'выступление' },
      { name: 'trophy', label: 'Музей', words: 'награды' },
    ],
  },
  {
    title: 'Транспорт',
    icons: [
      { name: 'bus', label: 'Автобус', words: 'остановка' },
      { name: 'parking', label: 'Парковка', words: 'стоянка' },
      { name: 'bike', label: 'Велопарковка', words: 'велосипед' },
      { name: 'car', label: 'Автомобиль', words: 'машина' },
      { name: 'train', label: 'Электричка', words: 'поезд' },
    ],
  },
  {
    title: 'Здания и путь',
    icons: [
      { name: 'door', label: 'Дверь', words: 'помещение кабинет' },
      { name: 'walk', label: 'Коридор', words: 'путь проход' },
      { name: 'door-enter', label: 'Вход', words: 'дверь' },
      { name: 'door-exit', label: 'Выход', words: 'дверь' },
      { name: 'stairs', label: 'Лестница', words: 'этаж' },
      { name: 'elevator', label: 'Лифт', words: 'этаж' },
      { name: 'building', label: 'Корпус', words: 'здание' },
      { name: 'home', label: 'Дом', words: 'общежитие' },
      { name: 'map-pin', label: 'Метка', words: 'место' },
      { name: 'flag', label: 'Флаг', words: 'точка сбора' },
      { name: 'star', label: 'Звезда', words: 'избранное' },
      { name: 'note', label: 'Заметка', words: 'записка' },
    ],
  },
];

/** Разделы всей библиотеки по-русски — в порядке, в каком их удобно смотреть. */
export const LIBRARY_SECTIONS: readonly [string, string][] = [
  ['Food', 'Еда'],
  ['Health', 'Здоровье'],
  ['Buildings', 'Здания'],
  ['Map', 'Карта и места'],
  ['Vehicles', 'Транспорт'],
  ['Sport', 'Спорт'],
  ['Document', 'Документы'],
  ['E-commerce', 'Покупки'],
  ['Currencies', 'Деньги'],
  ['Devices', 'Устройства'],
  ['Computers', 'Компьютеры'],
  ['Communication', 'Связь'],
  ['Media', 'Медиа'],
  ['Photography', 'Фото'],
  ['Laundry', 'Стирка'],
  ['Nature', 'Природа'],
  ['Animals', 'Животные'],
  ['Weather', 'Погода'],
  ['Mood', 'Настроение'],
  ['Gender', 'Люди'],
  ['Gestures', 'Жесты'],
  ['Games', 'Игры'],
  ['Design', 'Дизайн'],
  ['Shapes', 'Фигуры'],
  ['Symbols', 'Символы'],
  ['Badges', 'Значки'],
  ['Arrows', 'Стрелки'],
  ['Letters', 'Буквы'],
  ['Numbers', 'Цифры'],
  ['Text', 'Текст'],
  ['Math', 'Математика'],
  ['Charts', 'Диаграммы'],
  ['Database', 'Данные'],
  ['Development', 'Разработка'],
  ['Version control', 'Версии'],
  ['Electrical', 'Электрика'],
  ['Logic', 'Логика'],
  ['Zodiac', 'Зодиак'],
  ['Extensions', 'Расширения'],
  ['System', 'Разное'],
];

/** Значок библиотеки. */
export interface LibraryIcon {
  name: string;
  category: string;
  tags: string;
  nodes: readonly IconNode[];
}

/** Загруженная библиотека: значки по имени. */
export type IconLibrary = ReadonlyMap<string, LibraryIcon>;

let loading: Promise<IconLibrary> | null = null;

/** Загружает библиотеку один раз — при первом открытии выбора значка. */
export function loadIconLibrary(): Promise<IconLibrary> {
  loading ??= import('virtual:tabler-icons').then(
    ({ default: icons }) =>
      new Map(icons.map(([name, category, tags, nodes]) => [name, { name, category, tags, nodes }] as const))
  );
  return loading;
}

/** Значок подборки по имени библиотеки. */
const CURATED_BY_NAME = new Map(CURATED_ICON_GROUPS.flatMap((group) => group.icons.map((icon) => [icon.name, icon] as const)));

/** Русское название значка, если он в подборке, иначе имя библиотеки. */
export function iconLabel(name: string): string {
  return CURATED_BY_NAME.get(name)?.label ?? name.replace(/-/g, ' ');
}

const normalize = (text: string) => text.toLowerCase().replace(/ё/g, 'е').trim();

/**
 * Поиск значков по-русски и по-английски.
 *
 * Сначала — подборка (русские названия и слова), затем вся библиотека по
 * имени и меткам. Все слова запроса должны найтись.
 */
export function searchIcons(library: IconLibrary, query: string, limit = 120): string[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const found: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    if (!seen.has(name) && library.has(name)) {
      seen.add(name);
      found.push(name);
    }
  };

  for (const group of CURATED_ICON_GROUPS) {
    for (const icon of group.icons) {
      const text = normalize(`${icon.label} ${icon.words} ${icon.name.replace(/-/g, ' ')}`);
      if (words.every((word) => text.includes(word))) add(icon.name);
    }
  }

  for (const icon of library.values()) {
    if (found.length >= limit) break;
    const text = normalize(`${icon.name.replace(/-/g, ' ')} ${icon.tags}`);
    if (words.every((word) => text.includes(word))) add(icon.name);
  }

  return found.slice(0, limit);
}

/** Картинка значка библиотеки — для данных вида. */
export function iconImageOf(library: IconLibrary, name: string): string | null {
  const icon = library.get(name);
  return icon ? svgIconDataUrl(icon.nodes) : null;
}
