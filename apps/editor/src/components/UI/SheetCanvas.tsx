import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ImportSheet } from '../../import/readers';
import type { Piece } from '../../import/importModel';
import { bulgeThrough, insertOutlinePoint, outlineBox, removeOutlinePoint, splitOutlineEdge } from '../../import/outline';
import type { OutlinePoint } from '../../import/outline';
import { cutOutline, outlineFromClicks } from '../../import/outlineEdit';
import { metersPerUnitOf } from '../../import/output';
import { traceOnSheet } from '../../import/traceSheet';
import { clampBox, dragBox } from '../../import/trim';
import type { Box, CropHandle } from '../../import/trim';
import { fitView, nearestEdgePoint, toPage, toScreen, visiblePart, zoomAt } from '../../import/sheetView';
import type { Point, SheetView, Size } from '../../import/sheetView';
import { CropOverlay } from './CropEditor';
import { OutlineOverlay } from './OutlineEditor';
import { FrameOverlay, SheetMenu, SketchOverlay, ToolPalette } from './SheetTools';
import type { MenuItem } from './SheetTools';
import { TOOL_HINTS } from './sheetToolList';
import type { SheetTool } from './sheetToolList';
import { Icon } from './Icon';

/**
 * Лист в мастерской (запись 80): во всю середину, с приближением и
 * перемещением, как карта.
 *
 * Колесо приближает под курсором, пробел или средняя кнопка — двигать лист,
 * перетаскивание по пустому месту — тоже. Лист рисуется один раз целиком, а
 * при приближении видимая часть дорисовывается заново в нужной крупности:
 * штамп и номер помещения на листе А1 читаются, а не расплываются.
 *
 * Поверх — рамка области (`CropOverlay`) или контур здания (`OutlineOverlay`);
 * их перетаскивания ведёт холст: он знает, где лист на экране.
 *
 * Слева — инструменты (запись 81, `SheetTools`): выбор, рука, контур по
 * точкам, прямоугольник, вырезать, «здание здесь»; правая кнопка — меню у
 * точки листа. Escape идёт по шагу назад: меню, начатая обводка, инструмент,
 * выбранный угол — и только потом мастерская.
 */

/** Длинная сторона листа, нарисованного целиком, px. */
const PREVIEW_SIDE = 1400;
/** Сторона дорисовки видимой части — не больше, px: дальше холст браузера не тянет. */
const DETAIL_LIMIT = 4096;
/** Дорисовка — когда приближено сильнее целого листа на столько. */
const DETAIL_FROM = 1.25;
/** Как близко к линии контура показывается «+», и как далеко от угла, px. */
const ADD_RADIUS = 8;
const CORNER_GAP = 12;
/** Ближе, чем столько точек экрана, изгиб прилипает к прямой. */
const STRAIGHT_SNAP_PX = 5;
/** Шаг стрелок без выбранного угла — сдвиг листа, px. */
const PAN_STEP = 60;
/** Шаг кнопок «+» и «−». */
const ZOOM_STEP = 1.5;
/** Щелчок ближе стольких px к первой точке обводки замыкает её. */
const CLOSE_RADIUS = 10;
/** Прямоугольник меньше стольких px по стороне — случайный щелчок, а не рамка. */
const MIN_FRAME_PX = 4;
/** Сколько держится сообщение внизу листа, мс. */
const NOTICE_MS = 5000;

type Drag =
  | { kind: 'pan'; pointer: number; x: number; y: number; view: SheetView }
  | { kind: 'corner'; pointer: number; index: number }
  | { kind: 'edge'; pointer: number; index: number }
  | { kind: 'crop'; pointer: number; handle: CropHandle; x: number; y: number; box: Box }
  | { kind: 'frame'; pointer: number };

/** Растягиваемый прямоугольник инструмента: будущая область или вырез. */
interface Frame {
  kind: 'rect' | 'cut';
  from: Point;
  to: Point;
}

