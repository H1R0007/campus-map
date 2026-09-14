/**
 * Недавние места: что человек выбирал в поиске — на этом устройстве.
 *
 * Хранятся id узлов, а не названия: название зависит от языка и может
 * смениться при переразметке, а id — нет. Узел, которого больше нет в данных,
 * при показе пропускается (`recentPlaces` в интерфейсе), а не падает.
 */

/** Сколько мест помнить: больше в пустом поиске на телефоне без прокрутки не видно. */
export const RECENT_LIMIT = 5;

/**
 * Список после выбора места: оно — первым, повтор поднимается наверх, а не
 * дублируется, лишнее отбрасывается с конца.
 */
export function withRecent(list: readonly string[], nodeId: string, limit: number = RECENT_LIMIT): string[] {
  return [nodeId, ...list.filter((id) => id !== nodeId)].slice(0, limit);
}

/**
 * Разбор сохранённого списка.
 *
 * Хранилище браузера — не данные кампуса, и доверять ему нельзя: его мог
 * записать прежний формат, другое приложение на том же адресе или человек в
 * инструментах разработчика. Всё, что не список строк, — пустой список:
 * потерять недавние места лучше, чем уронить поиск.
 */
export function parseRecent(raw: string | null, limit: number = RECENT_LIMIT): string[] {
  if (raw === null) return [];

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    // Не JSON — см. выше: такой список не читается, а не роняет поиск.
    return [];
  }

  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0).slice(0, limit);
}
