import { SPACE } from '../config/space';

/**
 * Маршруты, которые человек проложил в «Проверке» (запись 67): «Готовность
 * карты» просит проверить пару маршрутов глазами, и редактор помнит, что это
 * сделано. Помнит браузер — это отметка работы, а не данные; у учебной копии
 * своя.
 */

const KEY = `campus-editor:route-checks:${SPACE}`;

/** Сколько последних маршрутов помнить. */
const LIMIT = 20;

export const routeKey = (from: string, to: string): string => `${from}→${to}`;

export function readRouteChecks(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(-LIMIT) : [];
  } catch {
    return [];
  }
}

/** Добавляет маршрут в конец списка; возвращает новый список. */
export function rememberRouteCheck(list: readonly string[], key: string): string[] {
  const next = [...list.filter((item) => item !== key), key].slice(-LIMIT);
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
  } catch {
    // Не запомнили — отметка пропадёт после перезагрузки, работе это не мешает.
  }
  return next;
}
