import type { AliasEntry, PlaceCategory, SearchSuggestion } from '../types/alias.js';

/**
 * Индекс названий для поиска по карте.
 *
 * Поддерживает то, чего ждут от навигатора: точное совпадение, префикс,
 * подстроку, аббревиатуру («кз» → «конференц-зал»), подпоследовательность,
 * опечатки (расстояние Левенштейна) и ввод в неправильной раскладке
 * («f-101» → «А-101»).
 */

/** Запись индекса: одна форма имени одного узла. */
interface AliasRecord {
  id: string;
  display: string;
  normalized: string;
  tokens: string[];
  acronym: string;
}

/**
 * Вариант запроса, подготовленный один раз на вызов `suggest`.
 *
 * Всё, что зависит только от запроса, считается здесь, а не в оценке каждой
 * записи индекса.
 */
interface PreparedQuery {
  text: string;
  /**
   * Запрос как аббревиатура — `null`, если так его читать нельзя.
   *
   * Однословный запрос сам по себе и есть аббревиатура («кз» → «конференц-зал»),
   * у многословного это первые буквы слов («конф зал» → «кз»). Короче двух букв
   * аббревиатура не считается: одна буква совпадала с первой буквой любого
   * названия, и «canteen» предлагал «Спортзал», «Гардероб» и «Компьютерный
   * класс» — всё, что начинается на «с» после свёртки латинских двойников.
   */
  acronym: string | null;
}

/** Самая короткая аббревиатура, по которой ещё ищется совпадение. */
const MIN_ACRONYM_LENGTH = 2;

/** Содержимое кэша — полный список совпадений до обрезки по limit. */
interface CacheEntry {
  results: SearchSuggestion[];
  timestamp: number;
}

/** Максимальное расстояние Левенштейна, при котором совпадение ещё считается опечаткой. */
const FUZZY_MAX_DISTANCE = 2;

/** Опечатки ищутся только для коротких запросов: на длинных это дорого и бесполезно. */
const FUZZY_MAX_QUERY_LENGTH = 5;

/** Соответствие клавиш QWERTY → ЙЦУКЕН. */
const QWERTY_TO_CYRILLIC: Readonly<Record<string, string>> = Object.freeze({
  q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з',
  '[': 'х', ']': 'ъ',
  a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л', l: 'д',
  ';': 'ж', "'": 'э',
  z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь',
  ',': 'б', '.': 'ю', '`': 'ё',
});

/**
 * Латинские буквы, совпадающие с кириллическими и видом, и звучанием, → кириллица.
 *
 * `b`, `h`, `p`, `y` не входят намеренно. Латинская «B» — транслитерация «Б», а
 * видом совпадает с «В»; «H» по виду «Н», а по звучанию «Х»; «P» по виду «Р», а
 * по звучанию «П». Свёртка по одному виду уверенно вела бы в чужой корпус.
 * «ё» сворачивается в «е»: в названиях её пишут через раз.
 */
const HOMOGLYPHS: Readonly<Record<string, string>> = Object.freeze({
  a: 'а', e: 'е', k: 'к', m: 'м', o: 'о', t: 'т', c: 'с', x: 'х', ё: 'е',
});

const HOMOGLYPH_PATTERN = new RegExp(`[${Object.keys(HOMOGLYPHS).join('')}]`, 'g');

export class AliasManager {
  /**
   * Нормализованное имя → id узлов с таким именем.
   *
   * Список, а не один id. Раньше здесь была запись `set(normalized, id)`, то
   * есть при совпадении имён побеждало последнее — молча. На кампусе из пяти
   * корпусов совпадения неизбежны: «Столовая» есть в каждом, «101» — почти на
   * каждом этаже. Молчаливая перезапись означает, что поиск уверенно ведёт
   * студента не туда, и заметить это невозможно ни по данным, ни по коду.
   */
  private aliasToIds = new Map<string, string[]>();

  /** Все формы имён для нечёткого поиска. */
  private index: AliasRecord[] = [];

  /** id узла → его имена в порядке объявления; первое считается основным. */
  private idToAliases = new Map<string, string[]>();

  /** id узла → переводы его имён, как они пришли из данных. */
  private idToTranslations = new Map<string, NonNullable<AliasEntry['translations']>>();

  /** id узла → категория места; только у мест с названием. */
  private idToCategory = new Map<string, PlaceCategory>();

