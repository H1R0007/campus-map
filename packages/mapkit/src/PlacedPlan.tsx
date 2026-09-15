import { useContext, useEffect, useId, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { PlanFormat } from '@campus-map/core';
import { planTransform } from './placement.js';
import type { PlanPlacement } from './placement.js';
import { loadPlanContent } from './planContent.js';
import { PlanStatusContext } from './planStatus.js';
import { FALLBACK_IMAGE_SIZE } from './useImageSize.js';
import type { ImageSize, ImageStatus } from './useImageSize.js';

/** Pane планов холста: над фоном карты, под крышами, линиями маршрута и отметками. */
export const PLAN_PANE = 'campusPlans';
const PLAN_PANE_Z_INDEX = 350;

/**
 * Pane Leaflet по имени — создаётся при первом обращении.
 *
 * Слои холста лежат в своих pane: план, загруженный позже маршрута, иначе лёг
 * бы поверх линии — порядок в общем pane задаёт время добавления.
 */
export function ensurePane(map: L.Map, name: string, zIndex: number): HTMLElement {
  const existing = map.getPane(name);
  if (existing) return existing;

  const pane = map.createPane(name);
  pane.style.zIndex = String(zIndex);
  return pane;
}

/**
 * Слой Leaflet: план, поставленный на территорию по привязке.
 *
 * `ImageOverlay` умеет только прямоугольник вдоль осей, а корпуса стоят под
 * углом. Слой держит элемент плана размером в пиксели изображения и ставит его
 * CSS-преобразованием (`planTransform`) — на каждое изменение масштаба и в
 * анимацию масштаба, как это делает сам `ImageOverlay`.
 */
class PlacedPlanLayer extends L.Layer {
  private readonly container: HTMLDivElement;
  /**
   * Обёртка содержимого. У самого элемента плана прозрачность занята показом и
   * скрытием (смена этажа), а приложению нужна своя — например, проявление
   * этажа вместо крыши. Обёртка постоянна: содержимое внутри меняется.
   */
  private readonly content: HTMLDivElement;
  private map: L.Map | null = null;

  constructor(
    private placement: PlanPlacement,
    className: string
  ) {
    super();
    this.container = L.DomUtil.create('div', `campus-placed-plan ${className}`);
    Object.assign(this.container.style, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0', pointerEvents: 'none' });
    this.content = L.DomUtil.create('div', 'campus-placed-plan__content', this.container);
  }

  override onAdd(map: L.Map): this {
    this.map = map;
    // Приватное поле Leaflet: анимация масштаба включена и браузер её умеет.
    const animated = (map as unknown as { _zoomAnimated: boolean })._zoomAnimated;
    this.container.classList.add(animated ? 'leaflet-zoom-animated' : 'leaflet-zoom-hide');
    this.getPane()?.appendChild(this.container);

    map.on('zoom viewreset', this.reset, this);
    map.on('zoomstart', this.beginZoom, this);
    map.on('zoomend', this.endZoom, this);
    if (animated) map.on('zoomanim', this.animateZoom, this);
    this.reset();
    return this;
  }

  override onRemove(map: L.Map): this {
    map.off('zoom viewreset', this.reset, this);
    map.off('zoomstart', this.beginZoom, this);
    map.off('zoomend', this.endZoom, this);
    map.off('zoomanim', this.animateZoom, this);
    this.container.remove();
    this.map = null;
    return this;
  }

  get element(): HTMLDivElement {
    return this.container;
  }

  get hasContent(): boolean {
    return this.content.childElementCount > 0;
  }

  setContent(element: Element | null, size: ImageSize): void {
    this.content.replaceChildren(...(element ? [element] : []));
    this.container.style.width = `${size.width}px`;
    this.container.style.height = `${size.height}px`;
  }

  setPlacement(placement: PlanPlacement): void {
    this.placement = placement;
    this.reset();
  }

  // На время масштаба план — отдельный слой браузера: изображение масштабируется
  // готовым. Когда движение закончилось, слой снимается, и браузер рисует план
  // резко в новом масштабе; постоянный слой оставлял бы его размытым.
  private beginZoom(): void {
    this.container.style.willChange = 'transform';
  }

  private endZoom(): void {
    this.container.style.willChange = '';
  }

  private origin(): L.LatLng {
    return L.latLng(this.placement.originMeters.y, this.placement.originMeters.x);
  }

  private reset(): void {
    if (!this.map) return;
    const origin = this.map.latLngToLayerPoint(this.origin());
    this.container.style.transform = planTransform(origin, this.map.getZoomScale(this.map.getZoom(), 0), this.placement);
  }

  private animateZoom(event: L.ZoomAnimEvent): void {
    if (!this.map) return;
    // Тот же приватный расчёт, что у `ImageOverlay`: положение точки на слое при
    // целевом масштабе и центре анимации.
    const toLayerPoint = (this.map as unknown as {
      _latLngToNewLayerPoint(latlng: L.LatLng, zoom: number, center: L.LatLng): L.Point;
    })._latLngToNewLayerPoint.bind(this.map);
    const origin = toLayerPoint(this.origin(), event.zoom, event.center);
    this.container.style.transform = planTransform(origin, this.map.getZoomScale(event.zoom, 0), this.placement);
  }
}

export interface PlacedPlanProps {
  url: string;
  format: PlanFormat;
  placement: PlanPlacement;
  /** Размер из метаданных — пока план грузится и для SVG без размеров. */
  fallbackSize?: ImageSize;
  /** Стиль, вписываемый в SVG-план перед показом, — например, тёмная тема (запись 35). */
  svgStyle?: string;
  /**
   * Показан ли план. Скрытый план остаётся на карте прозрачным: повторный показ
   * не грузит его заново, а смена видимости плавная (переход — в CSS приложения).
   */
  visible?: boolean;
  /**
   * Сообщать ли холсту состояние загрузки. По умолчанию — пока план показан; план,
   * загруженный заранее и ещё прозрачный, «План загружается» не вызывает.
   */
  reportStatus?: boolean;
  /** Классы элемента плана: по ним приложение оформляет планы. */
  className?: string;
  /** Pane Leaflet; по умолчанию — `PLAN_PANE`, под линиями и отметками. Свой pane создаёт вызывающий. */
  pane?: string;
  /** Атрибуты `data-*` элемента плана — для сценариев и отладки. */
  data?: Readonly<Record<string, string>>;
}

/**
 * План на холсте кампуса (`WorldMap`) — изображение, растровое или SVG.
 *
 * Состояние загрузки видимого плана сообщается холсту: «План загружается» и
 * «План недоступен» относятся к тому, что человек сейчас видит.
 */
export function PlacedPlan({
  url,
  format,
  placement,
  fallbackSize = FALLBACK_IMAGE_SIZE,
  svgStyle = '',
  visible = true,
  reportStatus = visible,
  className = '',
  pane = PLAN_PANE,
  data,
}: PlacedPlanProps) {
  const map = useMap();
  const id = useId();
  const report = useContext(PlanStatusContext);
  const [layer] = useState(() => new PlacedPlanLayer(placement, className));
  const [status, setStatus] = useState<ImageStatus>('loading');
  const fallback = useRef(fallbackSize);
  fallback.current = fallbackSize;
  const loadedUrl = useRef<string | null>(null);

  useEffect(() => {
    if (pane === PLAN_PANE) ensurePane(map, PLAN_PANE, PLAN_PANE_Z_INDEX);
    layer.options.pane = pane;
    layer.addTo(map);
    return () => {
      layer.remove();
    };
  }, [layer, map, pane]);

  const { metersPerPixel, rotationDeg } = placement;
  const { x, y } = placement.originMeters;
  useEffect(() => {
    layer.setPlacement({ metersPerPixel, rotationDeg, originMeters: { x, y } });
  }, [layer, metersPerPixel, rotationDeg, x, y]);

  useEffect(() => {
    let cancelled = false;
    // Тот же план в новом стиле (сменилась тема) остаётся на месте, пока новый
    // не готов, — без мигания пустым листом. Другой план — прежний убирается.
    if (loadedUrl.current !== url || !layer.hasContent) {
      setStatus('loading');
      layer.setContent(null, fallback.current);
    }

    loadPlanContent(url, format, fallback.current, svgStyle).then(
      (content) => {
        if (cancelled) return;
        layer.setContent(content.element, content.size);
        loadedUrl.current = url;
        setStatus('ready');
      },
      () => {
        if (!cancelled) setStatus('error');
      }
    );
    return () => {
      cancelled = true;
    };
  }, [layer, url, format, svgStyle]);

  useEffect(() => {
    const element = layer.element;
    element.className = `campus-placed-plan ${className}`;
    element.dataset.visible = String(visible);
    element.style.opacity = visible && status === 'ready' ? '' : '0';
    for (const [key, value] of Object.entries(data ?? {})) element.dataset[key] = value;
  }, [layer, className, visible, status, data]);

  useEffect(() => {
    if (!reportStatus || report === null) return;
    return report(id, status);
  }, [report, id, reportStatus, status]);

  return null;
}
