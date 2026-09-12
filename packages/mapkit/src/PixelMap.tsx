import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { ImageOverlay, MapContainer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { FALLBACK_IMAGE_SIZE, useImageSize } from './useImageSize.js';
import type { ImageSize } from './useImageSize.js';

/** Геометрия подложки, доступная слоям внутри карты. */
export interface PixelMapGeometry {
  /** Размер изображения в пикселях. */
  size: ImageSize;
  /** Границы изображения в системе координат карты. */
  bounds: L.LatLngBounds;
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
 * Подгоняет viewport под границы изображения при каждом их изменении.
 */
function FitToBounds({
  bounds,
  padding,
}: {
  bounds: L.LatLngBounds;
  padding: [number, number];
}) {
  const map = useMap();

  useEffect(() => {
    // fitBounds бросает исключение на ещё не инициализированной карте,
    // например когда контейнер имеет нулевую высоту.
    try {
      map.fitBounds(bounds, { padding });
    } catch {
      /* карта ещё не готова — подгоним на следующем изменении границ */
    }
  }, [map, bounds, padding]);

  return null;
}

export interface PixelMapProps {
  /** URL растровой карты (кампус, этаж корпуса). */
  url: string;

  /** Размер, используемый до загрузки изображения и при ошибке. */
  fallbackSize?: ImageSize;

  /** Минимальный зум. Отрицательный позволяет отдалиться дальше 1:1. */
  minZoom?: number;

  /** Максимальный зум. */
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

  /** Отступ при подгонке viewport, в пикселях. */
  fitPadding?: number;

  className?: string;

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
 * центрирование, подгонку viewport и пересоздание карты при смене плана.
 */
export function PixelMap({
  url,
  fallbackSize = FALLBACK_IMAGE_SIZE,
  minZoom = -2,
  maxZoom = 4,
  zoomControl = false,
  doubleClickZoom = true,
  overlayOpacity = 1,
  constrainToBounds = false,
  fitPadding = 20,
  className = 'w-full h-full',
  children,
}: PixelMapProps) {
  const { width, height } = useImageSize(url, fallbackSize);

  // Границы — реальные объекты Leaflet, а не литералы массивов: иначе
  // ссылка менялась бы на каждом рендере и эффект подгонки зацикливался.
  const bounds = useMemo(() => L.latLngBounds([0, 0], [height, width]), [width, height]);

  const maxBounds = useMemo(
    () =>
      constrainToBounds
        ? L.latLngBounds([-height * 0.2, -width * 0.2], [height * 1.2, width * 1.2])
        : undefined,
    [constrainToBounds, width, height]
  );

  const center = useMemo<[number, number]>(() => [height / 2, width / 2], [width, height]);
  const padding = useMemo<[number, number]>(() => [fitPadding, fitPadding], [fitPadding]);
  const size = useMemo<ImageSize>(() => ({ width, height }), [width, height]);
  const geometry = useMemo<PixelMapGeometry>(() => ({ size, bounds }), [size, bounds]);

  return (
    <MapContainer
      // Пересоздаём карту при смене плана: CRS.Simple фиксирует viewport при
      // инициализации, и без remount границы нового этажа применялись бы
      // только после ручного зума.
      key={url}
      center={center}
      zoom={0}
      minZoom={minZoom}
      maxZoom={maxZoom}
      crs={L.CRS.Simple}
      zoomControl={zoomControl}
      attributionControl={false}
      doubleClickZoom={doubleClickZoom}
      maxBounds={maxBounds}
      maxBoundsViscosity={constrainToBounds ? 0.8 : 0}
      className={className}
    >
      <PixelMapContext.Provider value={geometry}>
        <ImageOverlay url={url} bounds={bounds} opacity={overlayOpacity} />
        <FitToBounds bounds={bounds} padding={padding} />
        {children}
      </PixelMapContext.Provider>
    </MapContainer>
  );
}
