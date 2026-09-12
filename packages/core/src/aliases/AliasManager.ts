import type { AliasEntry, SearchSuggestion } from '../types/alias.js';

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

export class AliasManager {
  /** Нормализованное имя → id узла. Для точного соответствия. */
  private aliasToId = new Map<string, string>();

  /** Все формы имён для нечёткого поиска. */
  private index: AliasRecord[] = [];

  /** id узла → его имена в порядке объявления; первое считается основным. */
  private idToAliases = new Map<string, string[]>();

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
    this.aliasToId.clear();
    this.index = [];
    this.idToAliases.clear();
    this.cache.clear();

    const seen = new Set<string>();

    for (const entry of entries) {
      if (!entry.id) continue;

      const names: string[] = [];
      if (entry.name) names.push(entry.name);
      if (entry.names) names.push(...entry.names);

      const displayNameOrder: string[] = [];

      for (const display of names) {
        if (!display) continue;

        const normalized = this.normalize(display);
        if (!normalized) continue;

        const key = `${entry.id}|${normalized}`;
        if (seen.has(key)) continue;
        seen.add(key);

        this.aliasToId.set(normalized, entry.id);

        const tokens = this.tokenize(normalized);
        this.index.push({
          id: entry.id,
          display,
          normalized,
          tokens,
          acronym: this.makeAcronym(tokens),
        });

        displayNameOrder.push(display);
      }

      if (displayNameOrder.length > 0) {
        this.idToAliases.set(entry.id, displayNameOrder);
      }
    }
  }

  /** Число проиндексированных форм имён. */
  get size(): number {
    return this.index.length;
  }

  /**
   * Точный поиск id по имени (с нормализацией регистра и пунктуации).
   */
  resolve(alias: string): string | null {
    return this.aliasToId.get(this.normalize(alias)) ?? null;
  }

  /** Все имена узла в порядке объявления. */
  getAliasesForId(id: string): readonly string[] {
    return this.idToAliases.get(id) ?? EMPTY;
  }

  /**
   * Основное имя узла — первое в списке алиасов.
   * Используется в пошаговых инструкциях маршрута.
   */
  getPrimaryAliasForId(id: string): string | null {
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
    const scored: SearchSuggestion[] = [];

    for (const record of this.index) {
      const score = this.scoreMatch(qNorm, qAlt, record);
      if (score > 0) {
        scored.push({ alias: record.display, id: record.id, score });
      }
    }

    scored.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.alias.length - b.alias.length;
    });

    const unique: SearchSuggestion[] = [];
    const seenDisplay = new Set<string>();
    for (const suggestion of scored) {
      if (seenDisplay.has(suggestion.alias)) continue;
      seenDisplay.add(suggestion.alias);
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

  /** Приводит имя к форме, пригодной для сравнения. */
  private normalize(s: string): string {
    return s
      .toLowerCase()
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
  private scoreMatch(qNorm: string, qAlt: string, record: AliasRecord): number {
    const scoreOne = (q: string): number => {
      if (!q) return -1;

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

      const qAcronym = this.makeAcronym(this.tokenize(q));
      if (qAcronym && record.acronym.startsWith(qAcronym)) {
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
    };

    const primary = scoreOne(qNorm);
    const swapped = qAlt && qAlt !== qNorm ? scoreOne(qAlt) : -1;

    return Math.max(primary, swapped);
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
