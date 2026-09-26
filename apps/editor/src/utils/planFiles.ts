import { campusMapPath, datasetUrl, floorMapPath, planFormatOf } from '@campus-map/core';
import type { BuildingMeta, CampusMeta } from '@campus-map/core';

/**
 * Где лежат байты планов (запись 47).
 *
 * Стор помнит у каждого плана не путь к файлу, а отпечаток содержимого
 * (`planFiles`: территория или этаж → ключ). Путь меняется — этаж получил
 * другой номер, план сменил формат, — а содержимое то же. По отпечатку план
 * находится и на диске (манифест каталога данных), и в памяти редактора, если
 * его только что импортировали и ещё не сохранили. Отмена после сохранения
 * поэтому не теряет план: он лежит на диске под новым путём, и отпечаток
 * приводит к нему.
 *
 * Ключ содержимого:
 * - `sha1:<hex>` — содержимое известно по отпечатку SHA-1 (тот же, что в
 *   манифесте каталога данных);
 * - `data:<путь>` — файл в данных, каким он был при открытии. Так бывает,
 *   когда редактор открыт не из репозитория и манифеста нет.
 */

/** Ключ плана территории в `planFiles`. */
export const CAMPUS_PLAN = 'campus';

/** Ключ плана в `planFiles`: территория или этаж корпуса. */
export function planScopeKey(building: string | null, floor: number | null): string {
  return building === null ? CAMPUS_PLAN : `${building}/${floor}`;
}

/** Путь плана в каталоге данных — по формату из метаданных. */
export function planPath(building: string | null, floor: number | null, meta: { planFormat?: CampusMeta['planFormat'] } | undefined) {
  return building === null ? campusMapPath(planFormatOf(meta)) : floorMapPath(building, floor ?? 0, planFormatOf(meta));
}

/** Все планы датасета: ключ в `planFiles` и путь файла. */
export function planTargets(
  campusMeta: CampusMeta | null,
  buildingMetas: Iterable<BuildingMeta>
): { scope: string; path: string }[] {
  const targets = [{ scope: CAMPUS_PLAN, path: planPath(null, null, campusMeta ?? undefined) }];
  for (const building of buildingMetas) {
    for (const floor of building.floors) {
      targets.push({ scope: planScopeKey(building.id, floor.floor), path: planPath(building.id, floor.floor, floor) });
    }
  }
  return targets;
}

/** Планы, как они лежат в данных при открытии: у каждого — ключ `data:<путь>`. */
export function loadedPlanFiles(campusMeta: CampusMeta | null, buildingMetas: Iterable<BuildingMeta>): Map<string, string> {
  return new Map(planTargets(campusMeta, buildingMetas).map(({ scope, path }) => [scope, `data:${path}`]));
}

/**
 * Переводит ключи `data:<путь>` в отпечатки по манифесту диска.
 *
 * Плана, которого на диске нет, у этажа нет и в сторе: карта скажет «нет
 * плана» и предложит его добавить, а не покажет пустоту.
 */
export function planFilesByHash(planFiles: ReadonlyMap<string, string>, diskHashes: Record<string, string>): Map<string, string> {
  const result = new Map<string, string>();
  for (const [scope, key] of planFiles) {
    if (!key.startsWith('data:')) {
      result.set(scope, key);
      continue;
    }
    const hash = diskHashes[key.slice('data:'.length)];
    if (hash) result.set(scope, `sha1:${hash}`);
  }
  return result;
}

/** Файл в памяти редактора: ещё не на диске или уже удалён с него. */
export interface HeldFile {
  blob: Blob;
  sha1: string;
  sha256: string;
}

/**
 * Байты, которых нет на диске: импортированные планы и исходники до
 * сохранения и планы, удалённые сохранением (отмена удаления вернёт их).
 *
 * Не в сторе: в состоянии immer место данным, а не мегабайтам. Здесь только
 * добавляется — отпечаток однозначно называет содержимое, и запись истории,
 * которая на него ссылается, всегда его найдёт.
 */
const held = new Map<string, HeldFile>();
const objectUrls = new Map<string, string>();

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Отпечатки содержимого: SHA-1 — для манифеста, SHA-256 — для загрузки на диск. */
export async function digestOf(blob: Blob): Promise<{ sha1: string; sha256: string }> {
  const bytes = await blob.arrayBuffer();
  const [sha1, sha256] = await Promise.all([crypto.subtle.digest('SHA-1', bytes), crypto.subtle.digest('SHA-256', bytes)]);
  return { sha1: hex(sha1), sha256: hex(sha256) };
}

/** Кладёт файл в память редактора и возвращает ключ его содержимого. */
export async function holdFile(blob: Blob): Promise<string> {
  const { sha1, sha256 } = await digestOf(blob);
  if (!held.has(sha1)) held.set(sha1, { blob, sha1, sha256 });
  return `sha1:${sha1}`;
}

/** Файл из памяти редактора по ключу содержимого. */
export function heldFile(key: string): HeldFile | undefined {
  return key.startsWith('sha1:') ? held.get(key.slice('sha1:'.length)) : undefined;
}

/** Всё, что лежит в памяти, — для черновика. */
export function heldFiles(): HeldFile[] {
  return [...held.values()];
}

/** Возвращает файлы из черновика в память. */
export function restoreHeldFiles(files: readonly HeldFile[]): void {
  for (const file of files) if (!held.has(file.sha1)) held.set(file.sha1, file);
}

/** Забывает всё — только для тестов. */
export function forgetHeldFiles(): void {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
  held.clear();
}

/** Путь на диске, где лежит содержимое с этим ключом, или `null`. */
export function diskPathOf(key: string, diskHashes: Record<string, string>): string | null {
  if (key.startsWith('data:')) return key.slice('data:'.length);
  if (!key.startsWith('sha1:')) return null;
  const hash = key.slice('sha1:'.length);
  for (const [path, value] of Object.entries(diskHashes)) {
    if (value === hash && path !== '') return path;
  }
  return null;
}

/**
 * Адрес, по которому карта покажет план.
 *
 * Файл в памяти показывается из памяти: так карта видит импортированный план
 * сразу, до сохранения.
 *
 * @returns `null`, если содержимого нет ни в памяти, ни на диске
 */
export function planUrlOf(key: string | undefined, diskHashes: Record<string, string>, baseUrl: string): string | null {
  if (key === undefined) return null;

  const file = heldFile(key);
  if (file) {
    let url = objectUrls.get(file.sha1);
    if (!url) {
      url = URL.createObjectURL(file.blob);
      objectUrls.set(file.sha1, url);
    }
    return url;
  }

  const path = diskPathOf(key, diskHashes);
  return path === null ? null : datasetUrl(path, baseUrl);
}
