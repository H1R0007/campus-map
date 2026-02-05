import type { AliasEntry, SearchSuggestion } from '../types/alias';

interface AliasesJson {
  aliases: AliasEntry[];
}

interface AliasRecord {
  id: string;
  display: string;
  normalized: string;
  tokens: string[];
  acronym: string;
}

export class AliasManager {
  private aliasToId = new Map<string, string>();
  private index: AliasRecord[] = [];

  // NEW: id -> display aliases
  private idToAliases = new Map<string, string[]>();

  private cache = new Map<string, { results: SearchSuggestion[]; timestamp: number }>();
  private readonly CACHE_TTL_MS = 400;
  private readonly CACHE_MAX_SIZE = 128;

  load(json: AliasesJson): void {
    this.aliasToId.clear();
    this.index = [];
    this.idToAliases.clear();
    this.cache.clear();

    if (!json.aliases || !Array.isArray(json.aliases)) {
      console.warn('AliasManager.load: invalid structure');
      return;
    }

    const seen = new Set<string>();

    for (const entry of json.aliases) {
      if (!entry.id) continue;

      const names: string[] = [];
      if (entry.name) names.push(entry.name);
      if (entry.names) names.push(...entry.names);

      for (const display of names) {
        if (!display) continue;

        const normalized = this.normalize(display);
        if (!normalized) continue;

        const key = `${entry.id}|${normalized}`;
        if (seen.has(key)) continue;
        seen.add(key);

        this.aliasToId.set(normalized, entry.id);

        const tokens = this.tokenize(normalized);
        const acronym = this.makeAcronym(tokens);

        this.index.push({
          id: entry.id,
          display,
          normalized,
          tokens,
          acronym,
        });

        const prev = this.idToAliases.get(entry.id) ?? [];
        if (!prev.includes(display)) {
          prev.push(display);
          this.idToAliases.set(entry.id, prev);
        }
      }
    }

    console.log(`AliasManager: loaded ${this.index.length} aliases`);
  }

  resolve(alias: string): string | null {
    const normalized = this.normalize(alias);
    return this.aliasToId.get(normalized) ?? null;
  }

  // NEW: взять “главный” алиас по nodeId (для UI/инструкций)
  getPrimaryAliasForId(id: string): string | null {
    const list = this.idToAliases.get(id);
    if (!list || list.length === 0) return null;
    return list[0];
  }

  suggest(query: string, limit: number = 5): SearchSuggestion[] {
    if (!query.trim()) return [];

    const cached = this.cache.get(query);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.results.slice(0, limit);
    }

    const qNorm = this.normalize(query);
    if (!qNorm) return [];

    const qAlt = this.normalize(this.swapKeyboardLayout(query));

    const scored: SearchSuggestion[] = [];

    for (const record of this.index) {
      const score = this.scoreMatch(qNorm, qAlt, record);
      if (score > 0) {
        scored.push({
          alias: record.display,
          id: record.id,
          score,
        });
      }
    }

    scored.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.alias.length - b.alias.length;
    });

    const unique: SearchSuggestion[] = [];
    const seenDisplay = new Set<string>();
    for (const s of scored) {
      if (!seenDisplay.has(s.alias)) {
        seenDisplay.add(s.alias);
        unique.push(s);
        if (unique.length >= limit) break;
      }
    }

    if (this.cache.size > this.CACHE_MAX_SIZE) {
      this.cache.clear();
    }
    this.cache.set(query, { results: unique, timestamp: Date.now() });

    return unique;
  }

  private normalize(s: string): string {
    return s
      .toLowerCase()
      .replace(/[_\-\/\\]/g, ' ')
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

  private swapKeyboardLayout(s: string): string {
    const map: Record<string, string> = {
      q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з',
      '[': 'х', ']': 'ъ',
      a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л', l: 'д',
      ';': 'ж', "'": 'э',
      z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь',
      ',': 'б', '.': 'ю', '`': 'ё',
    };

    return s
      .split('')
      .map((c) => map[c.toLowerCase()] ?? c)
      .join('');
  }

  private scoreMatch(qNorm: string, qAlt: string, record: AliasRecord): number {
    const scoreOne = (q: string): number => {
      if (!q) return -1;

      if (q === record.normalized) return 100000;

      if (record.normalized.startsWith(q)) {
        return 90000 - (record.normalized.length - q.length);
      }

      for (const token of record.tokens) {
        if (token.startsWith(q)) {
          return 85000 - record.display.length;
        }
      }

      const pos = record.normalized.indexOf(q);
      if (pos !== -1) {
        return 80000 - pos * 2 - record.display.length;
      }

      const qAcronym = this.makeAcronym(this.tokenize(q));
      if (qAcronym && record.acronym.startsWith(qAcronym)) {
        return 78000 - record.acronym.length;
      }

      if (this.isSubsequence(q, record.normalized)) {
        return 70000 - record.display.length;
      }

      if (q.length <= 5) {
        for (const token of record.tokens) {
          const dist = this.levenshtein(q, token, 2);
          if (dist <= 2) {
            return 65000 - dist * 200 - record.display.length;
          }
        }
      }

      return -1;
    };

    const s1 = scoreOne(qNorm);
    const s2 = qAlt && qAlt !== qNorm ? scoreOne(qAlt) : -1;

    return Math.max(s1, s2);
  }

  private isSubsequence(sub: string, str: string): boolean {
    let i = 0;
    let j = 0;
    while (i < sub.length && j < str.length) {
      if (sub[i] === str[j]) i++;
      j++;
    }
    return i === sub.length;
  }

  private levenshtein(a: string, b: string, cutoff: number): number {
    const n = a.length;
    const m = b.length;

    if (Math.abs(n - m) > cutoff) return cutoff + 1;

    let prev = Array.from({ length: m + 1 }, (_, i) => i);
    let curr = new Array(m + 1);

    for (let i = 1; i <= n; i++) {
      curr[0] = i;
      let minInRow = curr[0];

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