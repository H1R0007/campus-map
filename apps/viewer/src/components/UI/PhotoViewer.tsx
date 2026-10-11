import React, { useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent, WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import type { PointPhoto } from '@campus-map/core';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useOnline } from '../../hooks/useOnline';
import { useMessages } from '../../i18n';
import { containSize, photoSrc } from '../../utils/photos';
import { Icon } from './Icon';

/** Крупнее четырёх раз фото только расплывается. */
const MAX_SCALE = 4;

/** Двойное касание и кнопка «+» увеличивают во столько раз. */
const ZOOM_STEP = 2;

/** Сдвиг пальца вбок, после которого фото листается, px. */
const SWIPE_PX = 60;

/** Сдвиг пальца вниз, после которого просмотр закрывается, px. */
const CLOSE_SWIPE_PX = 100;

/** Два касания не дальше этого времени и расстояния — двойное касание. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;

interface Zoom {
  scale: number;
  x: number;
  y: number;
}

const FIT: Zoom = { scale: 1, x: 0, y: 0 };

type Gesture =
  | { kind: 'pinch'; distance: number; mid: Point; start: Zoom }
  | { kind: 'pan'; from: Point; start: Zoom }
  | { kind: 'swipe'; from: Point };

interface Point {
  x: number;
  y: number;
}

interface PhotoViewerProps {
  photos: readonly PointPhoto[];
  startIndex?: number;
  /** Чьи это фото — название места или ориентира. */
  title: string;
  /** Где это: корпус и этаж. */
  subtitle?: string;
  onClose: () => void;
}

/**
 * Фото во весь экран (запись 85): из карточки места и с шага маршрута.
 *
 * Не у всех хорошее зрение, поэтому фото увеличивается любым привычным
 * способом: двумя пальцами, двойным касанием, колесом мыши, кнопками «+» и
 * «−» и клавишами. Листается пальцем вбок и стрелками, закрывается жестом вниз,
 * крестиком и Escape (`useDialogFocus`). Увеличенное фото двигается пальцем.
 *
 * Пока грузится полное фото, видно маленькое — оно уже в телефоне. Полное без
 * связи не загрузилось — остаётся маленькое и строка, почему.
 *
 * Рисуется в `body` порталом: шторка навигатора во время жеста сдвинута
 * трансформацией, и `fixed` внутри неё отсчитывался бы от шторки, а не от
 * экрана.
 */
