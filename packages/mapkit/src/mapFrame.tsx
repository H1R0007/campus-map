import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { MapContainer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { SmoothCamera, isMapMoving } from './smoothCamera.js';
import type { ImageStatus } from './useImageSize.js';

/**
 * Общая часть карт mapkit: система координат с осью y вниз, подгонка вида под
 * интерфейс поверх карты, пределы масштаба и прокрутки.
 *
 * `PixelMap` показывает один план в пикселях изображения, `WorldMap` — холст
 * кампуса в метрах (запись 31). Единица у них разная, а поведение карты одно,
 * поэтому оно живёт здесь в одном экземпляре.
 */

/** Что знают о карте слои внутри неё. */
export interface MapFrame {
  /** Границы содержимого: план у `PixelMap`, территория с корпусами у `WorldMap`. */
  bounds: L.LatLngBounds;
  /** Загружены ли показанные планы: по нему слои показывают индикатор или заглушку. */
  status: ImageStatus;
}

export const MapFrameContext = createContext<MapFrame | null>(null);

/**
 * Границы и состояние карты.
 *
 * Слоям регулярно нужны габариты содержимого — например, чтобы «показать план
 * целиком». Пробрасывать их пропсами через каждый слой неудобно, а хардкодить
 * нельзя: размеры планов разные и изменятся вместе с официальными планами.
 *
 * @throws при вызове вне `PixelMap` и `WorldMap`
 */
export function useMapFrame(): MapFrame {
  const frame = useContext(MapFrameContext);
  if (frame === null) {
    throw new Error('useMapFrame должен вызываться внутри <PixelMap> или <WorldMap>');
  }
  return frame;
}

/** Отступы от краёв карты, CSS-пиксели: сколько места занимает интерфейс поверх неё. */
export interface MapInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Отступы для `fitBounds` из отступов по сторонам.
 *
 * Интерфейс поверх карты несимметричен — шапка сверху, карточка снизу,
 * колонка справа, — и одно число отступа вписывало план под них.
 *
 * @param extra добавка со всех сторон, например чтобы линия маршрута не
 *        касалась края интерфейса
 */
export function fitPaddingOf(
  insets: MapInsets,
  extra = 0
): Pick<L.FitBoundsOptions, 'paddingTopLeft' | 'paddingBottomRight'> {
  return {
    paddingTopLeft: [insets.left + extra, insets.top + extra],
    paddingBottomRight: [insets.right + extra, insets.bottom + extra],
  };
}

/** На какую долю своего размера план можно увести за край экрана. */
const PAN_MARGIN = 0.2;

/**
 * Шаг, до которого округляется нижний предел масштаба. Сам масштаб карты — без
 * ступенек (`zoomSnap: 0`): целые уровни Leaflet по умолчанию вписывали план до
 * двух раз мельче доступного места, а ступеньки делали жесты рывками.
 */
const ZOOM_SNAP = 0.1;

/** Насколько можно отдалиться сверх плана, вписанного целиком, — уровней масштаба. */
const ZOOM_OUT_MARGIN = 1;

/**
 * Система координат карт: единица — пиксель изображения у `PixelMap` и метр
 * территории у `WorldMap`, ось y направлена вниз.
 *
 * В `L.CRS.Simple` широта растёт вверх, а узлы рисуются как `[y, x]`: узел у
 * верхнего края картинки оказывался внизу, и план был перевёрнут относительно
 * своих координат — в обоих приложениях. Формат данных, привязка к метрике
 * (`projection.ts`) и README считают ось y направленной вниз от левого
 * верхнего угла, как у изображения. На заглушках это было не видно, но
 * разметка официального плана дала бы зеркальные метры, а стрелка «вверх» в
 * редакторе двигала узел вниз.
 */
export const PLAN_CRS: L.CRS = L.extend({}, L.CRS.Simple, {
  transformation: new L.Transformation(1, 0, 1, 0),
});

/** Размер контейнера по умолчанию — весь родитель, без CSS-фреймворка приложения. */
export const FILL_PARENT: CSSProperties = Object.freeze({ width: '100%', height: '100%' });

export const DEFAULT_INSETS: MapInsets = Object.freeze({ top: 20, right: 20, bottom: 20, left: 20 });

/**
 * Масштаб, при котором план целиком помещается в свободную часть карты.
 *
 * В `CRS.Simple` уровень `z` — это `2^z` экранных пикселей на единицу карты:
 * пиксель плана или метр территории.
 * Считается напрямую, а не через `map.getBoundsZoom`: тот ограничивает
 * результат текущим `minZoom`, а именно его здесь и нужно найти.
 *
 * @returns `null`, пока у карты нет места (нулевой контейнер)
 */
function wholePlanZoom(map: L.Map, bounds: L.LatLngBounds, insets: MapInsets): number | null {
  const size = map.getSize();
  const freeWidth = size.x - insets.left - insets.right;
  const freeHeight = size.y - insets.top - insets.bottom;
  const planWidth = bounds.getEast() - bounds.getWest();
  const planHeight = Math.abs(bounds.getNorth() - bounds.getSouth());

  if (freeWidth <= 0 || freeHeight <= 0 || planWidth <= 0 || planHeight <= 0) return null;

  return Math.log2(Math.min(freeWidth / planWidth, freeHeight / planHeight));
}

/** Самый мелкий разрешённый масштаб: план целиком и запас на отдаление. */
function lowestZoom(map: L.Map, bounds: L.LatLngBounds, insets: MapInsets): number | null {
  const zoom = wholePlanZoom(map, bounds, insets);
  return zoom === null ? null : Math.floor(zoom / ZOOM_SNAP) * ZOOM_SNAP - ZOOM_OUT_MARGIN;
}

export interface PlanViewportProps {
  bounds: L.LatLngBounds;
  fitKey: string;
  sizeKnown: boolean;
  insets: MapInsets;
  constrainToBounds: boolean;
}

/**
 * Пределы и вид карты при смене плана — на живом экземпляре карты.
 *
 * `MapContainer` применяет центр, зум и `maxBounds` только при создании.
 * Поэтому раньше карта пересоздавалась на каждый план (`key={url}`): терялись
 * масштаб и положение, слои монтировались заново, а до загрузки картинки вид
 * перескакивал дважды — на резервные габариты и на настоящие. Теперь
 * экземпляр один, а границы меняются вызовами Leaflet. На этом же держится
 * холст кампуса (`WorldMap`): зум с территории в корпус без пересоздания.
 */
export function PlanViewport({ bounds, fitKey, sizeKnown, insets, constrainToBounds }: PlanViewportProps) {
  const map = useMap();
  const fittedKey = useRef<string | null>(null);

  // Пределы прокрутки — план с запасом и ещё место под интерфейс поверх карты.
  // Раньше запас был только долей плана, и когда слева стоит панель на полэкрана
  // (телефон лёжа), маршрут у левого края плана нельзя было вывести из-под неё:
  // карту не пускало дальше. Запас под интерфейс — его отступы в пикселях плана
  // при самом мелком разрешённом масштабе (`lowestZoom`): при любом другом тех же
  // пикселей экрана хватает с избытком. При масштабе «план целиком» запаса не
  // хватало — подгонка под узкую полосу над раскрытой шторкой отдаляет сильнее, и
  // пределы тут же возвращали маршрут под шторку.
  useEffect(() => {
    if (!constrainToBounds) return;

    const update = () => {
      const lowest = lowestZoom(map, bounds, insets);
      const planPerScreenPixel = lowest === null ? 0 : 2 ** -lowest;
      const width = bounds.getEast() - bounds.getWest();
      const height = bounds.getNorth() - bounds.getSouth();

      // Ось y плана направлена вниз (`PLAN_CRS`): южная граница — верх экрана.
      const limits = L.latLngBounds(
        [
          bounds.getSouth() - height * PAN_MARGIN - insets.top * planPerScreenPixel,
          bounds.getWest() - width * PAN_MARGIN - insets.left * planPerScreenPixel,
        ],
        [
          bounds.getNorth() + height * PAN_MARGIN + insets.bottom * planPerScreenPixel,
          bounds.getEast() + width * PAN_MARGIN + insets.right * planPerScreenPixel,
        ]
      );

      // Пределы меняются вместе с местом под картой — раскрылась шторка, закрылся
      // поиск, — и `setMaxBounds` сразу прокручивал вид в новые пределы. Такая
      // прокрутка останавливала перелёт камеры на старте (запись 33). Новые
      // пределы соблюдаются по окончании движения, как и прежде.
      if (map.options.maxBounds) map.options.maxBounds = limits;
      else map.setMaxBounds(limits);
    };

    update();
    map.on('resize', update);
    return () => {
      map.off('resize', update);
    };
  }, [map, bounds, constrainToBounds, insets]);

  // Нижний предел масштаба — от плана и экрана, а не одно число на все планы.
  // Прежний `minZoom = -2` не давал вписать план территории шире 1500 px в
  // телефон, а официальные планы в разы больше; маленький план при том же
  // пределе можно было отдалить до точки. Эффект объявлен раньше подгонки:
  // `fitBounds` ограничивает масштаб текущим пределом.
  useEffect(() => {
    const update = () => {
      const lowest = lowestZoom(map, bounds, insets);
      if (lowest === null) return;

      // Предел ставится без движения карты. `setMinZoom` поднимал масштаб ниже
      // предела анимацией, в конце которой Leaflet возвращал прежний масштаб
      // поверх подгонки вида, а любое движение останавливало бы перелёт камеры
      // (записи 32 и 33). Масштаб ниже нового предела поднимается, когда карта
      // остановилась.
      map.options.minZoom = lowest;
      map.fire('zoomlevelschange');
      const clamp = () => {
        if (map.getZoom() < map.getMinZoom()) map.setZoom(map.getMinZoom(), { animate: false });
      };
      if (isMapMoving(map)) map.once('moveend', clamp);
      else clamp();
    };

    update();
    map.on('resize', update);
    return () => {
      map.off('resize', update);
    };
  }, [map, bounds, insets]);

  useEffect(() => {
    // Подгоняется смена ключа, а не каждое изменение границ: этаж того же
    // корпуса открывается в прежнем масштабе и на прежнем месте. Пока размер
    // плана неизвестен, подгонять не к чему — вид прыгнул бы второй раз после
    // загрузки картинки.
    if (!sizeKnown || fittedKey.current === fitKey) return;

    try {
      map.fitBounds(bounds, { ...fitPaddingOf(insets), animate: false });
      fittedKey.current = fitKey;
    } catch {
      // fitBounds бросает исключение на карте с нулевым размером контейнера.
      // Ключ не запоминается, и подгонка повторится при следующем изменении.
    }
  }, [map, bounds, fitKey, sizeKnown, insets]);

  return null;
}

interface PlanMapContainerProps {
  center: L.LatLngTuple;
  maxZoom: number;
  constrainToBounds: boolean;
  zoomControl: boolean;
  doubleClickZoom: boolean;
  className?: string;
  style: CSSProperties;
  children: ReactNode;
}

/**
 * `MapContainer` с настройками, общими для обеих карт: система координат, шаг
 * масштаба, анимации с учётом системной настройки.
 */
export function PlanMapContainer({
  center,
  maxZoom,
  constrainToBounds,
  zoomControl,
  doubleClickZoom,
  className,
  style,
  children,
}: PlanMapContainerProps) {
  // Кто попросил систему не анимировать интерфейс, получает карту без
  // затухания; плавная камера проверяет настройку сама — пролёт к маршруту у
  // части людей вызывает головокружение. Опции Leaflet применяются при создании
  // карты, поэтому настройка читается один раз.
  const animate = useMemo(
    () => !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
    []
  );

  return (
    <MapContainer
      // Начальный вид — до первой подгонки в `PlanViewport`.
      center={center}
      zoom={0}
      maxZoom={maxZoom}
      // Масштаб без ступенек и без CSS-анимации Leaflet: камера движется
      // покадрово (`SmoothCamera`, запись 33).
      zoomSnap={0}
      zoomAnimation={false}
      markerZoomAnimation={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      fadeAnimation={animate}
      crs={PLAN_CRS}
      zoomControl={zoomControl}
      attributionControl={false}
      maxBoundsViscosity={constrainToBounds ? 0.8 : 0}
      className={className}
      style={style}
    >
      <SmoothCamera doubleClickZoom={doubleClickZoom} />
      {children}
    </MapContainer>
  );
}
