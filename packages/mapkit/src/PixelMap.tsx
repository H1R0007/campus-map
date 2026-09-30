import { useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ImageOverlay, useMap } from 'react-leaflet';
import L from 'leaflet';
import { DEFAULT_INSETS, FILL_PARENT, MapFrameContext, PlanMapContainer, PlanViewport } from './mapFrame.js';
import type { MapFrame, MapInsets } from './mapFrame.js';
import { ensurePane } from './PlacedPlan.js';
import { FALLBACK_IMAGE_SIZE, useImageSize } from './useImageSize.js';
import type { ImageSize } from './useImageSize.js';

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

  /**
   * Pane подложки и его z-index. По умолчанию подложка — в `overlayPane`,
   * вместе с векторными слоями. Своя pane ниже нужна, когда между подложкой и
   * отметками должны лечь другие планы: редактор ставит так корпуса на
   * территорию (запись 50).
   */
  imagePane?: { name: string; zIndex: number };

  className?: string;

  /** Встроенный стиль контейнера; по умолчанию карта заполняет родителя. */
  style?: CSSProperties;

  children?: ReactNode;
}

/**
 * Карта в пиксельной системе координат: растровый план как подложка и
 * произвольные слои поверх.
 *
 * Система координат — пиксели изображения с осью y вниз (`PLAN_CRS`), поэтому
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
  imagePane,
  className,
  style = FILL_PARENT,
  children,
}: PixelMapProps) {
  const { size: imageSize, status } = useImageSize(url, fallbackSize ?? FALLBACK_IMAGE_SIZE);
  const { width, height } = imageSize;

  // Границы — реальные объекты Leaflet, а не литералы массивов: иначе
  // ссылка менялась бы на каждом рендере и эффекты подгонки срабатывали зря.
  const bounds = useMemo(() => L.latLngBounds([0, 0], [height, width]), [width, height]);
  const frame = useMemo<MapFrame>(() => ({ bounds, status }), [bounds, status]);

  // Размер известен, если картинка загрузилась, недоступна (слои всё равно
  // рисуются — в резервных габаритах) или данные прислали подсказку `mapSize`.
  const sizeKnown = status !== 'loading' || fallbackSize !== undefined;

  return (
    <PlanMapContainer
      center={[height / 2, width / 2]}
      maxZoom={maxZoom}
      constrainToBounds={constrainToBounds}
      zoomControl={zoomControl}
      doubleClickZoom={doubleClickZoom}
      className={className}
      style={style}
    >
      <MapFrameContext.Provider value={frame}>
        {/* Пока план грузится, подложка скрыта: иначе прежняя картинка
            растянулась бы на границы нового плана под его узлами. */}
        <Underlay url={url} bounds={bounds} opacity={status === 'ready' ? overlayOpacity : 0} pane={imagePane} />
        <PlanViewport
          bounds={bounds}
          fitKey={fitKey}
          sizeKnown={sizeKnown}
          insets={fitInsets}
          constrainToBounds={constrainToBounds}
        />
        {children}
      </MapFrameContext.Provider>
    </PlanMapContainer>
  );
}

/** Подложка — в своей pane, если её попросили: pane создаётся до слоя. */
function Underlay({ url, bounds, opacity, pane }: { url: string; bounds: L.LatLngBounds; opacity: number; pane?: { name: string; zIndex: number } }) {
  const map = useMap();
  if (pane) ensurePane(map, pane.name, pane.zIndex);
  return <ImageOverlay url={url} bounds={bounds} opacity={opacity} pane={pane?.name ?? 'overlayPane'} />;
}
