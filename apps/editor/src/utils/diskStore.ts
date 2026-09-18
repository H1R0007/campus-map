/**
 * Сохранение правок прямо в каталог данных репозитория.
 *
 * Работает только там, где редактор запущен из репозитория: dev-сервер
 * поднимает служебные адреса (`__campus/manifest`, `__campus/save`,
 * см. `tooling/vite-plugin-campus-data.mjs`), и правки сразу попадают в
 * `data/`, откуда их видит навигатор и забирает git. У развёрнутого редактора
 * таких адресов нет — там остаётся архив.
 */

const CONTROL_URL = `${import.meta.env.BASE_URL}__campus`;

/** Отпечатки файлов данных на диск на момент чтения: путь → хеш содержимого. */
export type FileHashes = Record<string, string>;

export interface DiskManifest {
  /** Каталог данных на машине разработчика — показывается в интерфейсе. */
  dataDir: string;
  files: FileHashes;
}

export type SaveOutcome =
  | { kind: 'saved'; written: string[]; unchanged: string[]; hashes: FileHashes }
  /** Файлы изменились на диске после того, как редактор их прочитал. */
  | { kind: 'conflict'; paths: string[] }
  | { kind: 'error'; message: string };

/**
 * Проверяет, можно ли сохранять в каталог данных, и читает отпечатки файлов.
 *
 * @returns `null`, если сохранение недоступно (редактор открыт не из
 *          репозитория) — интерфейс тогда предлагает только архив.
 */
export async function fetchDiskManifest(): Promise<DiskManifest | null> {
  try {
    const response = await fetch(`${CONTROL_URL}/manifest`, { headers: { 'X-Campus-Editor': '1' } });
    if (!response.ok) return null;

    const body = (await response.json()) as Partial<DiskManifest> & { writable?: boolean };
    if (body.writable !== true || typeof body.files !== 'object' || body.files === null) return null;

    return { dataDir: typeof body.dataDir === 'string' ? body.dataDir : 'data', files: body.files };
  } catch {
    // Нет служебных адресов — редактор просто работает без сохранения на диск.
    return null;
  }
}

/**
 * Пишет файлы датасета в каталог данных.
 *
 * @param files путь внутри `data/` → содержимое
 * @param base отпечатки, с которыми редактор открыл эти файлы: если на диске
 *        что-то изменилось, сервер откажет, а не затрёт чужую правку
 */
export async function saveFilesToDisk(files: Map<string, string>, base: FileHashes): Promise<SaveOutcome> {
  const payload = {
    files: Object.fromEntries([...files].map(([path, text]) => [path, { text }])),
    base,
  };

  let response: Response;
  try {
    response = await fetch(`${CONTROL_URL}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Campus-Editor': '1' },
      body: JSON.stringify(payload),
    });
  } catch (cause) {
    return { kind: 'error', message: cause instanceof Error ? cause.message : 'Сервер не ответил' };
  }

  if (response.status === 409) {
    const body = (await response.json()) as { conflicts?: { path: string }[] };
    return { kind: 'conflict', paths: (body.conflicts ?? []).map((conflict) => conflict.path) };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return { kind: 'error', message: body.error ?? `Сервер ответил ${response.status}` };
  }

  const body = (await response.json()) as { written?: string[]; unchanged?: string[]; hashes?: FileHashes };
  return {
    kind: 'saved',
    written: body.written ?? [],
    unchanged: body.unchanged ?? [],
    hashes: body.hashes ?? {},
  };
}
