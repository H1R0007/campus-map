/**
 * Поля вокруг плана: белое по краям листа, которое на карте только мешает
 * (запись 48).
 *
 * Считается по картинке листа: строки и столбцы, где набирается хоть
 * сколько-то тёмных точек, — содержимое. Одиночные пылинки скана границу не
 * сдвигают: строке нужно несколько тёмных точек. Рамку чертежа обрезка
 * оставляет — это не поле, и где кончается план внутри рамки, по пикселям не
 * понять; её человек подрежет сам.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Точка тёмная: не белая и не прозрачная. */
function isInk(data: Uint8ClampedArray, index: number): boolean {
  const alpha = data[index + 3];
  if (alpha < 16) return false;
  const luminance = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
  return luminance < 230;
}

/**
 * Прямоугольник содержимого картинки с небольшим запасом по краям.
 *
 * @returns `null`, если картинка пустая
 */
export function contentBox(data: Uint8ClampedArray, width: number, height: number): Box | null {
  const rows = new Uint32Array(height);
  const columns = new Uint32Array(width);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isInk(data, (y * width + x) * 4)) {
        rows[y] += 1;
        columns[x] += 1;
      }
    }
  }

  // Порог — доля размера: на скане в 4000 точек пылинка крупнее, чем на
  // превью в 400.
  const minRow = Math.max(2, Math.round(width * 0.002));
  const minColumn = Math.max(2, Math.round(height * 0.002));
  const top = rows.findIndex((count) => count >= minRow);
  if (top < 0) return null;
  const bottom = height - 1 - [...rows].reverse().findIndex((count) => count >= minRow);
  const left = columns.findIndex((count) => count >= minColumn);
  const right = width - 1 - [...columns].reverse().findIndex((count) => count >= minColumn);
  if (left < 0 || right < left || bottom < top) return null;

  const margin = Math.round(Math.max(width, height) * 0.01);
  const x = Math.max(0, left - margin);
  const y = Math.max(0, top - margin);
  return {
    x,
    y,
    width: Math.min(width, right + 1 + margin) - x,
    height: Math.min(height, bottom + 1 + margin) - y,
  };
}

/** Прямоугольник в другом масштабе: из пикселей превью — в единицы листа. */
export function scaleBox(box: Box, factor: number): Box {
  return { x: box.x * factor, y: box.y * factor, width: box.width * factor, height: box.height * factor };
}

/** Прямоугольник внутри листа: не вылезает за края и не пустой. */
export function clampBox(box: Box, size: { width: number; height: number }): Box {
  const x = Math.min(Math.max(0, box.x), size.width - 1);
  const y = Math.min(Math.max(0, box.y), size.height - 1);
  return {
    x,
    y,
    width: Math.max(1, Math.min(box.width, size.width - x)),
    height: Math.max(1, Math.min(box.height, size.height - y)),
  };
}

/** За что тянут область: край, угол или всю целиком. */
export type CropHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Область после того, как край, угол или вся область сдвинуты на (dx, dy) единиц листа. */
export function dragBox(start: Box, handle: CropHandle, dx: number, dy: number, page: { width: number; height: number }): Box {
  const minWidth = page.width * 0.02;
  const minHeight = page.height * 0.02;
  let { x, y, width, height } = start;
  if (handle === 'move') {
    return { x: clamp(x + dx, 0, page.width - width), y: clamp(y + dy, 0, page.height - height), width, height };
  }
  if (handle.includes('w')) {
    const next = clamp(x + dx, 0, x + width - minWidth);
    width += x - next;
    x = next;
  }
  if (handle.includes('e')) width = clamp(width + dx, minWidth, page.width - x);
  if (handle.includes('n')) {
    const next = clamp(y + dy, 0, y + height - minHeight);
    height += y - next;
    y = next;
  }
  if (handle.includes('s')) height = clamp(height + dy, minHeight, page.height - y);
  return { x, y, width, height };
}

