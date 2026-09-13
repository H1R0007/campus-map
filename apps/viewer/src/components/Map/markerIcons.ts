import L from 'leaflet';
import { transitionTypeColor, transitionTypeIcon, type TransitionType } from '@campus-map/core';
import { messagesFor } from '../../i18n';
import type { Language } from '../../i18n/languages';

/**
 * Иконки маркеров навигатора.
 *
 * Leaflet-иконка — объект с HTML-разметкой, и создавать её на каждый рендер
 * означало бы заново парсить SVG для каждого маркера. Поэтому экземпляры
 * кэшируются: на тип точки их фиксированное число.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

type EndpointKind = 'start' | 'end';

const ENDPOINT_COLORS: Readonly<Record<EndpointKind, string>> = { start: '#16a34a', end: '#2563eb' };

const endpointIcons = new Map<string, L.DivIcon>();

/**
 * Маркер начала или конца маршрута.
 *
 * Подпись для экранного диктора — на языке интерфейса, поэтому экземпляр
 * кэшируется по паре «вид точки + язык».
 */
export function endpointIcon(kind: EndpointKind, language: Language): L.DivIcon {
  const key = `${kind}:${language}`;

  const cached = endpointIcons.get(key);
  if (cached) return cached;

  const messages = messagesFor(language);
  const label = kind === 'start' ? messages.map.routeStart : messages.map.routeEnd;

  const icon = L.divIcon({
    className: 'campus-marker campus-marker--endpoint',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="${SVG_NS}" role="img" aria-label="${label}">
      <circle cx="14" cy="14" r="9" fill="${ENDPOINT_COLORS[kind]}" stroke="#ffffff" stroke-width="3"/>
    </svg>`,
  });

  endpointIcons.set(key, icon);
  return icon;
}

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
