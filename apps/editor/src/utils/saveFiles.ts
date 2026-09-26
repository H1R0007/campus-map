import type { Dataset } from '@campus-map/core';
import { datasetFiles } from './datasetFiles';
import { diskPathOf, heldFile, heldFiles, planTargets } from './planFiles';
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
}

/** Исходник в памяти редактора по имени: первые 16 знаков SHA-256 и расширение. */
export function heldSource(name: string): HeldFile | undefined {
  const prefix = name.split('.')[0];
  return prefix.length === 16 ? heldFiles().find((file) => file.sha256.startsWith(prefix)) : undefined;
}

/** Исходники, на которые ссылаются планы данных. */
export function referencedSources(dataset: Dataset): string[] {
  const names = new Set<string>();
  if (dataset.campusMeta.source) names.add(dataset.campusMeta.source.file);
  for (const building of dataset.buildingMetas) {
    for (const floor of building.floors) if (floor.source) names.add(floor.source.file);
  }
  return [...names];
}

export function planSave({ dataset, planFiles, diskHashes, diskSources, owned }: SaveInput): SavePlan {
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

  return { files, delete: deletions, sources, uploads: [...uploads.values()], produced, lost };
}

/** Файл плана, а не JSON: его содержимое редактор не соберёт заново. */
export function isPlanFile(path: string): boolean {
  return /(^|\/)map\.[a-z]+$/.test(path);
}
