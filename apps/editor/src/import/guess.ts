/**
 * Догадка, что изображено на листе: этаж какого корпуса, план территории или
 * лист, который планом не является (экспликация, титул), — запись 48.
 *
 * Подсказки берутся из трёх мест, от надёжного к слабому:
 * 1. заголовок листа — самый крупный текст («Корпус А. План 2-го этажа»);
 * 2. остальной текст листа — в том числе номера помещений: у владельца они
 *    пишутся «А-201», буква корпуса и первая цифра — этаж;
 * 3. имя файла — часто латиницей: «korpus-B-etazh-2.png».
 *
 * Каждое поле догадки помнит, откуда взято, — интерфейс это показывает:
 * человек видит, чему верить, а что проверить.
 */

export type ClueOrigin = 'title' | 'text' | 'rooms' | 'file';

export interface Clue {
  text: string;
  origin: ClueOrigin;
}

export interface PlaceGuess {
  kind: 'floor' | 'campus' | 'skip' | null;
  /**
   * Буква корпуса заглавной кириллицей («Б») или номер («2»). `latin` — буква,
   * как она стояла в имени файла: корпус в данных мог получить код по ней
   * (`building_c`).
   */
  building: { letter: string; latin?: string; from: Clue } | null;
  floor: { floor: number; label?: string; from: Clue } | null;
  /** Почему лист — территория или не план. */
  kindFrom: Clue | null;
}

/** Латиница имени файла → кириллица буквы корпуса: «V» → «В». */
const LATIN_LETTER: Record<string, string> = {
  a: 'А', b: 'Б', v: 'В', g: 'Г', d: 'Д', e: 'Е', zh: 'Ж', z: 'З', i: 'И', k: 'К', l: 'Л', m: 'М', n: 'Н',
  o: 'О', p: 'П', r: 'Р', s: 'С', t: 'Т', u: 'У', f: 'Ф', h: 'Х', kh: 'Х', c: 'Ц', ts: 'Ц', ch: 'Ч', sh: 'Ш',
  sch: 'Щ', yu: 'Ю', ya: 'Я',
};

const ORDINALS: [RegExp, number][] = [
  [/^перв/, 1], [/^втор/, 2], [/^трет/, 3], [/^четв[её]рт/, 4], [/^пят/, 5],
  [/^шест/, 6], [/^седьм/, 7], [/^восьм/, 8], [/^девят/, 9], [/^десят/, 10],
];

/** Нижний регистр, «ё» как «е», все виды минуса и тире — дефис. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/[−–—]/g, '-').replace(/\s+/g, ' ');
}

/** Имя файла без расширения и пути, разделители — пробелы: «korpus-B_etazh-2.png» → «korpus b etazh 2». */
export function fileClueText(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/([a-zа-я])(\d)/gi, '$1 $2')
    .replace(/[_.]+/g, ' ')
    .replace(/(^|\s)-|-(\s|$)/g, ' ')
    .trim();
}

const CAMPUS = /генплан|генеральн\S* план|ситуацион|план территори|схема территори|\bgenplan\b|\bsite ?plan\b|\bmaster ?plan\b|\bterritor/;
const SKIP = /экспликац|спецификац|ведомост|титульн|пояснительн|условн\S* обозначен|легенд|\bexplikac|\beksplikac|\bexplication\b/;

