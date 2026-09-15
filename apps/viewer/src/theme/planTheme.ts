import type { ColorScheme } from './theme';

/**
 * Стиль, вписываемый в SVG-планы перед показом (записи 30 и 35).
 *
 * План показывается изображением, и стили страницы внутрь не проходят. В
 * светлой теме стиля темы нет: цвета берутся из атрибутов файла, и план такой
 * же, как в редакторе. В тёмной — тёмный лист со светлыми стенами для классов
 * генератора (`svg.campus-plan`); планы без этих классов в тёмной теме
 * инвертируются фильтром (`index.css`).
 */

/** Цвета тёмного листа плана: каналы RGB, как у токенов темы. */
const DARK_PLAN = {
  floor: '30 34 42',
  corridor: '44 50 61',
  room: '37 43 53',
  tintBlue: '33 49 68',
  tintWarm: '58 47 35',
  tintGreen: '33 54 42',
  tintViolet: '50 43 70',
  wall: '148 158 174',
  label: '205 212 222',
  ground: '22 30 26',
  street: '42 46 54',
  path: '54 58 64',
  parking: '40 44 52',
  roof: '55 61 71',
  roofEdge: '104 112 124',
  roofLabel: '214 220 229',
} as const;

const rgb = (channels: string) => `rgb(${channels})`;

const DARK_RULES: ReadonlyArray<readonly [string, string]> = [
  ['.plan-floor, .plan-room--service', `fill:${rgb(DARK_PLAN.floor)}`],
  ['.plan-corridor', `fill:${rgb(DARK_PLAN.corridor)}`],
  ['.plan-room', `fill:${rgb(DARK_PLAN.room)};stroke:${rgb(DARK_PLAN.wall)}`],
  ['.plan-room--toilet, .plan-room--lab, .plan-room--pool', `fill:${rgb(DARK_PLAN.tintBlue)}`],
  ['.plan-room--canteen, .plan-room--cloakroom, .plan-room--hall', `fill:${rgb(DARK_PLAN.tintWarm)}`],
  ['.plan-room--stairs, .plan-room--library, .plan-room--gym', `fill:${rgb(DARK_PLAN.tintGreen)}`],
  ['.plan-room--lift', `fill:${rgb(DARK_PLAN.tintViolet)}`],
  ['.plan-wall, .plan-stairs, .plan-lift', `stroke:${rgb(DARK_PLAN.wall)}`],
  ['.plan-door', `stroke:${rgb(DARK_PLAN.corridor)}`],
  ['.plan-door--outer', `stroke:${rgb(DARK_PLAN.floor)}`],
  ['.plan-label', `fill:${rgb(DARK_PLAN.label)}`],
  ['.plan-icon path', `stroke:${rgb(DARK_PLAN.label)}`],
  ['.plan-ground', `fill:${rgb(DARK_PLAN.ground)}`],
  ['.plan-street', `fill:${rgb(DARK_PLAN.street)}`],
  ['.plan-street-line, .plan-parking-line, .plan-walkway', `stroke:${rgb(DARK_PLAN.path)}`],
  ['.plan-parking', `fill:${rgb(DARK_PLAN.parking)}`],
  ['.plan-square', `fill:${rgb(DARK_PLAN.path)};stroke:${rgb(DARK_PLAN.roofEdge)}`],
  ['.plan-roof, .plan-bridge', `fill:${rgb(DARK_PLAN.roof)};stroke:${rgb(DARK_PLAN.roofEdge)}`],
  ['.plan-roof-label', `fill:${rgb(DARK_PLAN.roofLabel)}`],
  ['.plan-bus-stop', `fill:${rgb(DARK_PLAN.roofEdge)}`],
];

/**
 * На плане территории холста крыш и букв корпусов нет: корпуса нарисованы
 * холстом один раз, и надпись не ложится на надпись (запись 32).
 */
const CAMPUS_CANVAS_RULES = '.plan-roof,.plan-roof-label{display:none}';

/** Стиль плана для темы; `campus` — план территории на холсте. */
export function planStyleFor(scheme: ColorScheme, campus = false): string {
  const theme = scheme === 'dark' ? DARK_RULES.map(([selector, body]) => `${selector}{${body}}`).join('') : '';
  return campus ? `${theme}${CAMPUS_CANVAS_RULES}` : theme;
}
