import type { MapSize, PlanSource } from '@campus-map/core';
import { pageToPlan, scaleOf } from './planGeometry';

/**
 * Масштаб чертежа (запись 54): сколько метров на местности в пикселе плана.
 *
 * - PDF — лист в пунктах бумаги (1/72 дюйма); надпись «Масштаб 1:200»
 *   переводит пункт в метры местности.
 * - TIFF — скан с разрешением (точек на дюйм) и та же надпись, если её
 *   впишет человек: текста у скана нет.
 * - DXF — чертёж в натуральную величину, единицы — из заголовка
 *   (`$INSUNITS`): миллиметры, сантиметры, метры.
 */

/** Метров в пункте PDF: 1/72 дюйма. */
export const PDF_POINT_METERS = 0.0254 / 72;

/** Единицы DXF (`$INSUNITS`) в метрах. */
const DXF_UNITS: Record<number, number> = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1, 14: 0.1 };

export function dxfUnitMeters(insunits: unknown): number | undefined {
  return typeof insunits === 'number' ? DXF_UNITS[insunits] : undefined;
}

/** Метров в пикселе скана по разрешению TIFF: точек на дюйм или на сантиметр. */
export function tiffPixelMeters(resolution: number | undefined, unit: number | undefined): number | undefined {
  if (!resolution || !(resolution > 0)) return undefined;
  if (unit === 3) return 0.01 / resolution;
  if (unit === 1) return undefined; // без единиц — только соотношение сторон
  return 0.0254 / resolution;
}

/**
 * Масштаб чертежа по надписи на листе: «Масштаб 1:200», «М 1:500», «1 : 100».
 *
 * @returns знаменатель и надпись, по которой он найден, или `null`
 */
export function drawingScaleFrom(texts: readonly string[]): { ratio: number; text: string } | null {
  const candidates: { ratio: number; text: string; strong: boolean }[] = [];
  for (const raw of texts) {
    const text = raw.replace(/\s+/g, ' ');
    for (const match of text.matchAll(/(масштаб|м\.?)?\s*1\s*[:：]\s*(\d{2,5})(?![\d.,])/gi)) {
      const ratio = Number(match[2]);
      if (ratio < 10 || ratio > 10000) continue;
      candidates.push({ ratio, text: match[0].trim(), strong: Boolean(match[1]) });
    }
  }
  const strong = candidates.find((candidate) => candidate.strong);
  if (strong) return { ratio: strong.ratio, text: strong.text };
  // Одно «1:200» без слова «масштаб» — ещё масштаб; несколько разных — не угадать.
  const ratios = new Set(candidates.map((candidate) => candidate.ratio));
  return ratios.size === 1 ? { ratio: candidates[0].ratio, text: candidates[0].text } : null;
}

/** Метров местности в пикселе плана — по записи об исходнике; `null`, если масштаб чертежа неизвестен. */
export function planMetersPerPixel(meta: { source?: PlanSource; mapSize?: MapSize } | undefined): number | null {
  const source = meta?.source;
  if (!source?.metersPerUnit || !meta?.mapSize) return null;
  return source.metersPerUnit / scaleOf(pageToPlan(source, meta.mapSize));
}
