import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ImageOverlay, MapContainer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { FALLBACK_IMAGE_SIZE, useImageSize } from './useImageSize.js';
import type { ImageSize, ImageStatus } from './useImageSize.js';

/** Геометрия подложки, доступная слоям внутри карты. */
export interface PixelMapGeometry {
  /** Размер изображения в пикселях. */
  size: ImageSize;
  /** Границы изображения в системе координат карты. */
  bounds: L.LatLngBounds;
  /** Загружен ли план: по нему слои показывают индикатор или заглушку. */
  status: ImageStatus;
}

/** Отступы от краёв карты, CSS-пиксели: сколько места занимает интерфейс поверх неё. */
export interface MapInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const PixelMapContext = createContext<PixelMapGeometry | null>(null);

/**
 * Геометрия текущей подложки.
 *
 * Слоям карты регулярно нужно знать габариты плана — например, чтобы
 * «сбросить вид» на весь этаж. Пробрасывать их пропсами через каждый слой
 * неудобно, а хардкодить координаты нельзя: размеры планов этажей разные и
 * изменятся вместе с официальными ассетами.
 *
 * @throws при вызове вне {@link PixelMap}.
 */
export function usePixelMapGeometry(): PixelMapGeometry {
  const geometry = useContext(PixelMapContext);
  if (geometry === null) {
    throw new Error('usePixelMapGeometry должен вызываться внутри <PixelMap>');
  }
  return geometry;
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
 * Шаг масштаба при подгонке и жестах.
 *
 * Целые уровни — значение Leaflet по умолчанию — вписывали план до двух раз
 * мельче доступного места; шаг в четверть уровня на мелких масштабах всё ещё
 * отнимал десятую часть ширины телефона. Кнопки масштаба по-прежнему шагают на
 * целый уровень.
 */
const ZOOM_SNAP = 0.1;

/** Насколько можно отдалиться сверх плана, вписанного целиком, — уровней масштаба. */
const ZOOM_OUT_MARGIN = 1;

/** Размер контейнера по умолчанию — весь родитель, без CSS-фреймворка приложения. */
const FILL_PARENT: CSSProperties = Object.freeze({ width: '100%', height: '100%' });

const DEFAULT_INSETS: MapInsets = Object.freeze({ top: 20, right: 20, bottom: 20, left: 20 });

/**
 * Масштаб, при котором план целиком помещается в свободную часть карты.
 *
 * В `CRS.Simple` уровень `z` — это `2^z` экранных пикселей на пиксель плана.
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

interface PlanViewportProps {
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
 * будущая непрерывная карта: зум с территории в корпус без пересоздания.
 */
function PlanViewport({ bounds, fitKey, sizeKnown, insets, constrainToBounds }: PlanViewportProps) {
  const map = useMap();
  const fittedKey = useRef<string | null>(null);

  useEffect(() => {
    if (constrainToBounds) map.setMaxBounds(bounds.pad(PAN_MARGIN));
  }, [map, bounds, constrainToBounds]);

  // Нижний предел масштаба — от плана и экрана, а не одно число на все планы.
  // Прежний `minZoom = -2` не давал вписать план территории шире 1500 px в
  // телефон, а официальные планы в разы больше; маленький план при том же
  // пределе можно было отдалить до точки. Эффект объявлен раньше подгонки:
  // `fitBounds` ограничивает масштаб текущим пределом.
  useEffect(() => {
    const update = () => {
      const zoom = wholePlanZoom(map, bounds, insets);
      if (zoom !== null) map.setMinZoom(Math.floor(zoom / ZOOM_SNAP) * ZOOM_SNAP - ZOOM_OUT_MARGIN);
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

export interface PixelMapProps {
  /** URL растровой карты (кампус, этаж корпуса). */
  url: string;

  /**
   * Размер плана из данных — до загрузки изображения.
   *
   * С подсказкой вид подгоняется сразу; без неё — после загрузки картинки.
   */
  fallbackSize?: ImageSize;

  /**
   * Когда подгонять вид под план целиком: при смене этого ключа.
   *
   * Смена плана с тем же ключом сохраняет масштаб и положение. По умолчанию —
   * URL, то есть каждый план открывается целиком; навигатор передаёт корпус,
   * чтобы этажи одного здания листались на месте.
   */
  fitKey?: string;

  /** Максимальный зум. Минимальный считается от размера плана и экрана. */
  maxZoom?: number;

  /** Показывать ли штатные кнопки зума Leaflet. */
  zoomControl?: boolean;

  /** Разрешён ли зум двойным кликом. В редакторе мешал выделению. */
  doubleClickZoom?: boolean;

  /** Прозрачность подложки. Редактор приглушает её, чтобы узлы читались. */
  overlayOpacity?: number;

  /**
   * Ограничивать ли панорамирование пределами изображения.
   * Навигатор включает, чтобы пользователь не «уезжал» в пустоту;
   * редактору нужна свобода для разметки за пределами плана.
   */
  constrainToBounds?: boolean;

  /** Сколько места по краям занимает интерфейс поверх карты — план вписывается внутрь. */
  fitInsets?: MapInsets;

  className?: string;

  /** Встроенный стиль контейнера; по умолчанию карта заполняет родителя. */
  style?: CSSProperties;

  children?: ReactNode;
}

/**
 * Карта в пиксельной системе координат: растровый план как подложка и
 * произвольные слои поверх.
 *
 * Использует `L.CRS.Simple`, где единица равна пикселю изображения, поэтому
 * координаты узлов из `graph.json` ложатся на план без пересчёта.
 *
 * Компонент закрывает всю обвязку, которая раньше была скопирована в
 * навигатор и редактор: определение размера картинки, построение границ,
 * подгонку viewport и смену плана.
 */
export function PixelMap({
  url,
  fallbackSize,
  fitKey = url,
  maxZoom = 4,
  zoomControl = false,
  doubleClickZoom = true,
  overlayOpacity = 1,
  constrainToBounds = false,
  fitInsets = DEFAULT_INSETS,
  className,
  style = FILL_PARENT,
  children,
}: PixelMapProps) {
  const { size: imageSize, status } = useImageSize(url, fallbackSize ?? FALLBACK_IMAGE_SIZE);
  const { width, height } = imageSize;

  // Границы — реальные объекты Leaflet, а не литералы массивов: иначе
  // ссылка менялась бы на каждом рендере и эффекты подгонки срабатывали зря.
  const bounds = useMemo(() => L.latLngBounds([0, 0], [height, width]), [width, height]);
  const size = useMemo<ImageSize>(() => ({ width, height }), [width, height]);
  const geometry = useMemo<PixelMapGeometry>(() => ({ size, bounds, status }), [size, bounds, status]);

  // Размер известен, если картинка загрузилась, недоступна (слои всё равно
  // рисуются — в резервных габаритах) или данные прислали подсказку `mapSize`.
  const sizeKnown = status !== 'loading' || fallbackSize !== undefined;

  return (
    <MapContainer
      // Начальный вид — до первой подгонки в `PlanViewport`.
      center={[height / 2, width / 2]}
      zoom={0}
      maxZoom={maxZoom}
      zoomSnap={ZOOM_SNAP}
      crs={L.CRS.Simple}
      zoomControl={zoomControl}
      attributionControl={false}
      doubleClickZoom={doubleClickZoom}
      maxBoundsViscosity={constrainToBounds ? 0.8 : 0}
      className={className}
      style={style}
    >
      <PixelMapContext.Provider value={geometry}>
        {/* Пока план грузится, подложка скрыта: иначе прежняя картинка
            растянулась бы на границы нового плана под его узлами. */}
        <ImageOverlay url={url} bounds={bounds} opacity={status === 'ready' ? overlayOpacity : 0} />
        <PlanViewport
          bounds={bounds}
          fitKey={fitKey}
          sizeKnown={sizeKnown}
          insets={fitInsets}
          constrainToBounds={constrainToBounds}
        />
        {children}
      </PixelMapContext.Provider>
    </MapContainer>
  );
}