export const PhotoViewer: React.FC<PhotoViewerProps> = ({ photos, startIndex = 0, title, subtitle, onClose }) => {
  const messages = useMessages();
  const online = useOnline();
  const dialogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ at: number; point: Point } | null>(null);

  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), photos.length - 1));
  const [zoom, setZoom] = useState<Zoom>(FIT);
  const [swipe, setSwipe] = useState<Point | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(() => new Set());

  useDialogFocus(dialogRef, true, onClose);

  // Размер области фото: по нему оба размера фото вписываются одинаково, и
  // маленькое не прыгает, когда поверх загрузится полное.
  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const measure = () => setStage({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const photo = photos[index];
  if (!photo) return null;
  const count = photos.length;
  const size = containSize(photo, stage);

  /** Сдвиг не уводит увеличенное фото за край: край фото не дальше края экрана. */
  const clamp = (next: Zoom): Zoom => {
    const scale = Math.min(Math.max(next.scale, 1), MAX_SCALE);
    if (scale === 1) return FIT;
    const limitX = Math.max(0, (size.width * scale - stage.width) / 2);
    const limitY = Math.max(0, (size.height * scale - stage.height) / 2);
    return {
      scale,
      x: Math.min(Math.max(next.x, -limitX), limitX),
      y: Math.min(Math.max(next.y, -limitY), limitY),
    };
  };

  /**
   * Масштаб вокруг точки экрана: точка фото под пальцем остаётся под пальцем.
   * Точка — от центра области фото.
   */
  const zoomAround = (from: Zoom, scale: number, at: Point): Zoom => {
    const factor = Math.min(Math.max(scale, 1), MAX_SCALE) / from.scale;
    return clamp({ scale: from.scale * factor, x: at.x - (at.x - from.x) * factor, y: at.y - (at.y - from.y) * factor });
  };

  /** Точка указателя относительно центра области фото. */
  const local = (clientX: number, clientY: number): Point => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  };

  const go = (next: number) => {
    if (next < 0 || next >= count) return;
    setIndex(next);
    setZoom(FIT);
  };

  const zoomBy = (factor: number) => setZoom((current) => zoomAround(current, current.scale * factor, { x: 0, y: 0 }));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, local(event.clientX, event.clientY));
    const points = [...pointers.current.values()];

    if (points.length >= 2) {
      const [a, b] = points;
      gesture.current = {
        kind: 'pinch',
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        start: zoom,
      };
      setSwipe(null);
      return;
    }

    const point = points[0];
    gesture.current = zoom.scale > 1 ? { kind: 'pan', from: point, start: zoom } : { kind: 'swipe', from: point };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, local(event.clientX, event.clientY));
    const current = gesture.current;
    const points = [...pointers.current.values()];
    if (!current) return;

    if (current.kind === 'pinch' && points.length >= 2) {
      const [a, b] = points;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (current.distance > 0) setZoom(zoomAround(current.start, (current.start.scale * distance) / current.distance, current.mid));
    } else if (current.kind === 'pan') {
      const point = points[0];
      setZoom(clamp({ ...current.start, x: current.start.x + point.x - current.from.x, y: current.start.y + point.y - current.from.y }));
    } else if (current.kind === 'swipe') {
      const point = points[0];
      setSwipe({ x: point.x - current.from.x, y: point.y - current.from.y });
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const point = pointers.current.get(event.pointerId);
    pointers.current.delete(event.pointerId);
    const current = gesture.current;

    if (current?.kind === 'swipe' && point) {
      const dx = point.x - current.from.x;
      const dy = point.y - current.from.y;
      setSwipe(null);
      gesture.current = null;

      if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
        go(index + (dx < 0 ? 1 : -1));
        return;
      }
      if (dy > CLOSE_SWIPE_PX && dy > Math.abs(dx)) {
        onClose();
        return;
      }
      // Касание на месте: второе подряд — двойное касание, увеличить или вернуть.
      if (event.pointerType !== 'mouse' && Math.hypot(dx, dy) < DOUBLE_TAP_PX) {
        const now = event.timeStamp;
        const previous = lastTap.current;
        if (previous && now - previous.at < DOUBLE_TAP_MS && Math.hypot(point.x - previous.point.x, point.y - previous.point.y) < DOUBLE_TAP_PX) {
          setZoom((zoomNow) => (zoomNow.scale > 1 ? FIT : zoomAround(zoomNow, ZOOM_STEP, point)));
          lastTap.current = null;
        } else {
          lastTap.current = { at: now, point };
        }
      }
      return;
    }

    // Один палец из двух подняли — дальше этот палец двигает фото.
    const rest = [...pointers.current.values()];
    gesture.current = rest.length === 1 && zoom.scale > 1 ? { kind: 'pan', from: rest[0], start: zoom } : null;
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const at = local(event.clientX, event.clientY);
    setZoom((current) => zoomAround(current, current.scale * (event.deltaY < 0 ? 1.25 : 0.8), at));
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const at = local(event.clientX, event.clientY);
    setZoom((current) => (current.scale > 1 ? FIT : zoomAround(current, ZOOM_STEP, at)));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Просмотр нарисован порталом, но события React идут по дереву
    // компонентов, и Escape дошёл бы до шторки и закрыл бы ещё и карточку места.
    // Шторка обработанное нажатие пропускает; сам просмотр закрывает
    // `useDialogFocus`.
    if (event.key === 'Escape') {
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowLeft') go(index - 1);
    else if (event.key === 'ArrowRight') go(index + 1);
    else if (event.key === '+' || event.key === '=') zoomBy(ZOOM_STEP);
    else if (event.key === '-') zoomBy(1 / ZOOM_STEP);
    else if (event.key === '0') setZoom(FIT);
    else return;
    event.preventDefault();
  };

  const dragging = gesture.current !== null && pointers.current.size > 0;
  const offset = swipe ?? { x: 0, y: 0 };
  const fullFailed = failed.has(photo.file);
  const showNote = fullFailed && !online;

  const roundButton =
    'w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25 transition-colors disabled:opacity-30 disabled:hover:bg-white/15';

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={messages.photo.viewer(title)}
      data-photo-viewer
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[1300] flex flex-col bg-black text-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <p aria-live="polite" className="text-sm font-medium text-white/80">
          {count > 1 ? messages.photo.counter(index + 1, count) : ''}
        </p>
        <button type="button" onClick={onClose} aria-label={messages.photo.close} title={messages.photo.close} className={roundButton}>
          <Icon name="close" size={22} />
        </button>
      </div>

      <div
        ref={stageRef}
        className="relative flex-1 min-h-0 overflow-hidden touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
      >
        <div
          className={`absolute inset-0 flex items-center justify-center ${dragging ? '' : 'transition-transform duration-150 motion-reduce:transition-none'}`}
          style={{ transform: `translate(${zoom.x + offset.x}px, ${zoom.y + offset.y}px) scale(${zoom.scale})` }}
        >
          <div className="relative" style={{ width: size.width, height: size.height }} data-photo-zoom={zoom.scale.toFixed(2)}>
            {/* Маленькое — сразу, оно уже в телефоне; полное ложится поверх, когда загрузится. */}
            <img src={photoSrc(photo, 'small')} alt="" aria-hidden="true" draggable={false} className="absolute inset-0 w-full h-full" />
            {!fullFailed && (
              <img
                key={photo.file}
                src={photoSrc(photo, 'full')}
                alt={title}
                draggable={false}
                data-photo-full
                onLoad={() => setLoaded((set) => new Set(set).add(photo.file))}
                onError={() => setFailed((set) => new Set(set).add(photo.file))}
                className={`absolute inset-0 w-full h-full transition-opacity duration-150 motion-reduce:transition-none ${loaded.has(photo.file) ? 'opacity-100' : 'opacity-0'}`}
              />
            )}
          </div>
        </div>

        {count > 1 && (
          <>
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label={messages.photo.previous} className={`${roundButton} absolute left-3 top-1/2 -translate-y-1/2`}>
              <Icon name="back" size={22} />
            </button>
            <button type="button" onClick={() => go(index + 1)} disabled={index === count - 1} aria-label={messages.photo.next} className={`${roundButton} absolute right-3 top-1/2 -translate-y-1/2`}>
              <Icon name="forward" size={22} />
            </button>
          </>
        )}
      </div>

      <div className="flex items-end gap-3 px-4 pt-3 pb-4">
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold leading-snug break-words">{title}</p>
          {subtitle && <p className="text-sm text-white/75">{subtitle}</p>}
          {showNote && (
            <p role="status" className="mt-1 text-sm text-white/90">
              {messages.photo.offline}
            </p>
          )}
        </div>
        <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={zoom.scale <= 1} aria-label={messages.photo.zoomOut} title={messages.photo.zoomOut} className={roundButton}>
          <Icon name="minus" size={22} />
        </button>
        <button type="button" onClick={() => zoomBy(ZOOM_STEP)} disabled={zoom.scale >= MAX_SCALE} aria-label={messages.photo.zoomIn} title={messages.photo.zoomIn} className={roundButton}>
          <Icon name="plus" size={22} />
        </button>
      </div>
    </div>,
    document.body
  );
};
