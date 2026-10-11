/**
 * Фраза ориентира из его названия (запись 87): «Кофейный автомат» → «у
 * кофейного автомата», «Coffee machine» → «at the coffee machine».
 *
 * Разметчик пишет название, как видит, а студент читает живое предложение «У
 * кофейного автомата поверните налево». Поставить произвольное название в
 * падеж безошибочно нельзя: «двери» — «дверей», «колонны» — «колонн», а
 * «кафе» не склоняется. Поэтому это догадка по окончаниям, и разметчик видит
 * готовое предложение и правит фразу, если догадка вышла неверной.
 *
 * Склоняется начало названия до первого существительного — прилагательные и
 * само слово: «Стенд с расписанием» → «стенда с расписанием», «Доска
 * объявлений» → «доски объявлений». Остальное — как написано.
 */

/** Не склоняются: заимствования на гласную и сокращения. */
const INDECLINABLE = new Set(['кафе', 'фойе', 'кофе', 'табло', 'метро', 'кино', 'такси', 'атриум-кафе', 'пюре', 'жалюзи']);

const ADJECTIVE = /(ый|ий|ой|ая|яя|ое|ее|ые|ие)$/;

/** Женский род у прилагательного: «стеклянная дверь» → «двери», а не «дверя». */
const FEMININE_ADJECTIVE = /(ая|яя)$/;

const VELAR_OR_HUSHING = /[гкхжшчщ]$/;

/**
 * Мужской род на «-ь» — частые в здании: «указатель» → «указателя». Остальные
 * на «-ь» считаются женского рода: «дверь» → «двери».
 */
const MASCULINE_SOFT = /(тель|вестибюль|рояль|фонарь|календарь|автомобиль|портфель)$/;

/** Окончание прилагательного в родительном падеже. */
function adjectiveGenitive(word: string): string {
  if (/(ые|ие)$/.test(word)) return `${word.slice(0, -2)}${word.endsWith('ые') ? 'ых' : 'их'}`;
  if (/ая$/.test(word)) return `${word.slice(0, -2)}ой`;
  if (/яя$/.test(word)) return `${word.slice(0, -2)}ей`;
  if (/(ый|ой|ое)$/.test(word)) return `${word.slice(0, -2)}ого`;
  // «-ий»: «синий» → «синего», но «высокий» → «высокого».
  if (/(ий|ее)$/.test(word)) return VELAR_OR_HUSHING.test(word.slice(0, -2)) && word.endsWith('ий') ? `${word.slice(0, -2)}ого` : `${word.slice(0, -2)}его`;
  return word;
}

/** Существительное в родительном падеже — по окончанию. */
function nounGenitive(word: string, feminine: boolean): string {
  const lower = word.toLowerCase();
  if (INDECLINABLE.has(lower)) return word;
  const stem = word.slice(0, -1);

  // Множественное число: «турникеты» → «турникетов», «замки» → «замков», «двери» → «дверей».
  if (/ы$/.test(lower)) return `${stem}ов`;
  if (/[гкх]и$/.test(lower)) return `${stem}ов`;
  if (/и$/.test(lower)) return `${stem}ей`;

  if (/а$/.test(lower)) return `${stem}${VELAR_OR_HUSHING.test(stem.toLowerCase()) ? 'и' : 'ы'}`;
  if (/я$/.test(lower)) return `${stem}и`;
  if (/о$/.test(lower)) return `${stem}а`;
  if (/е$/.test(lower)) return `${stem}я`;
  if (/й$/.test(lower)) return `${stem}я`;
  if (/ь$/.test(lower)) return `${stem}${feminine || !MASCULINE_SOFT.test(lower) ? 'и' : 'я'}`;
  if (/[бвгджзклмнпрстфхцчшщ]$/.test(lower)) return `${word}а`;
  return word;
}

/** Первая буква строчная, если слово не сокращение и не номер: «Кофейный» → «кофейный», «МФЦ» и «А-305» — как есть. */
function lowerFirst(word: string): string {
  if (/\d/.test(word)) return word;
  const rest = word.slice(1);
  if (rest.length > 0 && rest === rest.toUpperCase() && /\p{L}/u.test(rest)) return word;
  return word.charAt(0).toLowerCase() + rest;
}

/**
 * «у …» по-русски: название в родительном падеже.
 *
 * @returns `null`, если названия нет
 */
export function russianAt(name: string): string | null {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const result = [...words];
  // Прилагательные до первого существительного и само существительное.
  let head = 0;
  while (head < words.length - 1 && ADJECTIVE.test(words[head].toLowerCase())) head += 1;
  const feminine = words.slice(0, head).some((word) => FEMININE_ADJECTIVE.test(word.toLowerCase()));
  for (let i = 0; i < head; i += 1) result[i] = adjectiveGenitive(words[i]);
  // Номер, название в кавычках, сокращение — «А-305», «„Наука“», «МФЦ» — не склоняются.
  const word = words[head];
  const abbreviation = word.length > 1 && word === word.toUpperCase();
  if (/^\p{L}+$/u.test(word) && !abbreviation) result[head] = nounGenitive(word, feminine);

  result[0] = lowerFirst(result[0]);
  return `у ${result.join(' ')}`;
}

/**
 * «at the …» по-английски.
 *
 * @returns `null`, если названия нет
 */
export function englishAt(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  const phrase = lowerFirst(trimmed);
  return /^the\s/i.test(phrase) ? `at ${phrase}` : `at the ${phrase}`;
}