  /** Категория → id мест с названием в порядке объявления в данных. */
  private categoryToIds = new Map<PlaceCategory, string[]>();

  private cache = new Map<string, CacheEntry>();

  /**
   * Кэш живёт доли секунды: его задача — не пересчитывать ранжирование на
   * каждое событие ввода при перерисовке, а не хранить результаты подолгу.
   */
  private readonly cacheTtlMs = 400;
  private readonly cacheMaxSize = 128;

  /**
   * Заполняет индекс из нормализованных алиасов.
   *
   * Повторный вызов полностью заменяет предыдущее содержимое.
   */
  load(entries: AliasEntry[]): void {
    this.aliasToIds.clear();
    this.index = [];
    this.idToAliases.clear();
    this.idToTranslations.clear();
    this.idToCategory.clear();
    this.categoryToIds.clear();
    this.cache.clear();

    const seen = new Set<string>();

    for (const entry of entries) {
      if (!entry.id) continue;

      const names: string[] = [];
      if (entry.name) names.push(entry.name);
      if (entry.names) names.push(...entry.names);

      const displayNameOrder: string[] = [];

      for (const display of names) {
        if (this.indexName(entry.id, display, seen)) displayNameOrder.push(display);
      }

      if (displayNameOrder.length > 0) {
        this.idToAliases.set(entry.id, displayNameOrder);
      }

      // Категория — только у места с названием: безымянное место быстрая
      // кнопка не смогла бы ни назвать, ни показать в подсказках.
      if (entry.category !== undefined && displayNameOrder.length > 0 && !this.idToCategory.has(entry.id)) {
        this.idToCategory.set(entry.id, entry.category);
        const ids = this.categoryToIds.get(entry.category);
        if (ids) ids.push(entry.id);
        else this.categoryToIds.set(entry.category, [entry.id]);
      }

      // Имена на других языках ищутся наравне с основными: студент набирает
      // название на своём языке, даже если не переключил язык интерфейса.
      if (entry.translations) this.idToTranslations.set(entry.id, entry.translations);
      for (const translation of Object.values(entry.translations ?? {})) {
        for (const display of translation.names) this.indexName(entry.id, display, seen);
      }
    }
  }

  /**
   * Добавляет одну форму имени узла в индекс.
   *
   * @param seen пары «узел + нормализованное имя», уже попавшие в индекс
   * @returns `false`, если имя пустое или у узла уже есть такая форма
   */
  private indexName(id: string, display: string, seen: Set<string>): boolean {
    if (!display) return false;

    const normalized = this.normalize(display);
    if (!normalized) return false;

    const key = `${id}|${normalized}`;
    if (seen.has(key)) return false;
    seen.add(key);

    const owners = this.aliasToIds.get(normalized);
    if (owners) {
      if (!owners.includes(id)) owners.push(id);
    } else {
      this.aliasToIds.set(normalized, [id]);
    }

    const tokens = this.tokenize(normalized);
    this.index.push({
      id,
      display,
      normalized,
      tokens,
      acronym: this.makeAcronym(tokens),
    });

    return true;
  }

  /** Число проиндексированных форм имён. */
  get size(): number {
    return this.index.length;
  }

  /**
   * Точный поиск id по имени (с нормализацией регистра и пунктуации).
   *
   * При неоднозначности возвращает `null`, а не произвольный из подходящих
   * узлов: «Столовая» на кампусе из пяти корпусов не определяет точку, и
   * выбрать за пользователя один из вариантов значит соврать. Вызывающая
   * сторона должна показать выбор — список даёт {@link resolveAll}.
   */
  resolve(alias: string): string | null {
    const ids = this.aliasToIds.get(this.normalize(alias));
    return ids !== undefined && ids.length === 1 ? ids[0] : null;
  }

  /**
   * Все узлы с таким именем, в порядке объявления в датасете.
   *
   * Пустой список — имени нет; больше одного — имя неоднозначно.
   */
  resolveAll(alias: string): readonly string[] {
    return this.aliasToIds.get(this.normalize(alias)) ?? EMPTY;
  }