function buildingIn(text: string, origin: ClueOrigin): { letter: string; latin?: string } | null {
  // «Корпус А», «корпуса Б», «корп. В», «корпус №2».
  // Буква отделена от слова: иначе окончание «корпус-а» читалось бы корпусом «А».
  const russian = /(?:^|[^а-я])корп(?:уса|усе|усом|усу|ус|\.)(?=[\s№«"'„])\s*(?:№\s*)?[«"'„]?\s*([а-я]|\d{1,2})(?![а-я0-9])/.exec(text);
  if (russian) return { letter: russian[1].toUpperCase() };
  if (origin !== 'file') return null;
  // Латиница имени файла: «korpus b», «korp-v», «building 2», «bldg c».
  const latin = /(?:^|[^a-z])(?:korpus|korp|corpus|building|bldg|block)\s*-?\s*(zh|kh|ts|ch|sh|sch|yu|ya|[a-z]|\d{1,2})(?![a-z0-9])/.exec(text);
  if (!latin) return null;
  if (/\d/.test(latin[1])) return { letter: latin[1] };
  return { letter: LATIN_LETTER[latin[1]] ?? latin[1].toUpperCase(), latin: latin[1] };
}

function floorIn(text: string, origin: ClueOrigin): { floor: number; label?: string } | null {
  const mezzanine = /антресол|\bantresol|\bmezzanin/.test(text);
  let number: number | null = null;

  const digits =
    /(-?\d{1,2}(?:[.,]5)?)\s*-?\s*(?:го|й|ый|ий|ой|м|ом)?\s*этаж/.exec(text) ??
    /этаж\S*\s*(?:№\s*)?(-?\d{1,2}(?:[.,]5)?)(?![0-9])/.exec(text) ??
    (origin === 'file'
      ? (/(?:^|[^a-z])(?:etazh|etaj|etage|floor|level|uroven)\s*-?\s*(-?\d{1,2})(?![0-9])/.exec(text) ??
        /(?:^|[^0-9])(-?\d{1,2})\s*-?\s*(?:st|nd|rd|th)?\s*(?:etazh|etaj|floor|level)/.exec(text))
      : null);
  if (digits) number = Number(digits[1].replace(',', '.'));

  if (number === null) {
    const word = /([а-я]+)\s+этаж/.exec(text);
    if (word) number = ORDINALS.find(([pattern]) => pattern.test(word[1]))?.[1] ?? null;
  }

  if (mezzanine) {
    // «Антресоль 1 этажа» — между первым и вторым, на табличках «1А».
    if (number !== null && Number.isInteger(number)) return { floor: number + 0.5, label: `${number}А` };
    return null;
  }
  if (number !== null) return { floor: number };
  if (/подвал|\bpodval|\bbasement/.test(text)) return { floor: -1 };
  if (/цокол|\bcokol|\btsokol|\bsocle/.test(text)) return { floor: 0 };
  return null;
}

/**
 * Буква корпуса и этаж по номерам помещений «А-201»: берётся самый частый
 * вариант, и только если он заметно чаще остальных, — один чужой номер
 * (ссылка на соседний корпус) не должен сбить догадку.
 */
export function roomNumberClue(labels: readonly string[]): Clue | null {
  const counts = new Map<string, number>();
  for (const label of labels) {
    const match = /(?:^|[^а-яa-z])([а-я])-(\d)\d{2}(?!\d)/i.exec(normalize(label));
    if (!match) continue;
    const key = `${match[1].toUpperCase()}|${match[2]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0 || ranked[0][1] < 2) return null;
  if (ranked.length > 1 && ranked[1][1] * 2 > ranked[0][1]) return null;
  const [letter, floor] = ranked[0][0].split('|');
  return { text: `корпус ${letter}, ${floor} этаж`, origin: 'rooms' };
}

const ORDER: ClueOrigin[] = ['title', 'text', 'rooms', 'file'];

/** Догадка по подсказкам листа. */
export function guessPlace(clues: readonly Clue[]): PlaceGuess {
  const sorted = [...clues].sort((a, b) => ORDER.indexOf(a.origin) - ORDER.indexOf(b.origin));
  let building: PlaceGuess['building'] = null;
  let floor: PlaceGuess['floor'] = null;
  let skipFrom: Clue | null = null;
  let campusFrom: Clue | null = null;

  for (const clue of sorted) {
    const text = normalize(clue.origin === 'file' ? fileClueText(clue.text) : clue.text);
    // Экспликация узнаётся только по заголовку или имени файла: в тексте
    // плана это слово бывает и в сноске.
    if (!skipFrom && (clue.origin === 'title' || clue.origin === 'file') && SKIP.test(text)) skipFrom = clue;
    if (!campusFrom && CAMPUS.test(text)) campusFrom = clue;
    if (!building) {
      const found = buildingIn(text, clue.origin);
      if (found) building = { ...found, from: clue };
    }
    if (!floor) {
      const found = floorIn(text, clue.origin);
      if (found) floor = { ...found, from: clue };
    }
  }

  if (skipFrom && (skipFrom.origin === 'title' || !floor || floor.from.origin === 'file')) {
    return { kind: 'skip', building, floor, kindFrom: skipFrom };
  }
  if (campusFrom && !floor) return { kind: 'campus', building: null, floor: null, kindFrom: campusFrom };
  if (floor || building) return { kind: 'floor', building, floor, kindFrom: null };
  return { kind: null, building: null, floor: null, kindFrom: null };
}

/** Откуда догадка — словами для человека. */
export function clueSource(clue: Clue): string {
  switch (clue.origin) {
    case 'title':
      return `по заголовку листа «${clue.text.trim()}»`;
    case 'text':
      return `по тексту на листе «${clue.text.trim()}»`;
    case 'rooms':
      return 'по номерам помещений на листе';
    case 'file':
      return `по имени файла «${clue.text}»`;
  }
}
