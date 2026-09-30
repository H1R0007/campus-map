import type { MapSize, PlanSource } from '@campus-map/core';

/**
 * Геометрия плана: как точка страницы исходника становится пикселем плана в
 * данных — и обратно (запись 46).
 *
 * План получается из страницы поворотом, обрезкой и масштабом, то есть
 * подобием: сдвиг, поворот, равномерный масштаб. Поэтому переделка плана из
 * того же исходника — другая обрезка, поворот, размер — пересчитывает точки
 * разметки точно: старый пиксель → точка страницы → новый пиксель.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Подобие на плоскости с осью y вниз, как у картинок:
 *
 *     x' = a·x − b·y + tx
 *     y' = b·x + a·y + ty
 *
 * `a = s·cos θ`, `b = s·sin θ`: поворот на θ по часовой стрелке (на экране) и
 * масштаб `s`.
 */
export interface Similarity {
  a: number;
  b: number;
  tx: number;
  ty: number;
}

export const IDENTITY: Similarity = { a: 1, b: 0, tx: 0, ty: 0 };

export function applySimilarity(t: Similarity, p: Point): Point {
  return { x: t.a * p.x - t.b * p.y + t.tx, y: t.b * p.x + t.a * p.y + t.ty };
}

/** Сначала `first`, потом `second`. */
export function composeSimilarity(second: Similarity, first: Similarity): Similarity {
  const translated = applySimilarity(second, { x: first.tx, y: first.ty });
  return {
    a: second.a * first.a - second.b * first.b,
    b: second.a * first.b + second.b * first.a,
    tx: translated.x,
    ty: translated.y,
  };
}

export function invertSimilarity(t: Similarity): Similarity {
  const det = t.a * t.a + t.b * t.b;
  if (det === 0) throw new Error('Вырожденное подобие: масштаб ноль');
  const a = t.a / det;
  const b = -t.b / det;
  return { a, b, tx: -(a * t.tx - b * t.ty), ty: -(b * t.tx + a * t.ty) };
}

/** Масштаб подобия. */
export function scaleOf(t: Similarity): number {
  return Math.hypot(t.a, t.b);
}

/** Поворот подобия, градусы по часовой стрелке, в [−180, 180). */
export function rotationOf(t: Similarity): number {
  const degrees = (Math.atan2(t.b, t.a) * 180) / Math.PI;
  return ((degrees + 540) % 360) - 180;
}

/** Размер и сдвиг повёрнутой страницы: её описанный прямоугольник. */
export function rotatedPage(pageSize: MapSize, rotation: number): { size: MapSize; turn: Similarity } {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  // Поворот вокруг начала координат, затем сдвиг, чтобы описанный
  // прямоугольник начинался в нуле.
  const corners = [
    { x: 0, y: 0 },
    { x: pageSize.width, y: 0 },
    { x: 0, y: pageSize.height },
    { x: pageSize.width, y: pageSize.height },
  ].map((corner) => ({ x: corner.x * cos - corner.y * sin, y: corner.x * sin + corner.y * cos }));
  const minX = Math.min(...corners.map((corner) => corner.x));
  const minY = Math.min(...corners.map((corner) => corner.y));
  const maxX = Math.max(...corners.map((corner) => corner.x));
  const maxY = Math.max(...corners.map((corner) => corner.y));
  return {
    size: { width: roundTiny(maxX - minX), height: roundTiny(maxY - minY) },
    turn: { a: cos, b: sin, tx: -minX, ty: -minY },
  };
}

/** Убирает дробный шум вроде 841.9999999 у прямых углов поворота. */
function roundTiny(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Math.abs(rounded - Math.round(rounded)) < 1e-6 ? Math.round(rounded) : rounded;
}

/** Вырезанная область повёрнутой страницы — вся страница, если обрезки нет. */
export function cropOf(source: Pick<PlanSource, 'pageSize' | 'rotation' | 'crop'>) {
  return source.crop ?? { x: 0, y: 0, ...rotatedPage(source.pageSize, source.rotation ?? 0).size };
}

/**
 * Страница исходника → пиксели плана в данных.
 *
 * @param mapSize размер плана — от него масштаб: ширина обрезки становится
 *        шириной плана
 */
export function pageToPlan(source: Pick<PlanSource, 'pageSize' | 'rotation' | 'crop'>, mapSize: MapSize): Similarity {
  const { turn } = rotatedPage(source.pageSize, source.rotation ?? 0);
  const crop = cropOf(source);
  const scale = mapSize.width / crop.width;
  const cropAndScale: Similarity = { a: scale, b: 0, tx: -crop.x * scale, ty: -crop.y * scale };
  return composeSimilarity(cropAndScale, turn);
}

/**
 * Старый план → новый план того же исходника: как переезжают точки
 * разметки, когда план переделали другой обрезкой, поворотом или размером.
 *
 * @returns `null`, если исходники разные: тогда точного пересчёта нет, и
 *          планы совмещают по парам точек (`fitSimilarity`)
 */
export function planChange(
  before: { source: PlanSource; mapSize: MapSize },
  after: { source: PlanSource; mapSize: MapSize }
): Similarity | null {
  if (before.source.file !== after.source.file || (before.source.page ?? 1) !== (after.source.page ?? 1)) return null;
  const toPage = invertSimilarity(pageToPlan(before.source, before.mapSize));
  return composeSimilarity(pageToPlan(after.source, after.mapSize), toPage);
}

/** Пара точек: где точка на одном плане и где она же на другом. */
export interface PointPair {
  from: Point;
  to: Point;
}

/** Подобие по парам точек и насколько каждая пара с ним расходится. */
export interface SimilarityFit {
  transform: Similarity;
  /** Расхождение каждой пары после совмещения — в единицах `to`. */
  residuals: number[];
  /** Среднеквадратичное расхождение — одна цифра «насколько точно». */
  rms: number;
}

/**
 * Лучшее подобие по парам точек — метод наименьших квадратов.
 *
 * Двух пар хватает, чтобы совместить точно; третья и дальше показывают, где
 * ошибся человек или исказился скан: у такой пары большое расхождение.
 *
 * @returns `null`, если пар меньше двух или все точки `from` совпадают
 */
export function fitSimilarity(pairs: readonly PointPair[]): SimilarityFit | null {
  if (pairs.length < 2) return null;

  const n = pairs.length;
  const mean = (pick: (pair: PointPair) => number) => pairs.reduce((sum, pair) => sum + pick(pair), 0) / n;
  const fx = mean((pair) => pair.from.x);
  const fy = mean((pair) => pair.from.y);
  const tx = mean((pair) => pair.to.x);
  const ty = mean((pair) => pair.to.y);

  let sxx = 0;
  let sxy = 0;
  let norm = 0;
  for (const pair of pairs) {
    const px = pair.from.x - fx;
    const py = pair.from.y - fy;
    const qx = pair.to.x - tx;
    const qy = pair.to.y - ty;
    sxx += px * qx + py * qy;
    sxy += px * qy - py * qx;
    norm += px * px + py * py;
  }
  if (norm === 0) return null;

  const a = sxx / norm;
  const b = sxy / norm;
  const transform: Similarity = { a, b, tx: tx - (a * fx - b * fy), ty: ty - (b * fx + a * fy) };

  const residuals = pairs.map((pair) => {
    const moved = applySimilarity(transform, pair.from);
    return Math.hypot(moved.x - pair.to.x, moved.y - pair.to.y);
  });
  const rms = Math.sqrt(residuals.reduce((sum, value) => sum + value * value, 0) / n);
  return { transform, residuals, rms };
}
