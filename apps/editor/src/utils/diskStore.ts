/**
 * Сохранение правок прямо в каталог данных репозитория.
 *
 * Работает только там, где редактор запущен из репозитория: dev-сервер
 * поднимает служебные адреса (`__campus/manifest`, `__campus/save`,
 * см. `tooling/vite-plugin-campus-data.mjs`), и правки сразу попадают в
 * `data/`, откуда их видит навигатор и забирает git. У развёрнутого редактора
 * таких адресов нет — там остаётся архив.
 *
 * В учебной копии (запись 55) те же запросы идут по её адресам
 * (`config/space.ts`) и пишут в копию.
 */

import { CONTROL_URL, SANDBOX_CONTROL_URL } from '../config/space';
import type { HeldFile } from './planFiles';
import type { SaveFile } from './saveFiles';

/** Отпечатки файлов данных на диск на момент чтения: путь → хеш содержимого. */
export type FileHashes = Record<string, string>;

export interface DiskManifest {
  /** Каталог данных на машине разработчика — показывается в интерфейсе. */
  dataDir: string;
  files: FileHashes;
  /** Исходники планов, которые уже лежат в `data-sources/`. */
  sources: string[];
  /** Файлы фото, которые есть: в данных и в общей папке фото (запись 87). */
  photos: string[];
  /** Общая папка фото этого каталога данных; `null` — не настроена, фото ложатся в `data/photos/`. */
  photosDir: string | null;
}

export type SaveOutcome =
  | {
      kind: 'saved';
      written: string[];
      unchanged: string[];
      deleted: string[];
      hashes: FileHashes;
      sources: string[];
      /** Фото, заменённые размытием, которые сервер убрал из общей папки (запись 88). */
      forgotten: string[];
    }
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
  /** Фото, заменённые размытием: убрать из общей папки, если на них никто не ссылается. */
  forgetPhotos?: string[];
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
      photos: Array.isArray(body.photos) ? body.photos.filter((name) => typeof name === 'string') : [],
      photosDir: typeof body.photosDir === 'string' ? body.photosDir : null,
    };
  } catch {
    // Нет служебных адресов — редактор просто работает без сохранения на диск.
    return null;
  }
}

/** Учебная копия: есть ли она и когда создана (миллисекунды). */
export interface SandboxState {
  exists: boolean;
  createdAt: number | null;
}

/**
 * Состояние учебной копии.
 *
 * @returns `null`, если копии здесь не бывает: редактор открыт не из репозитория
 */
export async function fetchSandboxState(): Promise<SandboxState | null> {
  try {
    const response = await fetch(`${SANDBOX_CONTROL_URL}/state`, { cache: 'no-store' });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<SandboxState>;
    return { exists: body.exists === true, createdAt: typeof body.createdAt === 'number' ? body.createdAt : null };
  } catch {
    return null;
  }
}

/**
 * Делает свежую учебную копию настоящих данных; прежние пробы пропадают.
 *
 * @returns текст ошибки или `null`
 */
export async function resetSandbox(): Promise<string | null> {
  try {
    const response = await fetch(`${SANDBOX_CONTROL_URL}/reset`, { method: 'POST', headers: { 'X-Campus-Editor': '1' } });
    if (response.ok) return null;
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return body.error ?? `Сервер ответил ${response.status}`;
  } catch (cause) {
    return cause instanceof Error ? cause.message : 'Сервер не ответил';
  }
}

/**
 * Исходник плана из `data-sources/` — чтобы переделать план.
 *
 * @returns `null`, если исходника на этой машине нет или редактор открыт не из репозитория
 */
export async function fetchSourceFile(name: string): Promise<Blob | null> {
  try {
    const response = await fetch(`${CONTROL_URL}/sources/${name}`, { headers: { 'X-Campus-Editor': '1' } });
    return response.ok ? await response.blob() : null;
  } catch {
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
    forgotten?: string[];
  };
  return {
    kind: 'saved',
    written: body.written ?? [],
    unchanged: body.unchanged ?? [],
    deleted: body.deleted ?? [],
    hashes: body.hashes ?? {},
    sources: body.sources ?? [],
    forgotten: body.forgotten ?? [],
  };
}
