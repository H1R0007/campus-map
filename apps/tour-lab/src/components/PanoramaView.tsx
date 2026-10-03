import { useEffect, useRef, useState } from 'react';
import { Viewer, events } from '@photo-sphere-viewer/core';
import { CompassPlugin } from '@photo-sphere-viewer/compass-plugin';
import { VirtualTourPlugin, events as tourEvents } from '@photo-sphere-viewer/virtual-tour-plugin';
import type { VirtualTourLink, VirtualTourNode } from '@photo-sphere-viewer/virtual-tour-plugin';
import { panoramaLinks } from '@campus-map/core';
import type { Panorama } from '@campus-map/core';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/compass-plugin/index.css';
import '@photo-sphere-viewer/virtual-tour-plugin/index.css';
import { distanceText, linkLabel, planLabel, spotName } from '../tour/describe';
import { imageYaw, panOf, toDegrees, toRadians, worldBearing } from '../tour/frame';
import type { Tour } from '../tour/loadTour';
import { panoramaImage } from '../tour/panoramaSource';

/** Просьба показать снимок: узел и куда смотреть (градусы территории). */
export interface ViewRequest {
  node: string;
  yaw: number | null;
  /** Перечитать узел, даже если он уже открыт: сменились стрелки или направление снимка. */
  reload?: boolean;
  seq: number;
}

interface NodeData {
  pan: number;
  placeholder: boolean;
}

interface LinkData {
  label: string;
  onRoute: boolean;
  /** Стрелка ведёт на другой этаж — лестницей или лифтом. */
  vertical: boolean;
}

/** Переход между снимками: затемнение, и камера плавно доворачивает до нужного угла. */
const TRANSITION = { showLoader: true, speed: '40rpm', effect: 'fade', rotation: true } as const;

/**
 * Переход по стрелке. Как в Street View, взгляд сохраняет направление шага,
 * но после лестницы или лифта это было бы лицом к его дверям: тогда взгляд —
 * от них, как у выходящего, и без доворота — разворот на полкруга посреди
 * затемнения сбивает.
 */
function transitionOptions(toNode: VirtualTourNode, fromNode?: VirtualTourNode, fromLink?: VirtualTourLink) {
  const back = toNode.links?.find((link) => link.nodeId === fromNode?.id);
  if (!(fromLink?.data as LinkData | undefined)?.vertical || !back?.position) return TRANSITION;
  const yaw = (back.position as { yaw: number }).yaw + Math.PI;
  return { ...TRANSITION, rotation: false, rotateTo: { yaw, pitch: 0 } };
}

interface PanoramaViewProps {
  tour: Tour;
  panoramas: ReadonlyMap<string, Panorama>;
  start: string;
  request: ViewRequest | null;
  /** Следующая панорама маршрута для каждой панорамы на нём — её стрелка выделяется. */
  routeNext: ReadonlyMap<string, string>;
  onNode: (node: string, placeholder: boolean) => void;
  /** Куда смотрит человек, градусы территории. */
  onView: (yaw: number) => void;
  /** Щелчок по снимку: угол от середины снимка и угол территории. */
  onImageClick?: (imageDegrees: number, worldDegrees: number) => void;
}

const LANG = {
  zoom: 'Масштаб',
  zoomOut: 'Отдалить',
  zoomIn: 'Приблизить',
  moveUp: 'Вверх',
  moveDown: 'Вниз',
  moveLeft: 'Влево',
  moveRight: 'Вправо',
  description: 'Описание',
  download: 'Скачать',
  fullscreen: 'Во весь экран',
  loading: 'Загрузка снимка…',
  menu: 'Меню',
  close: 'Закрыть',
  twoFingers: 'Двигайте двумя пальцами',
  ctrlZoom: 'Масштаб — Ctrl и колесо мыши',
  loadError: 'Снимок не загрузился',
  webglError: 'Браузер не умеет показывать панорамы (нет WebGL)',
};

/** Стрелка на полу: шеврон, как в Street View. Подпись — для диктора и подсказки. */
function arrowElement(link: VirtualTourLink): HTMLElement {
  const data = link.data as LinkData;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = data.onRoute ? 'tour-arrow tour-arrow--route' : 'tour-arrow';
  button.setAttribute('aria-label', data.onRoute ? `${data.label} — по маршруту` : data.label);
  button.dataset.target = link.nodeId;
  button.innerHTML =
    '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 12 L88 70 L64 70 L50 48 L36 70 L12 70 Z"/></svg>';
  return button;
}

