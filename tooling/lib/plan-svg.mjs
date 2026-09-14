/**
 * Рисунок плана этажа в SVG — для тестового и синтетического кампуса (запись 30).
 *
 * У каждого элемента класс по смыслу (`plan-wall`, `plan-room--toilet`…):
 * навигатор встраивает SVG в страницу и перекрашивает план правилами CSS —
 * светлая и тёмная тема без фильтров. Цвета атрибутами — для показа файла
 * картинкой (в редакторе, в браузере): правило CSS атрибут перекрывает.
 */
import { toPixels } from './floor-layout.mjs';

export const PLAN_COLORS = {
  // Пол без помещения — служебная зона: закрытые и неразмеченные площади.
  floor: '#EDECE8',
  corridor: '#ECEFF2',
  room: '#FFFFFF',
  service: '#E9E9E6',
  wall: '#3F444D',
  label: '#4B5563',
  icon: '#6B7280',
  toilet: '#E6EFF9',
  canteen: '#FBEFDD',
  cloakroom: '#F1ECE3',
  stairs: '#E3F1E6',
  lift: '#ECE6F7',
  hall: '#F2F2EC',
  library: '#E6F2EE',
  lab: '#E7ECF7',
  gym: '#E6F2E6',
  pool: '#DFEFF6',
};

/** Значки помещений: контуры в поле 24×24, рисуются обводкой. */
const ICONS = {
  toilet:
    'M7 3.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM17 3.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM12 3v18M5.5 21v-6h-1v-5a1.5 1.5 0 011.5-1.5h2A1.5 1.5 0 019.5 10v5h-1v6M15.5 21v-4.5H13l2.2-6.8a1 1 0 01.95-.7h1.7a1 1 0 01.95.7l2.2 6.8h-2.5V21',
  canteen: 'M6 3v5a3 3 0 003 3 3 3 0 003-3V3M9 3v18M18 21V3c-2.2 1.2-3.5 3.8-3.5 7v4H18',
  cloakroom: 'M10 5.5a2 2 0 114 0c0 1.1-.9 1.7-2 2.2V9m0 0l-8.4 6.3A1.5 1.5 0 004.5 18h15a1.5 1.5 0 00.9-2.7L12 9z',
  lockers: 'M10 5.5a2 2 0 114 0c0 1.1-.9 1.7-2 2.2V9m0 0l-8.4 6.3A1.5 1.5 0 004.5 18h15a1.5 1.5 0 00.9-2.7L12 9z',
  library:
    'M12 6.25v13m0-13C10.83 5.48 9.25 5 7.5 5S4.17 5.48 3 6.25v13C4.17 18.48 5.75 18 7.5 18s3.33.48 4.5 1.25m0-13C13.17 5.48 14.75 5 16.5 5c1.75 0 3.33.48 4.5 1.25v13C19.83 18.48 18.25 18 16.5 18c-1.75 0-3.33.48-4.5 1.25',
  lab: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  gym: 'M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12',
  athletics: 'M13 3.5a1.8 1.8 0 110 3.6 1.8 1.8 0 010-3.6zM7 21l3-6 3 2v4M10 15l1-5 4 3 3-1M11 10l-3 1-2 3',
  pool: 'M3 15c2 0 2-1.5 4.5-1.5S9.5 15 12 15s2.5-1.5 4.5-1.5S19 15 21 15M3 19c2 0 2-1.5 4.5-1.5S9.5 19 12 19s2.5-1.5 4.5-1.5S19 19 21 19M8 12V5a2 2 0 014 0M16 12V5',
  conference:
    'M17 20h5v-2a3 3 0 00-5.4-1.9M17 20H7m10 0v-2c0-.7-.1-1.3-.4-1.9M7 20H2v-2a3 3 0 015.4-1.9M7 20v-2c0-.7.1-1.3.4-1.9m0 0a5 5 0 019.2 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  hall: 'M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1',
  dean: 'M21 13.3A24 24 0 0112 15c-3.2 0-6.2-.6-9-1.7M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m-3 14h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
};

const escapeXml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function svgDocument(width, height, parts) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="campus-plan" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">`,
    ...parts.map((part) => `  ${part}`),
    '</svg>',
    '',
  ].join('\n');
}

