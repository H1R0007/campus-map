import type { MapSize } from '@campus-map/core';
import { rotatedPage } from './planGeometry';
import type { Box } from './trim';
import { outlinePath } from './outline';
import type { OutlinePoint } from './outline';

/**
 * Векторный план — SVG и чертёж DXF — остаётся вектором (запись 48): поворот
 * и обрезка делаются обёрткой вокруг исходного рисунка, без перевода в
 * картинку. Линии чертежа остаются чёткими при любом приближении, а файл —
 * маленьким.
 */

/** Размер SVG-листа: `width`/`height` или `viewBox`. */
export function svgPageSize(text: string): MapSize | null {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!tag) return null;
  const attribute = (name: string) => new RegExp(String.raw`\s${name}\s*=\s*(["'])([^"']*)\1`, 'i').exec(tag)?.[2] ?? '';
  const width = Number.parseFloat(attribute('width'));
  const height = Number.parseFloat(attribute('height'));
  if (width > 0 && height > 0) return { width, height };
  const box = attribute('viewBox').trim().split(/[\s,]+/).map(Number);
  return box.length === 4 && box[2] > 0 && box[3] > 0 ? { width: box[2], height: box[3] } : null;
}

/** Корень SVG без пролога, с явным размером листа: так его можно вложить в другой SVG. */
function nestable(text: string, size: MapSize): string {
  const body = text.replace(/<\?xml[^>]*\?>/i, '').replace(/<!DOCTYPE[^>]*>/i, '').trim();
  return body.replace(/<svg\b([^>]*)>/i, (_match, attributes: string) => {
    const rest = attributes.replace(/\s(width|height|x|y)\s*=\s*(["'])[^"']*\2/gi, '');
    return `<svg${rest} x="0" y="0" width="${size.width}" height="${size.height}">`;
  });
}

/**
 * План из SVG-листа: лист повёрнут на `rotation` (по часовой, градусы),
 * вырезана область `crop` повёрнутого листа, размер плана — `scale` единиц
 * на единицу листа.
 */
export function composeSvgPlan(
  text: string,
  pageSize: MapSize,
  rotation: number,
  crop: Box | null,
  scale: number,
  outline: readonly OutlinePoint[] | null = null
): { svg: string; size: MapSize } {
  const { size: rotated, turn } = rotatedPage(pageSize, rotation);
  const area = crop ?? { x: 0, y: 0, ...rotated };
  const size = { width: Math.round(area.width * scale), height: Math.round(area.height * scale) };
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  // SVG matrix(a b c d e f): x' = a·x + c·y + e, y' = b·x + d·y + f — то же
  // подобие, что `rotatedPage`, записанное по правилам SVG.
  const matrix = [turn.a, turn.b, -turn.b, turn.a, turn.tx, turn.ty].map(round).join(' ');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${size.width}" height="${size.height}" viewBox="${round(area.x)} ${round(area.y)} ${round(area.width)} ${round(area.height)}">` +
    // Контур здания (запись 73) — обрезкой по пути в координатах повёрнутого листа.
    (outline ? `<defs><clipPath id="campus-plan-outline"><path d="${outlinePath(outline)}"/></clipPath></defs><g clip-path="url(#campus-plan-outline)">` : '') +
    `<g transform="matrix(${matrix})">${nestable(text, pageSize)}</g>${outline ? '</g>' : ''}</svg>`;
  return { svg, size };
}

// ---------- DXF ----------

interface DxfPoint {
  x: number;
  y: number;
}

/** То, что нужно от разобранного DXF: сущности чертежа (`dxf-parser`). */
export interface DxfEntity {
  type: string;
  layer?: string;
  vertices?: DxfPoint[];
  shape?: boolean;
  closed?: boolean;
  center?: DxfPoint;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  startPoint?: DxfPoint;
  position?: DxfPoint;
  text?: string;
  textHeight?: number;
  height?: number;
  rotation?: number;
  controlPoints?: DxfPoint[];
  fitPoints?: DxfPoint[];
}

export interface DxfText {
  text: string;
  /** Положение подписи в единицах листа (ось y вниз, как у плана). */
  x: number;
  y: number;
  height: number;
}

/** Текст DXF без служебной разметки MTEXT: «\\PКорпус В» → «Корпус В». */
function plainText(value: string): string {
  return value
    .replace(/\\P/g, ' ')
    .replace(/\\[A-Za-z][^;\\]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Чертёж DXF в SVG-лист.
 *
 * Ось y чертежа смотрит вверх, у плана — вниз: координаты отражаются по
 * границам чертежа, надписи при этом остаются читаемыми. Блоки (`INSERT`),
 * штриховки и размеры пока не рисуются — на планах этажей это мебель,
 * заливки и размерные линии, для разметки путей они не нужны.
 *
 * @returns `null`, если в чертеже нечего нарисовать
 */
export function dxfToSvg(entities: readonly DxfEntity[]): { svg: string; size: MapSize; texts: DxfText[] } | null {
  const points: DxfPoint[] = [];
  const texts: { entity: DxfEntity; at: DxfPoint; height: number; text: string }[] = [];

  for (const entity of entities) {
    if ((entity.type === 'LINE' || entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') && entity.vertices) {
      points.push(...entity.vertices);
    } else if ((entity.type === 'CIRCLE' || entity.type === 'ARC') && entity.center && entity.radius) {
      const { center, radius } = entity;
      points.push({ x: center.x - radius, y: center.y - radius }, { x: center.x + radius, y: center.y + radius });
    } else if (entity.type === 'SPLINE') {
      points.push(...(entity.fitPoints ?? entity.controlPoints ?? []));
    } else if ((entity.type === 'TEXT' || entity.type === 'MTEXT') && entity.text) {
      const at = entity.startPoint ?? entity.position;
      const height = entity.textHeight ?? entity.height ?? 1;
      if (at) {
        texts.push({ entity, at, height, text: plainText(entity.text) });
        points.push(at, { x: at.x + height * entity.text.length * 0.6, y: at.y + height });
      }
    }
  }
  if (points.length === 0) return null;

  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const width = maxX - minX;
  const height = maxY - minY;
  if (!(width > 0) || !(height > 0)) return null;

  // Поля в 2 % и толщина линий от размера чертежа: у плана в метрах и в
  // миллиметрах линия одинаково заметна.
  const pad = Math.max(width, height) * 0.02;
  const size = { width: width + 2 * pad, height: height + 2 * pad };
  const stroke = Math.max(width, height) / 800;
  const px = (x: number) => Math.round((x - minX + pad) * 1000) / 1000;
  const py = (y: number) => Math.round((maxY - y + pad) * 1000) / 1000;
  const polyline = (vertices: DxfPoint[], closed: boolean) =>
    `<${closed ? 'polygon' : 'polyline'} points="${vertices.map((v) => `${px(v.x)},${py(v.y)}`).join(' ')}"/>`;

  const shapes: string[] = [];
  for (const entity of entities) {
    switch (entity.type) {
      case 'LINE':
        if (entity.vertices && entity.vertices.length >= 2) shapes.push(polyline(entity.vertices.slice(0, 2), false));
        break;
      case 'LWPOLYLINE':
      case 'POLYLINE':
        if (entity.vertices && entity.vertices.length >= 2) shapes.push(polyline(entity.vertices, Boolean(entity.shape ?? entity.closed)));
        break;
      case 'SPLINE': {
        const vertices = entity.fitPoints ?? entity.controlPoints ?? [];
        if (vertices.length >= 2) shapes.push(polyline(vertices, false));
        break;
      }
      case 'CIRCLE':
        if (entity.center && entity.radius) {
          shapes.push(`<circle cx="${px(entity.center.x)}" cy="${py(entity.center.y)}" r="${entity.radius}"/>`);
        }
        break;
      case 'ARC':
        if (entity.center && entity.radius && entity.startAngle !== undefined && entity.endAngle !== undefined) {
          const { center, radius } = entity;
          const start = { x: center.x + radius * Math.cos(entity.startAngle), y: center.y + radius * Math.sin(entity.startAngle) };
          const end = { x: center.x + radius * Math.cos(entity.endAngle), y: center.y + radius * Math.sin(entity.endAngle) };
          let sweep = entity.endAngle - entity.startAngle;
          if (sweep < 0) sweep += 2 * Math.PI;
          // Против часовой в чертеже — по часовой после отражения оси y.
          shapes.push(
            `<path d="M${px(start.x)} ${py(start.y)} A${radius} ${radius} 0 ${sweep > Math.PI ? 1 : 0} 0 ${px(end.x)} ${py(end.y)}"/>`
          );
        }
        break;
    }
  }

  const labels = texts.map(({ entity, at, height: textHeight, text }) => {
    const x = px(at.x);
    const y = py(at.y);
    const turn = entity.rotation ? ` transform="rotate(${-entity.rotation} ${x} ${y})"` : '';
    return `<text x="${x}" y="${y}" font-size="${textHeight}"${turn}>${escapeXml(text)}</text>`;
  });

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">` +
    `<rect width="100%" height="100%" fill="#ffffff"/>` +
    `<g fill="none" stroke="#1f2937" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${shapes.join('')}</g>` +
    `<g fill="#111827" font-family="Arial, sans-serif">${labels.join('')}</g></svg>`;

  return {
    svg,
    size,
    texts: texts.map(({ at, height: textHeight, text }) => ({ text, x: px(at.x), y: py(at.y), height: textHeight })),
  };
}
