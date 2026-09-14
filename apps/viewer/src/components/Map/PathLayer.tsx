import React, { useEffect, useMemo, useRef } from 'react';
import { Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { fitPaddingOf, usePixelMapGeometry } from '@campus-map/mapkit';
import { useRouteSteps } from '../../hooks/useStepNavigation';
import { useRouteStore } from '../../stores/routeStore';
import { scopeOf, useMapStore } from '../../stores/mapStore';
import { focusBounds, stepFocusPoints, visiblePolylines } from '../../utils/routeGeometry';
import { useMapInsets } from './mapChrome';

/**
 * Оформление линии маршрута. Цвет задаёт класс `ROUTE_CLASS` из токенов темы
 * (`index.css`): атрибут SVG `stroke` не понимает CSS-переменных.
 */
const ROUTE_STYLE = {
  weight: 4,
  opacity: 0.85,
  lineCap: 'round' as const,
  lineJoin: 'round' as const,
};

/** Участок текущего шага — толще и без прозрачности, поверх приглушённого маршрута. */
const STEP_STYLE = { ...ROUTE_STYLE, weight: 6, opacity: 1 };

/** Класс линии маршрута в `index.css`. */
const ROUTE_CLASS = 'campus-route-line';

/** Приглушённый маршрут на шаге навигации — класс в `index.css`. */
const MUTED_CLASS = 'campus-route-line--muted';

/**
 * Запас вокруг маршрута сверх места под интерфейс, пиксели экрана: начало и
 * конец линии не должны прилипать к шапке и карточке.
 */
const ROUTE_MARGIN = 32;

/**
 * Самый маленький участок плана, под который подгоняется карта, — доля большей
 * стороны плана (`focusBounds`). Короткий шаг иначе приближал план до предела.
 * Число подобрано по тестовым планам: на телефоне остаётся виден кусок этажа с
 * соседними помещениями; с официальными планами его стоит пересмотреть.
 */
const MIN_FOCUS_SHARE = 0.4;

/**
 * Линия маршрута на текущем плане.
 *
 * Помимо отрисовки слой подгоняет вид. В обзоре — под видимую часть маршрута:
 * `PixelMap` при смене плана вписывает весь план, и на плане большого корпуса
 * линия занимала несколько пикселей. На шаге пошаговой навигации — под участок
 * шага с соседними узлами (`stepFocusPoints`), а остальной маршрут приглушён:
 * видно, куда идти сейчас, а не весь путь сразу.
 */
export const PathLayer: React.FC = () => {
  const currentRoute = useRouteStore((s) => s.currentRoute);
  const stepIndex = useRouteStore((s) => s.stepIndex);
  const graph = useMapStore((s) => s.graph);
  const activeFloor = useMapStore((s) => s.activeFloor);
  const steps = useRouteSteps();

  const map = useMap();
  const geometry = usePixelMapGeometry();

  // Отступы меняются вместе с высотой шторки, но подгонять вид из-за этого
  // нельзя: раскрытие шторки уводило бы карту из приближения. Подгонка берёт
  // текущие отступы в момент, когда меняется то, что нужно показать.
  const insets = useMapInsets();
  const latestInsets = useRef(insets);
  latestInsets.current = insets;

  const scope = useMemo(() => scopeOf(activeFloor), [activeFloor]);
  const route = currentRoute?.found ? currentRoute : null;
  const step = stepIndex !== null ? steps[stepIndex] : undefined;

  const segments = useMemo(
    () => (route && graph ? visiblePolylines(route.path, graph, scope) : []),
    [route, graph, scope]
  );

  const stepSegments = useMemo(() => {
    if (!step || !route || !graph) return [];
    const [first, last] = step.pathRange;
    return visiblePolylines(route.path.slice(first, last + 1), graph, scope);
  }, [step, route, graph, scope]);

  // Что вписать: участок шага, а без навигации — или если участка на этом
  // плане нет — видимую часть маршрута.
  const focus = useMemo(() => {
    if (step && route && graph) {
      const points = stepFocusPoints(route.path, step.pathRange, graph, scope);
      if (points.length > 0) return points;
    }
    return segments.flat();
  }, [step, route, graph, scope, segments]);

  // Вид подгоняется, когда то, что нужно показать, действительно изменилось, а
  // не на каждый новый объект маршрута: смена ограничения, не изменившая путь,
  // иначе уводила бы карту из приближения, в котором человек смотрел этаж.
  const focusKey = focus.map((point) => point.join(',')).join(';');
  const latestFocus = useRef(focus);
  latestFocus.current = focus;

  useEffect(() => {
    const points = latestFocus.current;
    if (points.length === 0) return;

    const { width, height } = geometry.size;
    const bounds = L.latLngBounds(focusBounds(points, Math.max(width, height) * MIN_FOCUS_SHARE));
    map.fitBounds(bounds, { ...fitPaddingOf(latestInsets.current, ROUTE_MARGIN), maxZoom: map.getMaxZoom() });
    // `geometry.size` в зависимостях не случайно: реальный размер плана
    // определяется асинхронно, и при его появлении `PixelMap` заново
    // центрируется на всём изображении. Без повторной подгонки маршрут
    // «уезжал» ровно в тот момент, когда картинка догружалась.
  }, [focusKey, map, geometry.size]);

  if (segments.length === 0) return null;

  const navigating = step !== undefined;

  return (
    <>
      {segments.map((positions, index) => (
        // Класс Leaflet ставит только при создании пути, поэтому режим входит в
        // ключ: переход в навигацию пересоздаёт линию с приглушённым классом.
        // Класс — отдельным пропом, а не в `pathOptions`: из `pathOptions`
        // react-leaflet применяет только стиль, и класс молча не доходил до SVG.
        <Polyline
          key={`${navigating ? 'muted' : 'route'}-${index}`}
          positions={positions}
          pathOptions={ROUTE_STYLE}
          className={navigating ? `${ROUTE_CLASS} ${MUTED_CLASS}` : ROUTE_CLASS}
        />
      ))}
      {stepSegments.map((positions, index) => (
        <Polyline key={`step-${stepIndex}-${index}`} positions={positions} pathOptions={STEP_STYLE} className={ROUTE_CLASS} />
      ))}
    </>
  );
};
