import type { OutlinePoint } from './outline';

/**
 * Вид листа в мастерской (запись 80): масштаб и сдвиг, как у карты.
 *
 * Координаты листа — единицы повёрнутой страницы (пункты PDF, пиксели
 * картинки), как у обрезки и контура. Экран — пиксели области листа:
 * `экран = лист × scale + сдвиг`. Ручки рисуются в экранных пикселях, поэтому
 * их размер не зависит от приближения.
 */

export interface SheetView {
  /** Экранных пикселей на единицу листа. */
  scale: number;
  /** Где на экране левый верхний угол листа. */
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Поле вокруг листа, вписанного целиком, px. */
export const FIT_MARGIN = 24;

/** Во сколько раз можно приблизить сверх «весь лист» и отдалить меньше него. */
export const MAX_ZOOM = 40;
export const MIN_ZOOM = 0.5;

/** Лист целиком посередине области. */
export function fitView(area: Size, page: Size, margin = FIT_MARGIN): SheetView {
  const scale = Math.max(1e-6, Math.min((area.width - 2 * margin) / page.width, (area.height - 2 * margin) / page.height));
  return { scale, x: (area.width - page.width * scale) / 2, y: (area.height - page.height * scale) / 2 };
}

/**
 * Приближение в точке экрана: точка листа под ней остаётся под ней — как
 * колесо мыши в любом графическом редакторе. Масштаб ограничен долями «весь
 * лист»: дальше приближать незачем, а отдалить до точки — потерять лист.
 */
export function zoomAt(view: SheetView, factor: number, at: Point, fitScale: number): SheetView {
  const scale = Math.min(fitScale * MAX_ZOOM, Math.max(fitScale * MIN_ZOOM, view.scale * factor));
  const k = scale / view.scale;
  return { scale, x: at.x - (at.x - view.x) * k, y: at.y - (at.y - view.y) * k };
}

export const toPage = (view: SheetView, screen: Point): Point => ({ x: (screen.x - view.x) / view.scale, y: (screen.y - view.y) / view.scale });

export const toScreen = (view: SheetView, page: Point): Point => ({ x: page.x * view.scale + view.x, y: page.y * view.scale + view.y });

/** Видимая часть листа в его единицах; `null` — лист за краем области. */
export function visiblePart(view: SheetView, area: Size, page: Size): { x: number; y: number; width: number; height: number } | null {
  const a = toPage(view, { x: 0, y: 0 });
  const b = toPage(view, { x: area.width, y: area.height });
  const x = Math.max(0, a.x);
  const y = Math.max(0, a.y);
  const right = Math.min(page.width, b.x);
  const bottom = Math.min(page.height, b.y);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

/**
 * Ближайшая к указателю точка на прямом ребре контура — там, куда щелчок
 * поставит новый угол («+» на линии). Дуги не участвуют: у них своя ручка в
 * середине. Ближе `cornerGap` к углу «+» не показывается — там тянут угол.
 *
 * @returns номер ребра (от угла `index` к следующему) и точка в единицах листа
 */
export function nearestEdgePoint(
  outline: readonly OutlinePoint[],
  view: SheetView,
  screen: Point,
  radius: number,
  cornerGap = radius
): { index: number; point: Point } | null {
  let best: { index: number; point: Point; distance: number } | null = null;
  for (let index = 0; index < outline.length; index += 1) {
    const from = outline[index];
    if (from.bulge) continue;
    const a = toScreen(view, from);
    const b = toScreen(view, outline[(index + 1) % outline.length]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    if (length2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((screen.x - a.x) * dx + (screen.y - a.y) * dy) / length2));
    const near = { x: a.x + dx * t, y: a.y + dy * t };
    const distance = Math.hypot(screen.x - near.x, screen.y - near.y);
    if (distance > radius) continue;
    if (Math.hypot(near.x - a.x, near.y - a.y) < cornerGap || Math.hypot(near.x - b.x, near.y - b.y) < cornerGap) continue;
    if (!best || distance < best.distance) best = { index, point: toPage(view, near), distance };
  }
  return best && { index: best.index, point: best.point };
}
