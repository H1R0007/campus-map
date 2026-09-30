/** Цветовой токен редактора из `index.css`. */
export type EditorThemeToken = `--editor-${string}`;

/**
 * Цвет токена темы редактора строкой — для слоёв Leaflet.
 *
 * Leaflet пишет цвет в атрибуты SVG (`fill`, `stroke`), а они не понимают
 * `var()`. Поэтому цвет читается из CSS-переменной, а не копируется в код
 * литералом: тема редактора объявлена в одном месте. У навигатора такая же
 * функция своя — его токены записаны каналами RGB, у редактора — цветом.
 *
 * @throws если токен не объявлен — иначе узел молча рисовался бы чёрным
 */
export function themeColor(token: EditorThemeToken): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (value === '') {
    throw new Error(`Цветовой токен ${token} не объявлен в index.css`);
  }
  return value;
}

/** Цвета карты редактора: узлы, связи, маршрут, подсветка проблем. */
export interface MapPalette {
  highlight: string;
  /** Выбранная точка: заливка и обводка — видна и на синих точках, и на точках переходов. */
  selectedFill: string;
  selected: string;
  /** Ручки и отметки операций: постановка корпуса, совмещение. */
  handle: string;
  handleAlt: string;
  node: string;
  nodeStroke: string;
  portal: string;
  portalStroke: string;
  start: string;
  startStroke: string;
  finish: string;
  finishStroke: string;
  route: string;
  routeStroke: string;
  markerStroke: string;
  edge: string;
  edgeHover: string;
  lineHover: string;
  problemError: string;
  problemOrphan: string;
  problemNoName: string;
  draft: string;
  draftPoint: string;
  grid: string;
  labelBg: string;
  labelText: string;
}

let palette: { theme: string; colors: MapPalette } | null = null;

/**
 * Все цвета карты разом. Читаются из CSS один раз на тему: сменили тему
 * (атрибут `data-theme`, запись 56) — цвета читаются заново.
 */
export function mapPalette(): MapPalette {
  const theme = document.documentElement.dataset.theme ?? '';
  if (palette?.theme === theme) return palette.colors;
  palette = { theme, colors: readPalette() };
  return palette.colors;
}

function readPalette(): MapPalette {
  return {
    highlight: themeColor('--editor-highlight'),
    selectedFill: themeColor('--editor-map-selected-fill'),
    selected: themeColor('--editor-map-selected'),
    handle: themeColor('--editor-map-handle'),
    handleAlt: themeColor('--editor-map-handle-alt'),
    node: themeColor('--editor-map-node'),
    nodeStroke: themeColor('--editor-map-node-stroke'),
    portal: themeColor('--editor-map-portal'),
    portalStroke: themeColor('--editor-map-portal-stroke'),
    start: themeColor('--editor-map-start'),
    startStroke: themeColor('--editor-map-start-stroke'),
    finish: themeColor('--editor-map-finish'),
    finishStroke: themeColor('--editor-map-finish-stroke'),
    route: themeColor('--editor-map-route'),
    routeStroke: themeColor('--editor-map-route-stroke'),
    markerStroke: themeColor('--editor-map-marker-stroke'),
    edge: themeColor('--editor-map-edge'),
    edgeHover: themeColor('--editor-map-edge-hover'),
    lineHover: themeColor('--editor-map-line-hover'),
    problemError: themeColor('--editor-map-problem-error'),
    problemOrphan: themeColor('--editor-map-problem-orphan'),
    problemNoName: themeColor('--editor-map-problem-noname'),
    draft: themeColor('--editor-map-draft'),
    draftPoint: themeColor('--editor-map-draft-point'),
    grid: themeColor('--editor-map-grid'),
    labelBg: themeColor('--editor-label-bg'),
    labelText: themeColor('--editor-label-text'),
  };
}