function roomDetails(room, x, y, w, h) {
  const stroke = `stroke="${PLAN_COLORS.wall}" stroke-width="1.2"`;
  if (room.kind === 'stairs') {
    const lines = [];
    for (let step = y + 6; step < y + h - 2; step += 6) {
      lines.push(`<line class="plan-stairs" x1="${x + 4}" y1="${step}" x2="${x + w - 4}" y2="${step}" ${stroke}/>`);
    }
    return lines;
  }
  if (room.kind === 'lift') {
    return [
      `<line class="plan-lift" x1="${x + 4}" y1="${y + 4}" x2="${x + w - 4}" y2="${y + h - 4}" ${stroke}/>`,
      `<line class="plan-lift" x1="${x + w - 4}" y1="${y + 4}" x2="${x + 4}" y2="${y + h - 4}" ${stroke}/>`,
    ];
  }
  return [];
}

/**
 * План этажа по геометрии `layoutFloor`.
 *
 * @param labels id помещения → `{ code }`: номер на двери, например «А-305»
 */
export function floorPlanSvg(geometry, labels) {
  const { width, depth, corridor, rooms, entrances, ends } = geometry;
  const W = toPixels(width);
  const H = toPixels(depth);
  const parts = [
    `<rect class="plan-floor" x="0" y="0" width="${W}" height="${H}" fill="${PLAN_COLORS.floor}"/>`,
    `<rect class="plan-corridor" x="0" y="${toPixels(corridor.y)}" width="${W}" height="${toPixels(corridor.height)}" fill="${PLAN_COLORS.corridor}"/>`,
  ];

  for (const room of rooms) {
    const [x, y] = [toPixels(room.from), toPixels(room.top)];
    const [w, h] = [toPixels(room.to - room.from), toPixels(room.bottom - room.top)];
    const fill = PLAN_COLORS[room.kind] ?? PLAN_COLORS.room;
    parts.push(
      `<rect class="plan-room plan-room--${room.kind}" x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${PLAN_COLORS.wall}" stroke-width="2"/>`,
      ...roomDetails(room, x, y, w, h)
    );
  }

  // Двери помещений — разрыв стены со стороны коридора.
  for (const room of rooms.filter((r) => r.id)) {
    const y = toPixels(room.side === 'n' ? corridor.y : corridor.y + corridor.height);
    const cx = toPixels(room.cx);
    parts.push(`<line class="plan-door" x1="${cx - 6}" y1="${y}" x2="${cx + 6}" y2="${y}" stroke="${PLAN_COLORS.corridor}" stroke-width="4"/>`);
  }

  parts.push(`<rect class="plan-wall" x="2" y="2" width="${W - 4}" height="${H - 4}" fill="none" stroke="${PLAN_COLORS.wall}" stroke-width="4"/>`);

  // Наружные двери — разрыв наружной стены.
  for (const { door } of [...entrances, ...ends]) {
    const [x, y] = [toPixels(door.x), toPixels(door.y)];
    const horizontal = door.y === 0 || door.y === depth;
    const edge = horizontal ? (door.y === 0 ? 2 : H - 2) : door.x === 0 ? 2 : W - 2;
    parts.push(
      horizontal
        ? `<line class="plan-door plan-door--outer" x1="${x - 9}" y1="${edge}" x2="${x + 9}" y2="${edge}" stroke="${PLAN_COLORS.floor}" stroke-width="6"/>`
        : `<line class="plan-door plan-door--outer" x1="${edge}" y1="${y - 9}" x2="${edge}" y2="${y + 9}" stroke="${PLAN_COLORS.floor}" stroke-width="6"/>`
    );
  }

  // Центр помещения на карте занимает точка места — значок встаёт над ним, номер
  // под ним, иначе точка закрыла бы подпись.
  for (const room of rooms) {
    const code = room.id ? labels.get(room.id)?.code : undefined;
    const icon = ICONS[room.kind];
    const [cx, cy] = [toPixels(room.cx), toPixels(room.cy)];
    if (icon) {
      const size = 30;
      const top = cy - size - 10;
      parts.push(
        `<g class="plan-icon" transform="translate(${cx - size / 2} ${top}) scale(${size / 24})"><path d="${icon}" fill="none" stroke="${PLAN_COLORS.icon}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`
      );
    }
    if (code) {
      parts.push(
        `<text class="plan-label" x="${cx}" y="${cy + 22}" text-anchor="middle" dominant-baseline="central" font-size="14" fill="${PLAN_COLORS.label}">${escapeXml(code)}</text>`
      );
    }
  }

  return svgDocument(W, H, parts);
}

export { escapeXml };
