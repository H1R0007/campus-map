import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { fitPaddingOf, useMapFrame } from '@campus-map/mapkit';
import type { MapInsets } from '@campus-map/mapkit';
import { useMapView } from '../../hooks/useMapView';
import { useRouteSteps } from '../../hooks/useStepNavigation';
import { useRouteStore } from '../../stores/routeStore';
import { useMapStore } from '../../stores/mapStore';
import { focusBounds, routePoints, routeRuns, stepFocusPoints } from '../../utils/routeGeometry';
import type { RouteRuns } from '../../utils/routeGeometry';
import { fitSoon } from './mapCamera';
import type { LatLngTuple } from '../../utils/routeGeometry';
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
 * Участок маршрута на невидимом этаже холста — просвечивает пунктиром (запись
 * 32). Класс свой, а не модификатор линии: приглушение и подсветка шага его не
 * касаются.
 */
const GHOST_CLASS = 'campus-route-ghost';
const EMPTY_RUNS: RouteRuns = { shown: [], roofed: [], otherFloors: [] };
const GHOST_STYLE = { weight: 3, opacity: 0.8, dashArray: '1 7', lineCap: 'round' as const, lineJoin: 'round' as const };

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

/** То же на холсте, метры: кусок этажа с соседними помещениями. */
const MIN_FOCUS_METERS = 28;

/**
 * Линия маршрута на текущем плане.
 *
 * Помимо отрисовки слой подгоняет вид. В обзоре — под видимую часть маршрута:
 * `PixelMap` при смене плана вписывает весь план, и на плане большого корпуса
 * линия занимала несколько пикселей. На шаге пошаговой навигации — под участок
 * шага с соседними узлами (`stepFocusPoints`), а остальной маршрут приглушён:
 * видно, куда идти сейчас, а не весь путь сразу.
 *
 * На холсте кампуса маршрут — одна линия с территории в здание, а участки на
 * невидимых этажах просвечивают пунктиром (`routeRuns`, запись 32).
 */
export const PathLayer: React.FC = () => {
  const currentRoute = useRouteStore((s) => s.currentRoute);
  const stepIndex = useRouteStore((s) => s.stepIndex);
  const graph = useMapStore((s) => s.graph);
  const view = useMapView();
  const steps = useRouteSteps();

  const map = useMap();
  const { bounds: planBounds } = useMapFrame();

  // Отступы меняются вместе с высотой шторки, но подгонять вид из-за этого
  // нельзя: раскрытие шторки уводило бы карту из приближения. Подгонка берёт
  // текущие отступы в момент, когда меняется то, что нужно показать. Исключение
  // — шторка закрыла весь маршрут, который был виден (эффект ниже).
  const insets = useMapInsets();
  const latestInsets = useRef(insets);
  latestInsets.current = insets;

  const route = currentRoute?.found ? currentRoute : null;
  const step = stepIndex !== null ? steps[stepIndex] : undefined;
  const onCanvas = view.kind === 'canvas';

  const runs = useMemo(
    () => (route && graph ? routeRuns(route.path, graph, view) : EMPTY_RUNS),
    [route, graph, view]
  );
  const segments = runs.shown;

  const stepSegments = useMemo(() => {
    if (!step || !route || !graph) return [];
    const [first, last] = step.pathRange;
    return routeRuns(route.path.slice(first, last + 1), graph, view).shown;
  }, [step, route, graph, view]);

  // Что вписать: участок шага, а без навигации — или если участка на этом
  // плане нет — видимую часть маршрута. На холсте маршрут вписывается целиком:
  // иначе вид менялся бы вместе с тем, какие этажи открыты.
  const focus = useMemo(() => {
    if (step && route && graph) {
      const points = stepFocusPoints(route.path, step.pathRange, graph, view);
      if (points.length > 0) return points;
    }
    if (view.kind === 'canvas') return route && graph ? routePoints(route.path, graph, view) : [];
    return segments.flat();
  }, [step, route, graph, view, segments]);

  // Вид подгоняется, когда то, что нужно показать, действительно изменилось, а
  // не на каждый новый объект маршрута: смена ограничения, не изменившая путь,
  // иначе уводила бы карту из приближения, в котором человек смотрел этаж.
  const focusKey = focus.map((point) => point.join(',')).join(';');
  const latestFocus = useRef(focus);
  latestFocus.current = focus;

  // Вид после автоматической подгонки: по нему видно, двигал ли человек карту сам.
  const autoView = useRef<{ center: L.LatLng; zoom: number } | null>(null);

  const fitFocus = useCallback(
    (points: readonly LatLngTuple[], edges: MapInsets) => {
      const planSpan = Math.max(planBounds.getEast() - planBounds.getWest(), planBounds.getSouth() - planBounds.getNorth());
      const minSpan = onCanvas ? MIN_FOCUS_METERS : planSpan * MIN_FOCUS_SHARE;
      const bounds = L.latLngBounds(focusBounds(points, minSpan));
      fitSoon(map, bounds, { ...fitPaddingOf(edges, ROUTE_MARGIN), maxZoom: map.getMaxZoom() }, () => {
        autoView.current = { center: map.getCenter(), zoom: map.getZoom() };
      });
    },
    [map, planBounds, onCanvas]
  );

  useEffect(() => {
    const points = latestFocus.current;
    if (points.length === 0) return;

    fitFocus(points, latestInsets.current);
    // Границы плана в зависимостях (через `fitFocus`) не случайно: реальный размер плана
    // определяется асинхронно, и при его появлении `PixelMap` заново
    // центрируется на всём изображении. Без повторной подгонки маршрут
    // «уезжал» ровно в тот момент, когда картинка догружалась.
  }, [focusKey, fitFocus]);

  // Раскрытая шторка на телефоне поднимается на две трети экрана и может закрыть
  // весь маршрут: над ней оставалась пустая карта. Если после смены отступов
  // маршрута не видно, вид подгоняется под карту над шторкой — пока человек не
  // двигал карту сам после автоматической подгонки (запись 28). Сравнение — с
  // видом, который поставил навигатор, а не с прежними отступами: шторка растёт
  // по шагам, и промежуточный шаг уже прятал маршрут.
  useEffect(() => {
    const points = latestFocus.current;
    const view = autoView.current;
    if (points.length === 0 || view === null) return;

    const size = map.getSize();
    const drift = map.latLngToContainerPoint(view.center).distanceTo(size.divideBy(2));
    if (Math.abs(map.getZoom() - view.zoom) > 0.05 || drift > 24) return;

    const visible = points.some(([y, x]) => {
      const point = map.latLngToContainerPoint([y, x]);
      return (
        point.x >= insets.left &&
        point.x <= size.x - insets.right &&
        point.y >= insets.top &&
        point.y <= size.y - insets.bottom
      );
    });
    if (!visible) fitFocus(points, insets);
  }, [insets, map, fitFocus]);

  const navigating = step !== undefined;
  // На шаге навигации другие этажи открытого корпуса не просвечивают: они легли
  // бы на коридоры показанного этажа и спутали бы участок шага.
  const ghosts = navigating ? runs.roofed : [...runs.roofed, ...runs.otherFloors];

  if (segments.length === 0 && ghosts.length === 0) return null;

  return (
    <>
      {ghosts.map((positions, index) => (
        <Polyline key={`ghost-${index}`} positions={positions} pathOptions={GHOST_STYLE} className={GHOST_CLASS} />
      ))}
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