  /**
   * Имена, которые указывают более чем на один узел.
   *
   * Не ошибка данных сама по себе (в двух корпусах законно есть «Столовая»),
   * но точный поиск по такому имени работать не может, и разметчик должен об
   * этом знать. Метод живёт здесь, а не в загрузчике, потому что правило
   * нормализации имён принадлежит этому классу — вторая его копия в
   * загрузчике разошлась бы с первой.
   *
   * @returns имя в том виде, в каком оно впервые встретилось в данных, → id
   *          узлов. Не нормализованная форма: после свёртки латинских
   *          двойников она нечитаема («Canteen» → «саnтееn»), а список
   *          показывается разметчику.
   */
  ambiguousAliases(): Map<string, readonly string[]> {
    const result = new Map<string, readonly string[]>();
    const seen = new Set<string>();

    for (const record of this.index) {
      if (seen.has(record.normalized)) continue;
      seen.add(record.normalized);

      const ids = this.aliasToIds.get(record.normalized) ?? EMPTY;
      if (ids.length > 1) result.set(record.display, ids);
    }

    return result;
  }

  /** Все имена узла в порядке объявления. */
  getAliasesForId(id: string): readonly string[] {
    return this.idToAliases.get(id) ?? EMPTY;
  }

  /** Категория места; `null`, если её нет или у места нет названия. */
  getCategory(id: string): PlaceCategory | null {
    return this.idToCategory.get(id) ?? null;
  }

  /** Места категории — только с названием, в порядке объявления в данных. */
  getIdsByCategory(category: PlaceCategory): readonly string[] {
    return this.categoryToIds.get(category) ?? EMPTY;
  }

  /**
   * Основное имя узла — первое в списке алиасов.
   *
   * С языком интерфейса — первое имя перевода на этот язык. Без перевода
   * возвращается исходное имя: помещение без английского названия англоязычный
   * интерфейс покажет по-русски, но покажет, а не потеряет.
   */
  getPrimaryAliasForId(id: string, language?: string): string | null {
    const translated =
      language !== undefined ? this.idToTranslations.get(id)?.[language]?.names[0] : undefined;
    if (translated !== undefined) return translated;

    const list = this.idToAliases.get(id);
    return list && list.length > 0 ? list[0] : null;
  }

  /**
   * Нечёткий поиск с ранжированием.
   *
   * Результаты сортируются по убыванию оценки, при равенстве — по длине
   * имени (короткое предпочтительнее). Одинаковые формы имени схлопываются,
   * но разные имена одного узла остаются: так пользователь видит варианты.
   */
  suggest(query: string, limit: number = 5): SearchSuggestion[] {
    if (!query.trim()) return [];
    if (limit <= 0) return [];

    const cached = this.cache.get(query);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.results.slice(0, limit);
    }

    const qNorm = this.normalize(query);
    if (!qNorm) return [];

    const qAlt = this.normalize(this.swapKeyboardLayout(query));

    // Всё, что зависит только от запроса, считается один раз здесь, а не в
    // оценке каждой записи. Акроним запроса раньше пересобирался (разбиение
    // регуляркой + склейка) для каждой записи индекса на каждое нажатие
    // клавиши — на тысячах помещений это тысячи лишних аллокаций на символ.
    const prepared: PreparedQuery[] = [qNorm, qAlt]
      .filter((q) => q.length > 0)
      .map((q) => ({ text: q, acronym: this.queryAcronym(q) }));

    const scored: SearchSuggestion[] = [];

    for (const record of this.index) {
      const score = this.scoreMatch(prepared, record);
      if (score > 0) {
        scored.push({ alias: record.display, id: record.id, score });
      }
    }