/** Точка после последней с Shift — по горизонтали, вертикали или под 45°: стены ровные. */
function snapFrom(points: readonly Point[], raw: Point, shift: boolean): Point {
  const last = points[points.length - 1];
  if (!shift || !last) return raw;
  const dx = raw.x - last.x;
  const dy = raw.y - last.y;
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const length = dx * Math.cos(angle) + dy * Math.sin(angle);
  return { x: last.x + length * Math.cos(angle), y: last.y + length * Math.sin(angle) };
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

/** Нарисованные листы мастерской: к листу, на который вернулись, не ждать отрисовки. */
export type SheetPictures = Map<string, HTMLCanvasElement>;
/** Сколько нарисованных листов держать: лист — несколько мегабайт памяти. */
const PICTURES_KEPT = 8;

/** Холст браузера в разметке React: лист не перекодируется в картинку. */
const CanvasHost: React.FC<{ canvas: HTMLCanvasElement; className: string; style: React.CSSProperties }> = ({ canvas, className, style }) => {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    canvas.className = `${className}-canvas`;
    host.current?.replaceChildren(canvas);
  }, [canvas, className]);
  return <div ref={host} className={className} style={style} aria-hidden="true" />;
};

export const SheetCanvas: React.FC<{
  sheet: ImportSheet;
  piece: Piece;
  /** Размер повёрнутого листа в его единицах. */
  page: Size;
  pictures: SheetPictures;
  /** Выбранный угол контура: Delete убирает, стрелки двигают; Escape снимает выбор. */
  selected: number | null;
  onSelect: (index: number | null) => void;
  /** Перед перетаскиванием — запомнить состояние для отмены. */
  onGesture: () => void;
  /** Правка по ходу перетаскивания — без новой записи в истории. */
  onDrag: (change: (piece: Piece) => Piece) => void;
  /** Правка одним действием; подряд идущие с одним `key` — одна запись истории. */
  onEdit: (change: (piece: Piece) => Piece, key?: string) => void;
  /** Инструмент — общий для всех листов: штамп вырезают на листе за листом. */
  tool: SheetTool;
  onTool: (tool: SheetTool) => void;
  /** Шаг назад по Escape: `true` — холст что-то отменил, мастерскую не закрывать. */
  escapeRef: React.MutableRefObject<(() => boolean) | null>;
}> = ({ sheet, piece, page, pictures, selected, onSelect: setSelected, onGesture, onDrag, onEdit, tool, onTool, escapeRef }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<Size | null>(null);
  const [view, setView] = useState<SheetView | null>(null);
  const [addHint, setAddHint] = useState<{ index: number; point: Point } | null>(null);
  const [space, setSpace] = useState(false);
  const [sketch, setSketch] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [frame, setFrameState] = useState<Frame | null>(null);
  /** Прямоугольник — и в ссылке: отпускание кнопки читает самый свежий. */
  const frameRef = useRef<Frame | null>(null);
  const setFrame = (next: Frame | null) => {
    frameRef.current = next;
    setFrameState(next);
  };
  const [menu, setMenu] = useState<{ x: number; y: number; at: Point; corner: number | null; edge: number | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  /** Сообщение внизу листа; `keep` — пока его не сменят (поиск идёт). */
  const say = (text: string | null, keep = false) => {
    window.clearTimeout(noticeTimer.current);
    setNotice(text);
    if (text && !keep) noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
  };
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);
  const searching = useRef(false);
  const drag = useRef<Drag | null>(null);
  /** Человек сам двигал или приближал лист: при смене размера окна не вписывать заново. */
  const moved = useRef(false);

  const outline = piece.outline ?? null;
  const box = piece.crop ?? { x: 0, y: 0, width: page.width, height: page.height };
  const fitScale = useMemo(() => (area ? fitView(area, page).scale : 1), [area, page]);
  const fitScaleRef = useRef(fitScale);
  fitScaleRef.current = fitScale;
  const baseKey = `${sheet.id}|${piece.rotation}`;

  // --- размер области и вписывание листа ---

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => setArea({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Лист сменился, а фокус пропал вместе с прежним листом — к новому листу:
  // иначе стрелки, Enter и Ctrl+Z ушли бы мимо мастерской.
  useEffect(() => {
    const element = containerRef.current;
    if (element && !element.closest('[role="dialog"]')?.contains(document.activeElement)) element.focus({ preventScroll: true });
  }, []);

  // Контур изменился не мышью над ним (двойной щелчок, Delete, отмена) — «+» прежнего места не годится.
  useEffect(() => {
    if (!drag.current) setAddHint(null);
  }, [outline]);

  // Другой инструмент — начатое прежним бросается.
  useEffect(() => {
    setSketch([]);
    setCursor(null);
    setFrame(null);
    setAddHint(null);
  }, [tool]);

  const fittedFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!area || area.width === 0 || area.height === 0) return;
    if (fittedFor.current === baseKey && moved.current) return;
    fittedFor.current = baseKey;
    moved.current = false;
    setView(fitView(area, page));
  }, [area, baseKey, page]);

  const fit = () => {
    if (!area) return;
    moved.current = false;
    setView(fitView(area, page));
  };
  const zoomBy = (factor: number, at?: Point) => {
    if (!area) return;
    moved.current = true;
    setView((current) => current && zoomAt(current, factor, at ?? { x: area.width / 2, y: area.height / 2 }, fitScaleRef.current));
  };

  // Колесо — приближение под курсором. Слушатель не пассивный: иначе страница
  // прокручивалась бы вместе с листом.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      moved.current = true;
      setView((current) => current && zoomAt(current, Math.exp(-delta * 0.0015), { x: event.clientX - rect.left, y: event.clientY - rect.top }, fitScaleRef.current));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  // Пробел зажат — лист двигается мышью, где бы она ни была.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isTyping(event.target) || !containerRef.current?.contains(event.target as Node)) return;
      event.preventDefault();
      setSpace(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpace(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // --- лист целиком и дорисовка видимой части ---

  const [base, setBase] = useState<{ key: string; canvas: HTMLCanvasElement | null; failure?: string } | null>(() => {
    const kept = pictures.get(baseKey);
    return kept ? { key: baseKey, canvas: kept } : null;
  });
  useEffect(() => {
    const kept = pictures.get(baseKey);
    if (kept) {
      setBase({ key: baseKey, canvas: kept });
      return;
    }
    let cancelled = false;
    const scale = PREVIEW_SIDE / Math.max(page.width, page.height);
    // Лист не нарисовался — холст говорит об этом, а не показывает «рисуется» вечно.
    void sheet.render(piece.rotation, null, scale).then(
      (canvas) => {
        pictures.set(baseKey, canvas);
        while (pictures.size > PICTURES_KEPT) pictures.delete(pictures.keys().next().value!);
        if (!cancelled) setBase({ key: baseKey, canvas });
      },
      (cause: unknown) => !cancelled && setBase({ key: baseKey, canvas: null, failure: cause instanceof Error ? cause.message : String(cause) })
    );
    return () => {
      cancelled = true;
    };
    // Лист перерисовывается только при повороте.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, piece.rotation]);

  const baseScale = PREVIEW_SIDE / Math.max(page.width, page.height);
  const [detail, setDetail] = useState<{ key: string; box: Box; canvas: HTMLCanvasElement } | null>(null);
  const detailSeq = useRef(0);
  useEffect(() => {
    if (!view || !area || view.scale <= baseScale * DETAIL_FROM) return;
    const visible = visiblePart(view, area, page);
    if (!visible) return;
    const seq = ++detailSeq.current;
    // Пока лист двигают, не дорисовывать: дорисовка — когда он встал.
    const timer = setTimeout(() => {
      const ratio = window.devicePixelRatio || 1;
      const scale = Math.min(view.scale * ratio, DETAIL_LIMIT / Math.max(visible.width, visible.height));
      void sheet.render(piece.rotation, visible, scale).then(
        (canvas) => seq === detailSeq.current && setDetail({ key: baseKey, box: visible, canvas }),
        () => undefined
      );
    }, 250);
    return () => clearTimeout(timer);
    // `sheet` и поворот меняют `baseKey`; страница — вместе с поворотом.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, area, baseKey]);

  // --- правки ---

  const local = (event: { clientX: number; clientY: number }): Point => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const clampPage = (point: Point): Point => ({
    x: Math.min(page.width, Math.max(0, point.x)),
    y: Math.min(page.height, Math.max(0, point.y)),
  });
  /** Контур и его описанный прямоугольник — обрезка (запись 73). */
  const withOutline = (current: Piece, next: OutlinePoint[]): Piece => ({
    ...current,
    outline: next,
    crop: clampBox(outlineBox(next), page),
    trimmed: false,
  });

  const capture = (event: React.PointerEvent, next: Drag) => {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = next;
  };
  const startPan = (event: React.PointerEvent) => {
    if (!view) return;
    capture(event, { kind: 'pan', pointer: event.pointerId, x: event.clientX, y: event.clientY, view });
  };
  /** Средняя кнопка, пробел и «Рука» двигают лист и поверх ручек: ручка событие пропускает. */
  const panInstead = (event: React.PointerEvent) => event.button === 1 || (event.button === 0 && (space || tool === 'hand'));

  // --- инструменты (запись 81) ---

  const finishSketch = (points: readonly Point[]) => {
    const next = outlineFromClicks(points);
    setSketch([]);
    setCursor(null);
    if (!next) {
      say('Нужно хотя бы три угла не на одной прямой — обведите заново');
      return;
    }
    onEdit((current) => withOutline(current, next));
    onTool('select');
    say('Контур замкнут — углы можно поправить');
  };
  const addSketchPoint = (raw: Point, shift: boolean) => {
    if (!view) return;
    const at = toScreen(view, raw);
    const near = (point: Point, radius: number) => {
      const p = toScreen(view, point);
      return Math.hypot(p.x - at.x, p.y - at.y) <= radius;
    };
    // Щелчок по первой точке или второй щелчок двойного — замкнуть.
    if (sketch.length >= 3 && (near(sketch[0], CLOSE_RADIUS) || near(sketch[sketch.length - 1], MIN_FRAME_PX))) {
      finishSketch(sketch);
      return;
    }
    if (sketch.length > 0 && near(sketch[sketch.length - 1], MIN_FRAME_PX)) return;
    setSketch([...sketch, clampPage(snapFrom(sketch, raw, shift))]);
    say(null);
  };
  const finishFrame = () => {
    const current = frameRef.current;
    setFrame(null);
    if (!current || !view) return;
    const cut: Box = {
      x: Math.min(current.from.x, current.to.x),
      y: Math.min(current.from.y, current.to.y),
      width: Math.abs(current.to.x - current.from.x),
      height: Math.abs(current.to.y - current.from.y),
    };
    if (cut.width * view.scale < MIN_FRAME_PX || cut.height * view.scale < MIN_FRAME_PX) return;
    if (current.kind === 'rect') {
      onEdit((p) => ({ ...p, crop: clampBox(cut, page), outline: null, trimmed: false }));
      onTool('select');
      return;
    }
    const result = cutOutline(piece.outline ?? null, piece.crop, page, cut);
    if ('problem' in result) {
      say(result.problem);
      return;
    }
    onEdit((p) => withOutline(p, result.outline));
    say(result.dropped > 0 ? 'Вырезано, отрезанный кусок убран целиком' : 'Вырезано');
  };
  const findBuilding = async (at: Point) => {
    if (searching.current) return;
    searching.current = true;
    say('Ищу здание…', true);
    try {
      // По всему листу: щёлкнули по зданию — значит, оно тут, даже если рамка его режет.
      const found = await traceOnSheet(sheet, piece.rotation, { x: 0, y: 0, width: page.width, height: page.height }, {
        seed: at,
        metersPerUnit: metersPerUnitOf(sheet, Number(piece.scaleText) || undefined),
      });
      if (!found) {
        say('Здание не нашлось — обведите его по точкам (P)');
        return;
      }
      onEdit((current) => withOutline(current, found));
      onTool('select');
      say('Контур найден — проверьте углы');
    } catch (cause) {
      say(`Здание не нашлось: ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      searching.current = false;
    }
  };

  const closeMenu = () => {
    setMenu(null);
    containerRef.current?.focus({ preventScroll: true });
  };
  const onContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    if (!view) return;
    const target = event.target as HTMLElement;
    const corner = target.closest<HTMLElement>('[data-corner]')?.dataset.corner;
    const edge = target.closest<HTMLElement>('[data-edge]')?.dataset.edge;
    const at = local(event);
    setMenu({ ...at, at: clampPage(toPage(view, at)), corner: corner === undefined ? null : Number(corner), edge: edge === undefined ? null : Number(edge) });
    if (corner !== undefined) setSelected(Number(corner));
  };
  const menuItems = (open: NonNullable<typeof menu>): MenuItem[] => {
    const items: MenuItem[] = [];
    if (outline && open.corner !== null) {
      const index = open.corner;
      items.push({ label: 'Убрать угол', key: 'Delete', disabled: outline.length <= 3 && !outline.some((p) => p.bulge), run: () => removeCorner(index) });
    }
    if (outline && open.edge !== null) {
      const index = open.edge;
      items.push({ label: 'Поставить угол посередине', run: () => onEdit((p) => (p.outline ? withOutline(p, splitOutlineEdge(p.outline, index)) : p)) });
      if (outline[index]?.bulge) {
        items.push({
          label: 'Сделать ребро прямым',
          run: () => onEdit((p) => (p.outline ? withOutline(p, p.outline.map((point, i) => (i === index ? { x: point.x, y: point.y } : point))) : p)),
        });
      }
    }
    items.push(
      { label: 'Найти здание здесь', key: 'B', run: () => void findBuilding(open.at) },
      { label: 'Обвести по точкам', key: 'P', run: () => onTool('polygon') },
      { label: 'Вырезать прямоугольником', key: 'X', run: () => onTool('cut') },
      { label: 'Показать лист целиком', key: '0', run: fit }
    );
    return items;
  };

  // Escape — по шагу назад; мастерская спрашивает холст первой.
  useEffect(() => {
    escapeRef.current = () => {
      if (menu) closeMenu();
      else if (sketch.length > 0) {
        setSketch([]);
        setCursor(null);
      } else if (frameRef.current) {
        drag.current = null;
        setFrame(null);
      } else if (tool !== 'select') onTool('select');
      else if (selected !== null) setSelected(null);
      else return false;
      return true;
    };
  });
  useEffect(
    () => () => {
      escapeRef.current = null;
    },
    [escapeRef]
  );

  const onPointerDown = (event: React.PointerEvent) => {
    containerRef.current?.focus({ preventScroll: true });
    if (menu) setMenu(null);
    if (panInstead(event)) {
      event.preventDefault();
      startPan(event);
      return;
    }
    if (event.button !== 0 || !view) return;
    if (tool !== 'select') {
      event.preventDefault();
      const at = clampPage(toPage(view, local(event)));
      if (tool === 'polygon') addSketchPoint(at, event.shiftKey);
      else if (tool === 'building') void findBuilding(at);
      else if (tool === 'rect' || tool === 'cut') {
        setFrame({ kind: tool, from: at, to: at });
        capture(event, { kind: 'frame', pointer: event.pointerId });
      }
      return;
    }
    // «+» на линии: новый угол — и сразу его тянут, как в графических редакторах.
    if (outline && addHint) {
      event.preventDefault();
      onGesture();
      const next = insertOutlinePoint(outline, addHint.index, addHint.point);
      const index = addHint.index + 1;
      onDrag((current) => withOutline(current, next));
      setSelected(index);
      setAddHint(null);
      capture(event, { kind: 'corner', pointer: event.pointerId, index });
      return;
    }
    setSelected(null);
    startPan(event);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const current = drag.current;
    if (current && current.pointer === event.pointerId) {
      if (current.kind === 'pan') {
        moved.current = true;
        setView({ ...current.view, x: current.view.x + event.clientX - current.x, y: current.view.y + event.clientY - current.y });
        return;
      }
      if (!view) return;
      if (current.kind === 'frame') {
        const to = clampPage(toPage(view, local(event)));
        if (frameRef.current) setFrame({ ...frameRef.current, to });
        return;
      }
      if (current.kind === 'crop') {
        const dx = (event.clientX - current.x) / view.scale;
        const dy = (event.clientY - current.y) / view.scale;
        onDrag((piece) => ({ ...piece, crop: dragBox(current.box, current.handle, dx, dy, page), trimmed: false }));
        return;
      }
      const p = clampPage(toPage(view, local(event)));
      if (current.kind === 'corner') {
        onDrag((piece) => (piece.outline ? withOutline(piece, piece.outline.map((point, i) => (i === current.index ? { ...point, x: p.x, y: p.y } : point))) : piece));
        return;
      }
      onDrag((piece) => {
        if (!piece.outline) return piece;
        const a = piece.outline[current.index];
        const b = piece.outline[(current.index + 1) % piece.outline.length];
        const bulge = bulgeThrough(a, b, p);
        // Почти прямая — прямая: иначе ребро не вернуть к хорде точно.
        const sagittaPx = (Math.abs(bulge) * Math.hypot(b.x - a.x, b.y - a.y) * view.scale) / 2;
        const value = sagittaPx < STRAIGHT_SNAP_PX ? 0 : Math.round(bulge * 1e4) / 1e4;
        return withOutline(
          piece,
          piece.outline.map((point, i) => (i !== current.index ? point : value ? { ...point, bulge: value } : { x: point.x, y: point.y }))
        );
      });
      return;
    }
    if (!view) return;
    if (tool === 'polygon') {
      if (sketch.length > 0) setCursor(clampPage(snapFrom(sketch, toPage(view, local(event)), event.shiftKey)));
      return;
    }
    if (tool === 'select' && outline && !space) setAddHint(nearestEdgePoint(outline, view, local(event), ADD_RADIUS, CORNER_GAP));
  };

  const onPointerEnd = (event: React.PointerEvent) => {
    const current = drag.current;
    if (current?.pointer !== event.pointerId) return;
    drag.current = null;
    if (current.kind === 'frame') finishFrame();
  };

  const startHandle = (event: React.PointerEvent, next: Drag) => {
    if (panInstead(event) || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    containerRef.current?.focus({ preventScroll: true });
    onGesture();
    capture(event, next);
  };

  // --- клавиши ---

  const moveCorner = (index: number, dx: number, dy: number) => {
    if (!view) return;
    onEdit(
      (piece) =>
        piece.outline
          ? withOutline(
              piece,
              piece.outline.map((point, i) => (i === index ? { ...point, ...clampPage({ x: point.x + dx / view.scale, y: point.y + dy / view.scale }) } : point))
            )
          : piece,
      `corner-${index}`
    );
  };
  const removeCorner = (index: number) => {
    onEdit((piece) => (piece.outline ? withOutline(piece, removeOutlinePoint(piece.outline, index)) : piece));
    setSelected(null);
  };
  const arrow = (event: React.KeyboardEvent): [number, number] | null => {
    const step = event.shiftKey ? 10 : 1;
    return ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[event.key] ?? null;
  };

  const onCornerKey = (index: number, event: React.KeyboardEvent) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      event.stopPropagation();
      removeCorner(index);
      return;
    }
    const delta = arrow(event);
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    moveCorner(index, delta[0], delta[1]);
  };
  const onEdgeKey = (index: number, event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      onEdit((piece) => (piece.outline ? withOutline(piece, splitOutlineEdge(piece.outline, index)) : piece));
      return;
    }
    // Стрелки вверх и вниз меняют изгиб ребра.
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    event.stopPropagation();
    const delta = (event.shiftKey ? 0.2 : 0.05) * (event.key === 'ArrowUp' ? 1 : -1);
    onEdit((piece) => {
      if (!piece.outline) return piece;
      const next = Math.round(((piece.outline[index].bulge ?? 0) + delta) * 1e4) / 1e4;
      return withOutline(
        piece,
        piece.outline.map((point, i) => (i !== index ? point : Math.abs(next) < 1e-6 ? { x: point.x, y: point.y } : { ...point, bulge: next }))
      );
    }, `edge-${index}`);
  };
  const onCropKey = (handle: CropHandle, event: React.KeyboardEvent) => {
    const delta = arrow(event);
    if (!delta || !view) return;
    event.preventDefault();
    event.stopPropagation();
    onEdit((piece) => ({ ...piece, crop: dragBox(piece.crop ?? box, handle, delta[0] / view.scale, delta[1] / view.scale, page), trimmed: false }), `crop-${handle}`);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    // Начатая обводка: Enter замыкает, Backspace убирает последнюю точку — а не лист и не угол.
    if (tool === 'polygon' && sketch.length > 0 && (event.key === 'Enter' || event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Enter') finishSketch(sketch);
      else setSketch(sketch.slice(0, -1));
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomBy(ZOOM_STEP);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomBy(1 / ZOOM_STEP);
    } else if (event.key === '0') {
      event.preventDefault();
      fit();
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && outline && selected !== null) {
      event.preventDefault();
      removeCorner(selected);
    } else {
      const delta = arrow(event);
      if (!delta) return;
      event.preventDefault();
      if (outline && selected !== null) moveCorner(selected, delta[0], delta[1]);
      else {
        moved.current = true;
        setView((current) => current && { ...current, x: current.x - Math.sign(delta[0]) * PAN_STEP, y: current.y - Math.sign(delta[1]) * PAN_STEP });
      }
    }
  };

  const selectHint = outline
    ? 'Тяните угол · наведите на линию — «+», щелчок ставит угол · Delete — убрать выбранный угол · колесо — масштаб · пробел или средняя кнопка — двигать лист · Ctrl+Z — отменить'
    : 'Тяните края и углы рамки, внутри — двигать её · колесо — масштаб · пробел или средняя кнопка — двигать лист · Ctrl+Z — отменить';
  const hint = notice ?? (tool === 'select' ? selectHint : TOOL_HINTS[tool]);
  const firstOnScreen = view && sketch.length > 0 ? toScreen(view, sketch[0]) : null;
  const cursorOnScreen = view && cursor ? toScreen(view, cursor) : null;
  const closing =
    sketch.length >= 3 && firstOnScreen !== null && cursorOnScreen !== null && Math.hypot(firstOnScreen.x - cursorOnScreen.x, firstOnScreen.y - cursorOnScreen.y) <= CLOSE_RADIUS;
  const percent = view ? Math.round((view.scale / fitScale) * 100) : 100;
  const shownBase = base?.key === baseKey ? base : null;
  const shownDetail = view && detail?.key === baseKey && view.scale > baseScale * DETAIL_FROM ? detail : null;

  return (
    <div className="editor-workshop__center">
      <div className="editor-workshop__stage">
      <ToolPalette tool={tool} onTool={onTool} />
      <div
        ref={containerRef}
        className={`editor-workshop__canvas editor-workshop__canvas--tool-${tool}${space ? ' editor-workshop__canvas--pan' : ''}${addHint ? ' editor-workshop__canvas--add' : ''}`}
        tabIndex={0}
        data-autofocus
        role="application"
        aria-label="Лист: колесо — масштаб, стрелки — двигать лист или выбранный угол, 0 — весь лист"
        aria-roledescription="лист"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={() => setAddHint(null)}
        onKeyDown={onKeyDown}
        onContextMenu={onContextMenu}
      >
        {view && shownBase?.canvas && (
          <CanvasHost
            canvas={shownBase.canvas}
            className="editor-crop__image"
            style={{ left: view.x, top: view.y, width: page.width * view.scale, height: page.height * view.scale }}
          />
        )}
        {view && shownDetail && (
          <CanvasHost
            canvas={shownDetail.canvas}
            className="editor-workshop__detail"
            style={{
              left: view.x + shownDetail.box.x * view.scale,
              top: view.y + shownDetail.box.y * view.scale,
              width: shownDetail.box.width * view.scale,
              height: shownDetail.box.height * view.scale,
            }}
          />
        )}
        {!shownBase?.canvas && (
          <div className="editor-crop__loading" role={shownBase?.failure ? 'alert' : undefined}>
            {shownBase?.failure ? `Лист не нарисовался: ${shownBase.failure}` : 'Лист рисуется…'}
          </div>
        )}
        {view && area && outline && (
          <OutlineOverlay
            outline={outline}
            view={view}
            area={area}
            selected={selected}
            addAt={addHint?.point ?? null}
            onCornerDown={(index, event) => {
              setSelected(index);
              startHandle(event, { kind: 'corner', pointer: event.pointerId, index });
            }}
            onEdgeDown={(index, event) => startHandle(event, { kind: 'edge', pointer: event.pointerId, index })}
            onEdgeDoubleClick={(index) => onEdit((piece) => (piece.outline ? withOutline(piece, splitOutlineEdge(piece.outline, index)) : piece))}
            onCornerKey={onCornerKey}
            onEdgeKey={onEdgeKey}
            onCornerFocus={setSelected}
          />
        )}
        {view && !outline && (
          <CropOverlay
            box={box}
            view={view}
            onHandleDown={(handle, event) => startHandle(event, { kind: 'crop', pointer: event.pointerId, handle, x: event.clientX, y: event.clientY, box })}
            onHandleKey={onCropKey}
          />
        )}
        {view && area && tool === 'polygon' && sketch.length > 0 && <SketchOverlay points={sketch} cursor={cursor} closing={closing} view={view} area={area} />}
        {view && frame && <FrameOverlay kind={frame.kind} from={frame.from} to={frame.to} view={view} />}
        {menu && area && <SheetMenu x={menu.x} y={menu.y} area={area} items={menuItems(menu)} onClose={closeMenu} />}
      </div>
      </div>
      <div className="editor-workshop__bar">
        <span className={`editor-workshop__hint${notice ? ' editor-workshop__hint--notice' : ''}`} title={hint} role="status">
          {hint}
        </span>
        <div className="editor-workshop__zoom" role="group" aria-label="Масштаб листа">
          <button type="button" className="editor-icon-button" aria-label="Отдалить лист" title="Отдалить (−)" onClick={() => zoomBy(1 / ZOOM_STEP)}>
            <span aria-hidden="true">−</span>
          </button>
          <span className="editor-workshop__percent" aria-live="polite">
            {percent} %
          </span>
          <button type="button" className="editor-icon-button" aria-label="Приблизить лист" title="Приблизить (+)" onClick={() => zoomBy(ZOOM_STEP)}>
            <Icon name="plus" />
          </button>
          <button type="button" className="editor-button editor-button--ghost" title="Показать лист целиком (0)" onClick={fit}>
            Лист целиком
          </button>
        </div>
      </div>
    </div>
  );
};
