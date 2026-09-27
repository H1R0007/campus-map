import type { MapSize, PlanFormat, PlanSource } from '@campus-map/core';
import { heldFile, holdFile } from '../utils/planFiles';
import { rotatedPage } from './planGeometry';
import { MAX_CANVAS_SIDE } from './readers';
import type { ImportSheet } from './readers';
import type { Box } from './trim';
import { composeSvgPlan } from './vector';

/**
 * Готовый план из листа (запись 48): формат, размер и запись об исходнике.
 *
 * - Вектор (SVG, DXF) остаётся вектором: поворот и обрезка — обёрткой.
 * - PDF рисуется в PNG: у чертежа линии и надписи, в PNG они чёткие.
 * - Картинка без поворота и обрезки кладётся как есть, байт в байт.
 * - Остальные картинки пересохраняются: PNG остаётся PNG, TIFF в одну краску
 *   (чертёж) — PNG, сканы и фото — JPG.
 */

/** Длинная сторона плана из PDF, точек: деталей чертежа хватает, файл — пара мегабайт. */
export const PDF_LONG_SIDE = 4000;
/** Длинная сторона плана из DXF: единицы чертежа — метры или миллиметры, план — точки. */
export const DXF_LONG_SIDE = 3000;
/** Вектор меньше этого растягивается: точки на крошечном плане ставить неудобно. */
const MIN_VECTOR_SIDE = 1500;

export interface PlanRecipe {
  /** Поворот листа по часовой стрелке: 0, 90, 180, 270. */
  rotation: number;
  /** Область повёрнутого листа; `null` — весь лист. */
  crop: Box | null;
  /** Знаменатель масштаба чертежа: 200 для «1:200». */
  scaleRatio?: number;
}

/** Метров местности в единице листа — по масштабу чертежа; `undefined` — неизвестно. */
export function metersPerUnitOf(sheet: Pick<ImportSheet, 'unitMeters' | 'realScale'>, scaleRatio: number | undefined): number | undefined {
  if (!sheet.unitMeters) return undefined;
  if (sheet.realScale) return sheet.unitMeters;
  return scaleRatio && scaleRatio > 0 ? sheet.unitMeters * scaleRatio : undefined;
}

export interface PlanPreview {
  format: PlanFormat;
  size: MapSize;
  /** Точек плана на единицу листа. */
  scale: number;
  /** Кладётся как есть, без пересохранения. */
  asIs: boolean;
}

const EXACT_FORMATS: Record<string, PlanFormat> = { png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp' };

/** Каким получится план — до того, как его рисовать: для строки «PNG, 4000 × 2828». */
export function previewPlan(sheet: Pick<ImportSheet, 'kind' | 'size' | 'ext' | 'bilevel'>, recipe: PlanRecipe): PlanPreview {
  const area = recipe.crop ?? { x: 0, y: 0, ...rotatedPage(sheet.size, recipe.rotation).size };
  const long = Math.max(area.width, area.height);
  const sizeAt = (scale: number) => ({ width: Math.round(area.width * scale), height: Math.round(area.height * scale) });

  switch (sheet.kind) {
    case 'svg': {
      const scale = long < MIN_VECTOR_SIDE ? MIN_VECTOR_SIDE / long : 1;
      return { format: 'svg', size: sizeAt(scale), scale, asIs: false };
    }
    case 'dxf': {
      const scale = DXF_LONG_SIDE / long;
      return { format: 'svg', size: sizeAt(scale), scale, asIs: false };
    }
    case 'pdf': {
      const scale = Math.min(PDF_LONG_SIDE, MAX_CANVAS_SIDE) / long;
      return { format: 'png', size: sizeAt(scale), scale, asIs: false };
    }
    case 'image':
    case 'tiff': {
      const scale = Math.min(1, MAX_CANVAS_SIDE / long);
      const exact = EXACT_FORMATS[sheet.ext];
      const asIs = exact !== undefined && recipe.rotation === 0 && recipe.crop === null && scale === 1;
      const format: PlanFormat = asIs ? exact : sheet.ext === 'png' || sheet.bilevel ? 'png' : 'jpg';
      return { format, size: sizeAt(scale), scale, asIs };
    }
  }
}

function canvasBlob(canvas: HTMLCanvasElement, format: PlanFormat): Promise<Blob> {
  const type = format === 'jpg' ? 'image/jpeg' : `image/${format}`;
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('браузер не сохранил картинку'))), type, 0.92)
  );
}

export interface MadePlan {
  /** Ключ содержимого плана в памяти редактора. */
  key: string;
  format: PlanFormat;
  mapSize: MapSize;
  source: PlanSource;
}

/**
 * Рисует план, кладёт его и исходник в память редактора (сохранение унесёт
 * их на диск) и записывает, как план получен.
 */
export async function makePlan(sheet: ImportSheet, recipe: PlanRecipe): Promise<MadePlan> {
  const preview = previewPlan(sheet, recipe);
  let blob: Blob;
  if (preview.asIs) {
    blob = sheet.blob;
  } else if (sheet.svg !== undefined) {
    const { svg } = composeSvgPlan(sheet.svg, sheet.size, recipe.rotation, recipe.crop, preview.scale);
    blob = new Blob([svg], { type: 'image/svg+xml' });
  } else {
    blob = await canvasBlob(await sheet.render(recipe.rotation, recipe.crop, preview.scale), preview.format);
  }

  const key = await holdFile(blob);
  const sourceKey = await holdFile(sheet.blob);
  const ext = sheet.ext === 'jpeg' ? 'jpg' : sheet.ext === 'tiff' ? 'tif' : sheet.ext;
  const source: PlanSource = {
    file: `${heldFile(sourceKey)!.sha256.slice(0, 16)}.${ext}`,
    name: sheet.name,
    ...(sheet.pageCount > 1 || sheet.kind === 'pdf' ? { page: sheet.page } : {}),
    pageSize: { width: round(sheet.size.width), height: round(sheet.size.height) },
    ...(recipe.rotation !== 0 ? { rotation: recipe.rotation } : {}),
    ...(recipe.crop ? { crop: { x: round(recipe.crop.x), y: round(recipe.crop.y), width: round(recipe.crop.width), height: round(recipe.crop.height) } } : {}),
    ...(metersPerUnitOf(sheet, recipe.scaleRatio) !== undefined ? { metersPerUnit: metersPerUnitOf(sheet, recipe.scaleRatio) } : {}),
  };
  return { key, format: preview.format, mapSize: preview.size, source };
}

const round = (value: number) => Math.round(value * 100) / 100;
