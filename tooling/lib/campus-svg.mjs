/**
 * Рисунок территории кампуса в SVG — для тестового и синтетического кампуса
 * (запись 30).
 *
 * Всё задаётся в метрах кампуса и переводится в пиксели плана территории. Крыши
 * корпусов — многоугольники по привязке планов, поэтому на общем виде корпус
 * стоит ровно там, где навигатор откроет его этажи.
 */
import { escapeXml, svgDocument } from './plan-svg.mjs';

export const CAMPUS_COLORS = {
  ground: '#E4EEDA',
  street: '#C9CED5',
  streetLine: '#F7F7F2',
  walkway: '#F5F1E8',
  square: '#F1ECE1',
  squareEdge: '#D8CFBE',
  parking: '#D9DCE1',
  roof: '#D5D1C9',
  roofEdge: '#8E8A82',
  roofLabel: '#5E5A53',
  bridge: '#CBC6BD',
  stop: '#8E9AAB',
};

/**
 * Дорожки территории — рёбра графа: рисунок совпадает с тем, где проходят
 * маршруты.
 *
 * @param {Array<{ id: string, x: number, y: number, neighbors: string[] }>} nodes — пиксели плана
 * @returns {Array<[{x: number, y: number}, {x: number, y: number}]>} отрезки в метрах
 */
export function graphWalkways(nodes, metersPerPixel) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const meters = (node) => ({ x: node.x * metersPerPixel, y: node.y * metersPerPixel });
  const walkways = [];
  for (const node of nodes) {
    for (const neighbor of node.neighbors) {
      if (node.id < neighbor && byId.has(neighbor)) walkways.push([meters(node), meters(byId.get(neighbor))]);
    }
  }
  return walkways;
}

/**
 * @param {object} campus
 * @param {number} campus.width — метры
 * @param {number} campus.depth — метры
 * @param {number} campus.metersPerPixel
 * @param {{ y: number, height: number }} campus.street — улица вдоль нижнего края
 * @param {Array<Array<{x: number, y: number}>>} campus.walkways — отрезки дорожек
 * @param {{ x: number, y: number, radius: number }} campus.square
 * @param {{ x: number, y: number, width: number, height: number }} campus.parking
 * @param {{ x: number, y: number }} campus.busStop
 * @param {Array<{ corners: Array<{x: number, y: number}>, label: string }>} campus.buildings
 * @param {Array<{ corners: Array<{x: number, y: number}> }>} campus.bridges
 */
export function campusPlanSvg(campus) {
  const k = 1 / campus.metersPerPixel;
  const n = (meters) => Math.round(meters * k * 10) / 10;
  const W = Math.round(campus.width * k);
  const H = Math.round(campus.depth * k);
  const points = (corners) => corners.map((c) => `${n(c.x)},${n(c.y)}`).join(' ');

  const parts = [
    `<rect class="plan-ground" x="0" y="0" width="${W}" height="${H}" fill="${CAMPUS_COLORS.ground}"/>`,
    `<rect class="plan-street" x="0" y="${n(campus.street.y)}" width="${W}" height="${n(campus.street.height)}" fill="${CAMPUS_COLORS.street}"/>`,
    `<line class="plan-street-line" x1="0" y1="${n(campus.street.y + campus.street.height / 2)}" x2="${W}" y2="${n(campus.street.y + campus.street.height / 2)}" stroke="${CAMPUS_COLORS.streetLine}" stroke-width="1.5" stroke-dasharray="10 8"/>`,
  ];

  const { parking } = campus;
  parts.push(
    `<rect class="plan-parking" x="${n(parking.x)}" y="${n(parking.y)}" width="${n(parking.width)}" height="${n(parking.height)}" rx="3" fill="${CAMPUS_COLORS.parking}"/>`
  );
  for (let x = parking.x + 2.5; x < parking.x + parking.width - 1; x += 2.5) {
    parts.push(
      `<line class="plan-parking-line" x1="${n(x)}" y1="${n(parking.y + 1)}" x2="${n(x)}" y2="${n(parking.y + parking.height / 2 - 1)}" stroke="${CAMPUS_COLORS.streetLine}" stroke-width="1"/>`
    );
  }

  parts.push(
    `<circle class="plan-square" cx="${n(campus.square.x)}" cy="${n(campus.square.y)}" r="${n(campus.square.radius)}" fill="${CAMPUS_COLORS.square}" stroke="${CAMPUS_COLORS.squareEdge}" stroke-width="1.5"/>`
  );
  for (const [a, b] of campus.walkways) {
    parts.push(
      `<line class="plan-walkway" x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${CAMPUS_COLORS.walkway}" stroke-width="6" stroke-linecap="round"/>`
    );
  }

  for (const bridge of campus.bridges) {
    parts.push(
      `<polygon class="plan-bridge" points="${points(bridge.corners)}" fill="${CAMPUS_COLORS.bridge}" stroke="${CAMPUS_COLORS.roofEdge}" stroke-width="1"/>`
    );
  }

  for (const building of campus.buildings) {
    const cx = building.corners.reduce((sum, c) => sum + c.x, 0) / building.corners.length;
    const cy = building.corners.reduce((sum, c) => sum + c.y, 0) / building.corners.length;
    parts.push(
      `<polygon class="plan-roof" points="${points(building.corners)}" fill="${CAMPUS_COLORS.roof}" stroke="${CAMPUS_COLORS.roofEdge}" stroke-width="1.5"/>`,
      `<text class="plan-roof-label" x="${n(cx)}" y="${n(cy)}" text-anchor="middle" dominant-baseline="central" font-size="22" font-weight="600" fill="${CAMPUS_COLORS.roofLabel}">${escapeXml(building.label)}</text>`
    );
  }

  const stop = campus.busStop;
  parts.push(
    `<rect class="plan-bus-stop" x="${n(stop.x - 4)}" y="${n(stop.y - 1.5)}" width="${n(8)}" height="${n(3)}" rx="1" fill="${CAMPUS_COLORS.stop}"/>`
  );

  return svgDocument(W, H, parts);
}
