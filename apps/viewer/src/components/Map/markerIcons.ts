import L from 'leaflet';
import { transitionTypeColor, transitionTypeIcon, type TransitionType } from '@campus-map/core';

/**
 * Иконки маркеров навигатора.
 *
 * Leaflet-иконка — объект с HTML-разметкой, и создавать её на каждый рендер
 * означало бы заново парсить SVG для каждого маркера. Поэтому экземпляры
 * кэшируются: на тип точки их фиксированное число.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function endpointIcon(color: string, label: string): L.DivIcon {
  return L.divIcon({
    className: 'campus-marker campus-marker--endpoint',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="${SVG_NS}" role="img" aria-label="${label}">
      <circle cx="14" cy="14" r="9" fill="${color}" stroke="#ffffff" stroke-width="3"/>
    </svg>`,
  });
}

export const START_ICON = endpointIcon('#16a34a', 'Начало маршрута');
export const END_ICON = endpointIcon('#2563eb', 'Конец маршрута');

/**
 * Иконка точки перехода между этажами или корпусами.
 *
 * Цвет и символ соответствуют типу перехода, поэтому на плане видно, где
 * лестница, где лифт, а где вход в корпус — теми же обозначениями, что и в
 * пошаговых инструкциях маршрута.
 */
const portalIcons = new Map<TransitionType | 'unknown', L.DivIcon>();

export function portalIcon(type: TransitionType | null): L.DivIcon {
  const key = type ?? 'unknown';

  const cached = portalIcons.get(key);
  if (cached) return cached;

  const color = type ? transitionTypeColor(type) : '#64748b';
  const glyph = type ? transitionTypeIcon(type) : '•';

  const icon = L.divIcon({
    className: 'campus-marker campus-marker--portal',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<span style="background:${color}">${glyph}</span>`,
  });

  portalIcons.set(key, icon);
  return icon;
}