    scored.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.alias.length - b.alias.length;
    });

    // Схлопываются только одинаковые формы имени **одного и того же** узла.
    // Раньше ключом был один текст, и из двух «Столовых» разных корпусов в
    // подсказках оставалась одна: вторая становилась недостижимой из
    // интерфейса, хотя в данных была записана правильно.
    const unique: SearchSuggestion[] = [];
    const seen = new Set<string>();
    for (const suggestion of scored) {
      const key = `${suggestion.id} ${suggestion.alias}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(suggestion);
    }

    if (this.cache.size >= this.cacheMaxSize) {
      this.cache.clear();
    }
    // Кэшируем полный список, а не обрезанный по limit: иначе запрос с
    // меньшим limit навсегда портил кэш для последующих запросов с большим.
    this.cache.set(query, { results: unique, timestamp: Date.now() });

    return unique.slice(0, limit);
  }

  /**
   * Приводит имя к форме, пригодной для сравнения.
   *
   * Кроме регистра и пунктуации сворачивает латинские буквы, которые совпадают
   * с кириллическими и видом, и звучанием, а «ё» — в «е». Номер «А-305» на
   * табличке кириллический, а иностранный студент — и любой, у кого включена
   * английская раскладка, — набирает «A-305» латиницей. Свёртка одинаково
   * применяется к индексу и к запросу, поэтому английским именам она не мешает.
   */
  private normalize(s: string): string {
    return s
      .toLowerCase()
      .replace(HOMOGLYPH_PATTERN, (ch) => HOMOGLYPHS[ch] ?? ch)
      .replace(/[_\-/\\]/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tokenize(s: string): string[] {
    return s.split(/\s+/).filter(Boolean);
  }

  private makeAcronym(tokens: string[]): string {
    return tokens.map((t) => t[0] ?? '').join('');
  }

  /** Аббревиатура нормализованного запроса — см. {@link PreparedQuery.acronym}. */
  private queryAcronym(query: string): string | null {
    const tokens = this.tokenize(query);
    const acronym = tokens.length > 1 ? this.makeAcronym(tokens) : query;
    return acronym.length >= MIN_ACRONYM_LENGTH ? acronym : null;
  }

  /** Переключает латиницу на кириллицу по таблице соответствия клавиш. */
  private swapKeyboardLayout(s: string): string {
    let result = '';
    for (const ch of s.toLowerCase()) {
      result += QWERTY_TO_CYRILLIC[ch] ?? ch;
    }
    return result;
  }

  /**
   * Оценка совпадения. Шкала построена так, что каждый следующий уровень
   * совпадения заведомо слабее предыдущего, а вычитание длины имени и
   * позиции разрывает равенства внутри уровня.
   */
  private scoreMatch(queries: readonly PreparedQuery[], record: AliasRecord): number {
    let best = -1;
    let previous: string | null = null;

    for (const query of queries) {
      // Запрос в правильной раскладке совпадает с «переключённым» — второй
      // раз считать ту же оценку незачем.
      if (query.text === previous) continue;
      previous = query.text;

      best = Math.max(best, this.scoreOne(query, record));
    }

    return best;
  }

  /** Оценка одного варианта запроса против одной записи индекса. */
  private scoreOne(query: PreparedQuery, record: AliasRecord): number {
    const q = query.text;

    if (q === record.normalized) return 100_000;

    if (record.normalized.startsWith(q)) {
      return 90_000 - (record.normalized.length - q.length);
    }

    for (const token of record.tokens) {
      if (token.startsWith(q)) {
        return 85_000 - record.display.length;
      }
    }

    const pos = record.normalized.indexOf(q);
    if (pos !== -1) {
      return 80_000 - pos * 2 - record.display.length;
    }

    if (query.acronym !== null && record.acronym.startsWith(query.acronym)) {
      return 78_000 - record.acronym.length;
    }

    if (this.isSubsequence(q, record.normalized)) {
      return 70_000 - record.display.length;
    }

    if (q.length <= FUZZY_MAX_QUERY_LENGTH) {
      for (const token of record.tokens) {
        const dist = this.levenshtein(q, token, FUZZY_MAX_DISTANCE);
        if (dist <= FUZZY_MAX_DISTANCE) {
          return 65_000 - dist * 200 - record.display.length;
        }
      }
    }

    return -1;
  }

  /** Является ли `sub` подпоследовательностью `str`. */
  private isSubsequence(sub: string, str: string): boolean {
    let i = 0;
    for (let j = 0; i < sub.length && j < str.length; j++) {
      if (sub[i] === str[j]) i++;
    }
    return i === sub.length;
  }

  /**
   * Расстояние Левенштейна с ранним выходом.
   *
   * `cutoff` ограничивает счёт сверху: как только минимальное значение в
   * строке матрицы превышает порог, дальнейший расчёт бессмыслен. Это
   * заметно дешевле полного O(n·m) при поиске опечаток.
   */
  private levenshtein(a: string, b: string, cutoff: number): number {
    const n = a.length;
    const m = b.length;

    if (Math.abs(n - m) > cutoff) return cutoff + 1;

    let prev = Array.from({ length: m + 1 }, (_, i) => i);
    let curr = new Array<number>(m + 1);

    for (let i = 1; i <= n; i++) {
      curr[0] = i;
      let minInRow = i;

      for (let j = 1; j <= m; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        if (curr[j] < minInRow) minInRow = curr[j];
      }

      if (minInRow > cutoff) return cutoff + 1;
      [prev, curr] = [curr, prev];
    }

    return prev[m];
  }
}

const EMPTY: readonly string[] = Object.freeze([]);
