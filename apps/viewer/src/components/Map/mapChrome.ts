import { useMemo } from 'react';
import type { MapInsets } from '@campus-map/mapkit';
import { useUiStore } from '../../stores/uiStore';
import type { MapObstruction } from '../../stores/uiStore';

/**
 * Постоянный интерфейс над картой, CSS-пиксели: шапка сверху, колонка этажей
 * справа, поля по краям. Числа соответствуют `.campus-map-header` и
 * `.campus-map-rail` в `index.css` и меняются вместе с ними.
 */
const CHROME: MapInsets = Object.freeze({ top: 72, right: 64, bottom: 16, left: 16 });

/** Зазор между краем шторки и вписанным планом. */
const SHEET_GAP = 12;

/**
 * Сколько места по краям карты занимает интерфейс: постоянный плюс шторка.
 *
 * План, маршрут и «показать план целиком» вписываются с этими отступами. Шторку
 * нельзя описать числом: её высота зависит от режима, длины названий и масштаба
 * страницы, а на широком экране она стоит слева. Поэтому она измеряется
 * (`useUiStore().mapObstruction`), а здесь только складывается с постоянной
 * частью.
 */
export function mapInsetsOf(obstruction: MapObstruction): MapInsets {
  return {
    top: CHROME.top,
    right: CHROME.right,
    bottom: obstruction.bottom > 0 ? obstruction.bottom + SHEET_GAP : CHROME.bottom,
    left: obstruction.left > 0 ? obstruction.left + SHEET_GAP : CHROME.left,
  };
}

/** Текущие отступы карты. Объект меняется, только когда меняются числа. */
export function useMapInsets(): MapInsets {
  const obstruction = useUiStore((s) => s.mapObstruction);
  return useMemo(() => mapInsetsOf(obstruction), [obstruction]);
}