export function PanoramaView(props: PanoramaViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const tourRef = useRef<VirtualTourPlugin | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;

    /** Узел экскурсии по панораме: снимок, поправка сферы и стрелки из графа. */
    async function buildNode(id: string): Promise<VirtualTourNode> {
      const { tour, panoramas, routeNext } = latest.current;
      const panorama = panoramas.get(id);
      const node = tour.graph.getNode(id);
      if (!panorama || !node) throw new Error(`нет панорамы в точке ${id}`);

      const rotation = tour.planRotation(node.building, node.floor) ?? 0;
      const title = spotName(tour, id);
      const image = await panoramaImage(panorama, title);
      // Без направления снимок открывается как есть и без стрелок: куда они
      // смотрят на снимке, неизвестно. Список «Куда отсюда» работает всё равно.
      const pan = panOf(panorama.heading ?? 0, rotation);

      const links: VirtualTourLink[] =
        panorama.heading === null
          ? []
          : panoramaLinks(tour.graph, panoramas, id, { planRotation: tour.planRotation })
              .filter((link) => link.bearing !== null)
              .map((link) => {
                const data: LinkData = {
                  label: [linkLabel(tour, id, link), distanceText(link.distanceMeters)].filter(Boolean).join(' · '),
                  onRoute: routeNext.get(id) === link.target,
                  vertical:
                    (link.transition === 'stairs' || link.transition === 'lift') &&
                    tour.graph.getNode(link.target)?.floor !== node.floor,
                };
                return {
                  nodeId: link.target,
                  position: { yaw: toRadians(worldBearing(link.bearing!, rotation)), pitch: 0 },
                  data,
                };
              });

      const data: NodeData = { pan, placeholder: image.placeholder };
      return {
        id,
        panorama: image.url,
        name: title,
        caption: `${title} · ${planLabel(tour, node)}${image.placeholder ? ' · заглушка: снимка нет' : ''}`,
        // Photo Sphere Viewer кладёт середину снимка на угол −pan, а не +pan:
        // проверено заглушкой-компасом (scripts/check-browser.mjs).
        sphereCorrection: { pan: -toRadians(pan) },
        links,
        data,
      };
    }

    let instance: Viewer | null = null;
    let frame = 0;

    // Просмотрщик создаётся на такт позже: режим разработки React монтирует
    // компонент дважды подряд, а Photo Sphere Viewer 5.15, уничтоженный во
    // время загрузки первого снимка, роняет её необработанной ошибкой.
    const timer = window.setTimeout(() => {
      instance = create(element);
    }, 0);

    function create(target: HTMLDivElement): Viewer {
      const viewer = new Viewer({
        container: target,
        lang: LANG,
        loadingTxt: LANG.loading,
        navbar: ['zoom', 'move', 'caption', 'fullscreen'],
        defaultZoomLvl: 20,
        touchmoveTwoFingers: false,
        mousewheelCtrlKey: false,
        plugins: [
          CompassPlugin.withConfig({ size: '88px', position: 'top right', navigation: false, hotspotColor: '#f2c94c' }),
          VirtualTourPlugin.withConfig({
            dataMode: 'server',
            positionMode: 'manual',
            renderMode: '3d',
            startNodeId: latest.current.start,
            getNode: buildNode,
            preload: true,
            transitionOptions,
            arrowStyle: { element: arrowElement, size: { width: 56, height: 56 } },
            getLinkTooltip: (_content, link) => (link.data as LinkData).label,
          }),
        ],
      });
      viewerRef.current = viewer;
      const plugin = viewer.getPlugin<VirtualTourPlugin>(VirtualTourPlugin);
      tourRef.current = plugin;
      // Для проверок в браузере (scripts/check-browser.mjs): прототип, не продукт.
      window.tourLab = { viewer, plugin };

      plugin.addEventListener(tourEvents.NodeChangedEvent.type, ({ node }) => {
        setError(null);
        latest.current.onNode(node.id, (node.data as NodeData).placeholder);
        latest.current.onView(toDegrees(viewer.getPosition().yaw));
      });

      viewer.addEventListener(events.PositionUpdatedEvent.type, ({ position }) => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          latest.current.onView(toDegrees(position.yaw));
        });
      });

      viewer.addEventListener(events.ClickEvent.type, ({ data }) => {
        const pan = (plugin.getCurrentNode()?.data as NodeData | undefined)?.pan ?? 0;
        const world = toDegrees(data.yaw);
        latest.current.onImageClick?.(imageYaw(world, pan), world);
      });

      viewer.addEventListener(events.PanoramaErrorEvent.type, ({ error: cause }) => {
        setError(`Снимок не загрузился: ${cause.message}`);
      });

      return viewer;
    }

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      if (!instance) return;
      if (window.tourLab?.viewer === instance) delete window.tourLab;
      tourRef.current = null;
      viewerRef.current = null;
      instance.destroy();
    };
  }, []);

  const { request } = props;
  useEffect(() => {
    const plugin = tourRef.current;
    const viewer = viewerRef.current;
    if (!request || !plugin || !viewer) return;

    const rotateTo = request.yaw === null ? viewer.getPosition() : { yaw: toRadians(request.yaw), pitch: 0 };
    const current = plugin.getCurrentNode()?.id;

    if (request.reload) {
      void plugin
        .setCurrentNode(request.node, { forceUpdate: true, effect: 'none', rotation: false, rotateTo, showLoader: false })
        .catch(() => undefined);
    } else if (request.node === current) {
      viewer.animate({ ...rotateTo, speed: '40rpm' });
    } else {
      void plugin
        .setCurrentNode(request.node, { ...TRANSITION, rotateTo })
        .catch(() => undefined);
    }
  }, [request]);

  return (
    <div className="panorama">
      <div ref={container} className="panorama__viewer" data-testid="panorama" />
      {error && (
        <p className="panorama__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
