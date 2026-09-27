import { useMemo } from 'react';
import { DATA_BASE_URL } from '../config/dataBase';
import { useEditorStore } from '../stores/editorStore';
import { planScopeKey, planUrlOf } from '../utils/planFiles';

/**
 * Адрес плана территории или этажа (запись 47).
 *
 * Импортированный, но не сохранённый план показывается из памяти редактора,
 * сохранённый — с диска, где бы он теперь ни лежал: стор помнит отпечаток
 * содержимого, а не путь.
 *
 * @returns `url: null`, если у плана нет файла; `key` — отпечаток содержимого:
 *          он меняется, только когда меняется сам план
 */
export function usePlanUrl(building: string | null, floor: number | null): { url: string | null; key: string | undefined } {
  const key = useEditorStore((s) => s.planFiles.get(planScopeKey(building, floor)));
  const diskHashes = useEditorStore((s) => s.diskHashes);
  const url = useMemo(() => planUrlOf(key, diskHashes, DATA_BASE_URL), [key, diskHashes]);
  return { url, key };
}

/**
 * Пустое поле нужного размера — для плана без файла: светлый лист с
 * пунктирной рамкой, чтобы было видно, куда встают точки.
 */
export function blankPlanUrl(size: { width: number; height: number } | undefined): string {
  const width = size?.width ?? 1200;
  const height = size?.height ?? 800;
  const dash = Math.max(width, height) / 60;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect width="${width}" height="${height}" fill="#e2e8f0" fill-opacity="0.12" stroke="#94a3b8" stroke-width="${dash / 4}" stroke-dasharray="${dash} ${dash / 2}"/></svg>`
  )}`;
}
