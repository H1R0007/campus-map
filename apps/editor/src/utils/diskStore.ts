/**
 * Сохранение правок прямо в каталог данных репозитория.
 *
 * Работает только там, где редактор запущен из репозитория: dev-сервер
 * поднимает служебные адреса (`__campus/manifest`, `__campus/save`,
 * см. `tooling/vite-plugin-campus-data.mjs`), и правки сразу попадают в
 * `data/`, откуда их видит навигатор и забирает git. У развёрнутого редактора
 * таких адресов нет — там остаётся архив.
 */

import type { HeldFile } from './planFiles';
import type { SaveFile } from './saveFiles';

const CONTROL_URL = `${import.meta.env.BASE_URL}__campus`;

/** Отпечатки файлов данных на диск на момент чтения: путь → хеш содержимого. */
export type FileHashes = Record<string, string>;

export interface DiskManifest {
  /** Каталог данных на машине разработчика — показывается в интерфейсе. */
  dataDir: string;
  files: FileHashes;
  /** Исходники планов, которые уже лежат в `data-sources/`. */
  sources: string[];
}

export type SaveOutcome =
  | { kind: 'saved'; written: string[]; unchanged: string[]; deleted: string[]; hashes: FileHashes; sources: string[] }
  /** Файлы изменились на диске после того, как редактор их прочитал. */
  | { kind: 'conflict'; paths: string[] }
  /** Загрузка пропала до сохранения (временный каталог очищен): загрузить заново. */
  | { kind: 'missing-upload'; sha256: string }
  | { kind: 'error'; message: string };

/** Что сохранить: файлы, удаления и исходники (`utils/saveFiles.ts`). */
export interface SaveRequest {
  files: Record<string, SaveFile>;
  delete: string[];
  sources: Record<string, { upload: string }>;
}

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

    return {
      dataDir: typeof body.dataDir === 'string' ? body.dataDir : 'data',
      files: body.files,
      sources: Array.isArray(body.sources) ? body.sources.filter((name) => typeof name === 'string') : [],
    };
  } catch {
    // Нет служебных адресов — редактор просто работает без сохранения на диск.
    return null;
  }
}

/**
 * Загружает большой файл — план или исходник — до сохранения.
 *
 * @returns текст ошибки или `null`
 */
export async function uploadToDisk(file: HeldFile): Promise<string | null> {
  try {
    const response = await fetch(`${CONTROL_URL}/upload/${file.sha256}`, {
      method: 'PUT',
      headers: { 'X-Campus-Editor': '1' },
      body: file.blob,
    });
    if (response.ok) return null;
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return body.error ?? `Сервер ответил ${response.status}`;
  } catch (cause) {
    return cause instanceof Error ? cause.message : 'Сервер не ответил';
  }
}

/**
 * Пишет файлы датасета в каталог данных.
 *
 * @param request файлы, удаления и исходники
 * @param base отпечатки, с которыми редактор открыл эти файлы: если на диске
 *        что-то изменилось, сервер откажет, а не затрёт чужую правку
 */
export async function saveFilesToDisk(request: SaveRequest, base: FileHashes): Promise<SaveOutcome> {
  const payload = { ...request, base };

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
    const body = (await response.json().catch(() => ({}))) as { error?: string; missingUpload?: string };
    if (typeof body.missingUpload === 'string') return { kind: 'missing-upload', sha256: body.missingUpload };
    return { kind: 'error', message: body.error ?? `Сервер ответил ${response.status}` };
  }

  const body = (await response.json()) as {
    written?: string[];
    unchanged?: string[];
    deleted?: string[];
    hashes?: FileHashes;
    sources?: string[];
  };
  return {
    kind: 'saved',
    written: body.written ?? [],
    unchanged: body.unchanged ?? [],
    deleted: body.deleted ?? [],
    hashes: body.hashes ?? {},
    sources: body.sources ?? [],
  };
}
