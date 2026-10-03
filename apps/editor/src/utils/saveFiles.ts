import type { Dataset } from '@campus-map/core';
import { PHOTOS_DIR, photoPath } from '@campus-map/core';
import { datasetFiles } from './datasetFiles';
import { diskPathOf, heldFile, heldFiles, heldPhotoFile, planTargets } from './planFiles';
import type { HeldFile } from './planFiles';

/**
 * Что сделать с файлами при сохранении (запись 47).
 *
 * Данные редактора — это файлы JSON (`datasetFiles`) и планы: у каждого плана
 * в сторе отпечаток содержимого, а путь файла задают корпус, этаж и формат.
 * План, который уже лежит где надо, не трогается; импортированный
 * загружается; переехавший (этаж сменил номер) копируется со старого места.
 * Файлы, которые редактор знал при открытии и которых в данных больше нет,
 * удаляются, — но только такие: файл, который загрузчик не понял и поэтому не
 * показал, от сохранения не исчезнет.
 */

export type SaveFile = { text: string } | { upload: string } | { copy: string };

export interface SavePlan {
  /** Путь внутри `data/` → что записать. Нетронутые планы сюда не входят. */
  files: Record<string, SaveFile>;
  /** Файлы данных, которые больше не нужны. */
  delete: string[];
  /** Исходники, которых нет на диске: имя → загрузка. */
  sources: Record<string, { upload: string }>;
  /** Что загрузить до сохранения — по одному файлу. */
  uploads: HeldFile[];
  /** Все файлы, из которых теперь состоят данные: после сохранения — известные редактору. */
  produced: string[];
  /** Планы, содержимого которых нет ни в памяти, ни на диске: сохранять нельзя. */
  lost: string[];
  /**
   * Фото, которых нет ни в памяти, ни на диске, ни в общей папке (запись 87):
   * добавлены на другой машине, а папка ещё не синхронизировалась. Сохранять
   * можно — данные целы, а фото придёт с синхронизацией.
   */
  missingPhotos: string[];
  /**
   * Фото, которые заменило размытое (запись 88) и на которые больше никто не
   * ссылается, — полные имена. Сервер уберёт их и маленькие копии из общей
   * папки фото, если и после записи на них не ссылается ни одна точка.
   */
  forgetPhotos: string[];
}

export interface SaveInput {
  dataset: Dataset;
  planFiles: ReadonlyMap<string, string>;
  /** Отпечатки файлов на диске: путь → SHA-1. */
  diskHashes: Record<string, string>;
  /** Исходники, которые уже лежат в `data-sources/`. */
  diskSources: ReadonlySet<string>;
  /** Файлы, которые редактор знает: открыл или сам сохранил. */
  owned: ReadonlySet<string>;
  /** Файлы фото, которые есть в данных и в общей папке фото. */
  diskPhotos?: ReadonlySet<string>;
}

/** Исходник в памяти редактора по имени: первые 16 знаков SHA-256 и расширение. */
export function heldSource(name: string): HeldFile | undefined {
  const prefix = name.split('.')[0];
  return prefix.length === 16 ? heldFiles().find((file) => file.sha256.startsWith(prefix)) : undefined;
}

/** Исходники, на которые ссылаются планы и фото точек данных. */
export function referencedSources(dataset: Dataset): string[] {
  const names = new Set<string>();
  if (dataset.campusMeta.source) names.add(dataset.campusMeta.source.file);
  for (const building of dataset.buildingMetas) {
    for (const floor of building.floors) if (floor.source) names.add(floor.source.file);
  }
  // Исходный снимок фото — тоже исходник: лежит у разработчика (запись 87).
  for (const node of dataset.nodes) for (const photo of node.photos ?? []) if (photo.source) names.add(photo.source);
  return [...names];
}

/** Файлы фото, на которые ссылаются точки: полные и маленькие, имена в каталоге фото. */
export function referencedPhotoFiles(dataset: Dataset): string[] {
  const names = new Set<string>();
  for (const node of dataset.nodes) {
    for (const photo of node.photos ?? []) {
      for (const size of ['full', 'small'] as const) names.add(photoPath(photo.file, size).slice(PHOTOS_DIR.length + 1));
    }
  }
  return [...names];
}

export function planSave({ dataset, planFiles, diskHashes, diskSources, owned, diskPhotos = new Set() }: SaveInput): SavePlan {
  const files: Record<string, SaveFile> = {};
  const uploads = new Map<string, HeldFile>();
  const produced: string[] = [];
  const lost: string[] = [];

  for (const [path, text] of datasetFiles(dataset)) {
    files[path] = { text };
    produced.push(path);
  }

  for (const { scope, path } of planTargets(dataset.campusMeta, dataset.buildingMetas)) {
    const key = planFiles.get(scope);
    if (key === undefined) continue;
    produced.push(path);

    // План уже лежит где надо — трогать нечего.
    if (key === `data:${path}` || (diskHashes[path] !== undefined && key === `sha1:${diskHashes[path]}`)) continue;

    const held = heldFile(key);
    if (held) {
      uploads.set(held.sha256, held);
      files[path] = { upload: held.sha256 };
      continue;
    }
    const from = diskPathOf(key, diskHashes);
    if (from !== null) files[path] = { copy: from };
    else lost.push(path);
  }

  // Фото точек (запись 87): имя — отпечаток, поэтому лежащее где-то — то же
  // самое; загружается только то, чего нет ни в данных, ни в общей папке.
  const missingPhotos: string[] = [];
  const referenced = referencedPhotoFiles(dataset);
  const replaced = new Set<string>();
  for (const name of referenced) {
    const path = `${PHOTOS_DIR}/${name}`;
    produced.push(path);
    const held = heldPhotoFile(name);
    for (const old of held?.replaces ?? []) replaced.add(old);
    if (diskHashes[path] !== undefined || diskPhotos.has(name)) continue;
    if (held) {
      uploads.set(held.sha256, held);
      files[path] = { upload: held.sha256 };
    } else {
      missingPhotos.push(name);
    }
  }
  // Заменённое размытием и на диске: на него больше никто не ссылается —
  // отменённое размытие вернуло бы ссылку, и такое фото не трогается.
  const stillReferenced = new Set(referenced);
  const forgetPhotos = [...replaced].filter((name) => !stillReferenced.has(name) && diskPhotos.has(name)).sort();

  const sources: Record<string, { upload: string }> = {};
  for (const name of referencedSources(dataset)) {
    if (diskSources.has(name)) continue;
    // Исходника нет ни на диске, ни в памяти — например, план переделывали
    // на другой машине. Сохранению это не мешает: план в данных цел.
    const held = heldSource(name);
    if (!held) continue;
    uploads.set(held.sha256, held);
    sources[name] = { upload: held.sha256 };
  }

  const producedSet = new Set(produced);
  const deletions = [...owned].filter((path) => !producedSet.has(path) && diskHashes[path] !== undefined).sort();

  return { files, delete: deletions, sources, uploads: [...uploads.values()], produced, lost, missingPhotos, forgetPhotos };
}

/** Файл плана, а не JSON: его содержимое редактор не соберёт заново. */
export function isPlanFile(path: string): boolean {
  return /(^|\/)map\.[a-z]+$/.test(path);
}
