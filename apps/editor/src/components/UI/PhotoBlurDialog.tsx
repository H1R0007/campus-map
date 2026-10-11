import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PhotoRegion, PointPhoto } from '@campus-map/core';
import { MAX_PHOTO_BLUR } from '@campus-map/core';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useEditorStore } from '../../stores/editorStore';
import { isTinyRegion, moveRegion, paintBlur, regionFromCorners, resizeRegion, sameRegions } from '../../utils/photoBlur';
import type { Corner, PhotoPoint } from '../../utils/photoBlur';
import { blurBaseOf, holdBlurredPhoto } from '../../utils/photoFiles';
import type { BlurBase } from '../../utils/photoFiles';
import { PhotoReadError, processPhoto } from '../../utils/photoProcessing';
import { Icon } from './Icon';

/**
 * Окно «Скрыть лица и надписи» (запись 88).
 *
 * Разметчик обводит рамкой лицо, номер машины, табличку с фамилией — и сразу
 * видит место размытым, ровно так, как его увидит студент. «Применить»
 * заменяет фото точки размытым; исходный снимок у разработчика не меняется,
 * поэтому рамки можно поправить потом.
 */

type Drag =
  | { kind: 'draw'; start: PhotoPoint; region: PhotoRegion }
  | { kind: 'move'; index: number; start: PhotoPoint; from: PhotoRegion; region: PhotoRegion }
  | { kind: 'resize'; index: number; corner: Corner; from: PhotoRegion; region: PhotoRegion };

type Loaded = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; base: BlurBase; bitmap: ImageBitmap };

const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
/** Шаг стрелки — доля фото; с Shift — крупнее. */
const ARROW_STEP = 0.005;
const ARROW_STEP_LARGE = 0.05;

const NO_REGIONS: PhotoRegion[] = [];

/** Размер картинки, вписанной в место без обрезки. */
function containIn(width: number, height: number, room: { width: number; height: number }): { width: number; height: number } {
  const scale = Math.min(room.width / width, room.height / height);
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

const percent = (value: number) => `${value * 100}%`;

export const PhotoBlurDialog: React.FC<{
  photo: PointPhoto;
  /** Номер фото у точки — для заголовка. */
  number: number;
  onDisk: ReadonlySet<string> | null;
  /** Прежнее фото лежит в общей папке: сохранение уберёт его оттуда. */
  inSharedFolder: boolean;
  onApply: (next: PointPhoto) => void;
  onClose: () => void;
}> = ({ photo, number, onDisk, inSharedFolder, onApply, onClose }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const initial = photo.blur ?? NO_REGIONS;
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [regions, setRegions] = useState<PhotoRegion[]>(initial);
  const [past, setPast] = useState<PhotoRegion[][]>([]);
  const [future, setFuture] = useState<PhotoRegion[][]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null);

  const ready = loaded.status === 'ready' ? loaded : null;
  // Без исходного снимка уже размытое не вернуть: такие рамки только видны.
  const locked = ready?.base.kind === 'photo' ? initial.length : 0;
  const dirty = !sameRegions(regions, initial);

  // С чего размывать: исходный снимок или само фото. Снимок читается один раз
  // за окно: сохранение рядом меняет списки файлов, но не этот снимок.
  const sources = useEditorStore((s) => (s.diskSaveAvailable ? s.diskSources : null));
  const lookup = useRef({ photo, onDisk, sources });
  useEffect(() => {
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;
    void (async () => {
      const base = await blurBaseOf(lookup.current.photo, lookup.current.onDisk, lookup.current.sources);
      if (cancelled) return;
      if (!base) {
        setLoaded({ status: 'missing' });
        return;
      }
      try {
        bitmap = await createImageBitmap(base.blob, { imageOrientation: 'from-image' });
      } catch {
        if (!cancelled) setLoaded({ status: 'missing' });
        return;
      }
      if (cancelled) bitmap.close();
      else setLoaded({ status: 'ready', base, bitmap });
    })();
    return () => {
      cancelled = true;
      bitmap?.close();
    };
  }, []);

  // Место под фото меняется с окном браузера.
  useLayoutEffect(() => {
    const element = roomRef.current;
    if (!element) return;
    const measure = () => setRoom({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const shown = ready && room ? containIn(ready.bitmap.width, ready.bitmap.height, room) : null;

  // Снимок открылся — фокус на фото: клавиши окна работают сразу.
  const stageShown = shown !== null;
  useEffect(() => {
    if (stageShown) stageRef.current?.focus();
  }, [stageShown]);

  // Рамки, какими они видны прямо сейчас: с той, что тянут.
  const visible = useMemo(() => {
    if (!drag) return regions;
    if (drag.kind === 'draw') return [...regions, drag.region];
    return regions.map((region, i) => (i === drag.index ? drag.region : region));
  }, [regions, drag]);

  // Фото на холсте — и размытие тем же способом, что при «Применить».
  const baseCache = useRef<{ key: string; canvas: OffscreenCanvas } | null>(null);
  const shownWidth = shown?.width ?? 0;
  const shownHeight = shown?.height ?? 0;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready || shownWidth === 0) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(shownWidth * ratio);
    const height = Math.round(shownHeight * ratio);
    const key = `${width}x${height}`;
    if (baseCache.current?.key !== key) {
      const cache = new OffscreenCanvas(width, height);
      const cacheContext = cache.getContext('2d');
      if (!cacheContext) return;
      cacheContext.imageSmoothingQuality = 'high';
      cacheContext.drawImage(ready.bitmap, 0, 0, width, height);
      baseCache.current = { key, canvas: cache };
    }
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(baseCache.current.canvas, 0, 0);
    if (showOriginal) return;
    try {
      paintBlur(context, ready.base.kind === 'original' ? visible : visible.slice(locked));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  }, [ready, shownWidth, shownHeight, showOriginal, visible, locked]);

  /** Новые рамки — одной правкой окна: Ctrl+Z вернёт прежние. */
  const commit = useCallback(
    (next: PhotoRegion[]) => {
      setPast((list) => [...list, regions]);
      setFuture([]);
      setRegions(next);
      setConfirmClose(false);
    },
    [regions]
  );

  const undo = () => {
    if (past.length === 0) return;
    setFuture((list) => [regions, ...list]);
    setRegions(past[past.length - 1]);
    setPast((list) => list.slice(0, -1));
    setSelected(null);
  };

  const redo = () => {
    if (future.length === 0) return;
    setPast((list) => [...list, regions]);
    setRegions(future[0]);
    setFuture((list) => list.slice(1));
    setSelected(null);
  };

  const remove = (index: number) => {
    if (index < locked) return;
    commit(regions.filter((_, i) => i !== index));
    setSelected(null);
  };

  const pointOf = (event: { clientX: number; clientY: number }): PhotoPoint => {
    const rect = layerRef.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || busy || !ready) return;
    event.preventDefault();
    stageRef.current?.focus();
    const target = event.target as HTMLElement;
    const frame = target.closest<HTMLElement>('[data-frame]');
    const index = frame ? Number(frame.dataset.frame) : -1;
    const corner = target.closest<HTMLElement>('[data-corner]')?.dataset.corner as Corner | undefined;
    const point = pointOf(event);

    if (index >= locked && corner) {
      setDrag({ kind: 'resize', index, corner, from: regions[index], region: regions[index] });
    } else if (index >= locked) {
      setSelected(index);
      setDrag({ kind: 'move', index, start: point, from: regions[index], region: regions[index] });
    } else if (regions.length >= MAX_PHOTO_BLUR) {
      setProblem(`Рамок уже ${MAX_PHOTO_BLUR} — больше не нужно: такое фото лучше переснять`);
      return;
    } else {
      setSelected(null);
      setDrag({ kind: 'draw', start: point, region: regionFromCorners(point, point) });
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const point = pointOf(event);
    if (drag.kind === 'draw') setDrag({ ...drag, region: regionFromCorners(drag.start, point) });
    else if (drag.kind === 'move') setDrag({ ...drag, region: moveRegion(drag.from, point.x - drag.start.x, point.y - drag.start.y) });
    else setDrag({ ...drag, region: resizeRegion(drag.from, drag.corner, point) });
  };

  const onPointerUp = () => {
    if (!drag) return;
    setDrag(null);
    // Щелчок без протяжки рамкой не считается, а угол, сжатый в точку, не применяется.
    if (isTinyRegion(drag.region)) return;
    if (drag.kind === 'draw') {
      commit([...regions, drag.region]);
      setSelected(regions.length);
      setProblem(null);
    } else if (!sameRegions([drag.region], [drag.from])) {
      commit(regions.map((region, i) => (i === drag.index ? drag.region : region)));
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.target as HTMLElement).tagName === 'INPUT') return;
    const ctrl = event.ctrlKey || event.metaKey;
    let handled = true;
    // Клавиши — по физическим: в русской раскладке Ctrl+Z приходит как «я».
    if (ctrl && event.code === 'KeyZ') {
      if (event.shiftKey) redo();
      else undo();
    } else if (ctrl && event.code === 'KeyY') {
      redo();
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && selected !== null) {
      remove(selected);
    } else if (ARROWS[event.key] && selected !== null && selected >= locked) {
      const step = event.shiftKey ? ARROW_STEP_LARGE : ARROW_STEP;
      const [dx, dy] = ARROWS[event.key];
      commit(regions.map((region, i) => (i === selected ? moveRegion(region, dx * step, dy * step) : region)));
    } else {
      handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  // Escape: начатая рамка — отменяется; неприменённые рамки — сначала вопрос.
  const requestClose = () => {
    if (drag) {
      setDrag(null);
      return;
    }
    if (busy) return;
    if (dirty && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    if (confirmClose) {
      setConfirmClose(false);
      return;
    }
    onClose();
  };

  useDialogFocus(true, dialogRef, requestClose, stageRef);

  const apply = async () => {
    if (!ready || busy || !dirty) return;
    setBusy(true);
    setProblem(null);
    try {
      // Само фото уже несёт прежнее размытие — заново размываются только новые рамки.
      const processed = await processPhoto(ready.base.blob, ready.base.kind === 'original' ? regions : regions.slice(locked));
      await holdBlurredPhoto(processed, photo);
      onApply({
        file: processed.file,
        width: processed.width,
        height: processed.height,
        source: photo.source,
        blur: regions.length > 0 ? regions : undefined,
      });
    } catch (error) {
      setProblem(
        error instanceof PhotoReadError ? error.message : `Не удалось размыть: ${error instanceof Error ? error.message : String(error)}`
      );
      setBusy(false);
    }
  };

  const stopDrop = (event: React.DragEvent) => {
    // Брошенный сюда снимок не становится фото точки и не открывает загрузку планов.
    event.preventDefault();
    event.stopPropagation();
  };

  return createPortal(
    <div className="editor-photo-preview" onDragOver={stopDrop} onDrop={stopDrop}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="blur-title"
        className="editor-blur"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        data-blur-dialog
      >
        <div className="editor-blur__head">
          <h2 id="blur-title" className="editor-dialog__title">
            Скрыть лица и надписи — фото {number}
          </h2>
          <button type="button" className="editor-icon-button" onClick={requestClose} aria-label="Закрыть" title="Закрыть (Esc)">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="editor-blur__body">
          <div ref={roomRef} className="editor-blur__room">
            {loaded.status === 'loading' && <p className="editor-blur__placeholder">Открываю снимок…</p>}
            {loaded.status === 'missing' && (
              <p className="editor-blur__placeholder" role="alert">
                Нет ни исходного снимка, ни файла фото на этой машине — общая папка ещё не синхронизировалась?
              </p>
            )}
            {ready && shown && (
              <div
                ref={stageRef}
                className="editor-blur__stage"
                style={{ width: shown.width, height: shown.height }}
                tabIndex={0}
                role="group"
                aria-label="Фото: протяните мышью, чтобы обвести участок"
                data-blur-stage
              >
                <canvas ref={canvasRef} className="editor-blur__canvas" style={{ width: shown.width, height: shown.height }} />
                <div
                  ref={layerRef}
                  className="editor-blur__layer"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onLostPointerCapture={() => setDrag(null)}
                  aria-hidden="true"
                >
                  {visible.map((region, index) => (
                    <div
                      key={index}
                      className="editor-blur__frame"
                      data-frame={index}
                      data-locked={index < locked ? 'true' : undefined}
                      data-selected={index === selected ? 'true' : undefined}
                      style={{ left: percent(region.x), top: percent(region.y), width: percent(region.width), height: percent(region.height) }}
                    >
                      <span className="editor-blur__badge">{index + 1}</span>
                      {index === selected &&
                        index >= locked &&
                        CORNERS.map((corner) => <span key={corner} className={`editor-blur__corner editor-blur__corner--${corner}`} data-corner={corner} />)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="editor-blur__side">
            <section>
              <h3 className="editor-card__heading">Что размыть</h3>
              <p className="editor-blur__text">
                Лица людей, номера машин, фамилии и телефоны на табличках — всё, по чему можно узнать человека.
              </p>
            </section>
            <section>
              <h3 className="editor-card__heading">Как</h3>
              <ol className="editor-blur__steps">
                <li>Протяните мышью по фото — появится рамка, и место в ней сразу размоется.</li>
                <li>Рамку можно двигать, углы — тянуть. Delete убирает выбранную, Ctrl+Z отменяет.</li>
                <li>«Применить» — фото точки заменится размытым.</li>
              </ol>
            </section>
            <section aria-labelledby="blur-frames">
              <h3 id="blur-frames" className="editor-card__heading">
                Рамки <span className="editor-blur__count">{regions.length}</span>
              </h3>
              {regions.length === 0 ? (
                <p className="editor-section__hint">Пока ни одной.</p>
              ) : (
                <ul className="editor-blur__list">
                  {regions.map((_, index) => (
                    <li key={index} className="editor-blur__item" data-selected={index === selected ? 'true' : undefined}>
                      <button
                        type="button"
                        className="editor-blur__pick"
                        onClick={() => setSelected(index)}
                        aria-pressed={index === selected}
                        disabled={index < locked}
                      >
                        Рамка {index + 1}
                      </button>
                      {index < locked ? (
                        <span className="editor-blur__locked">уже размыта</span>
                      ) : (
                        <button
                          type="button"
                          className="editor-button editor-button--ghost editor-button--compact"
                          onClick={() => remove(index)}
                          aria-label={`Убрать рамку ${index + 1}`}
                        >
                          Убрать
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <label className="editor-check">
              <input type="checkbox" checked={showOriginal} onChange={(event) => setShowOriginal(event.target.checked)} disabled={!ready} />
              <span className="editor-check__text">Показать без размытия</span>
            </label>
            {ready && (
              <p className="editor-section__hint" data-blur-base={ready.base.kind}>
                {ready.base.kind === 'original'
                  ? 'Размытие ложится на исходный снимок: качество не страдает, а убранная рамка вернёт место как было.'
                  : 'Исходного снимка на этой машине нет — размытие ложится на само фото. Уже размытое так и останется размытым.'}
              </p>
            )}
            {dirty && inSharedFolder && (
              <p className="editor-section__hint">После «Сохранить» прежнее фото без размытия уберётся из общей папки.</p>
            )}
          </aside>
        </div>

        <div className="editor-blur__foot">
          {confirmClose ? (
            <>
              <p className="editor-blur__question" role="alert">
                Рамки не применены. Закрыть без размытия?
              </p>
              <div className="editor-dialog__actions">
                <button type="button" className="editor-button editor-button--primary" onClick={() => setConfirmClose(false)} autoFocus>
                  Остаться
                </button>
                <button type="button" className="editor-button editor-button--danger" onClick={onClose}>
                  Закрыть без размытия
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={problem ? 'editor-field__problem' : 'editor-blur__status'} role={problem ? 'alert' : 'status'}>
                {problem ?? (busy ? 'Размываю и сжимаю фото…' : dirty ? 'Студент увидит фото таким, как на экране.' : '')}
              </p>
              <div className="editor-dialog__actions">
                <button type="button" className="editor-button editor-button--ghost" onClick={requestClose} disabled={busy}>
                  Отмена
                </button>
                <button type="button" className="editor-button editor-button--primary" onClick={() => void apply()} disabled={!ready || !dirty || busy}>
                  {busy ? 'Размываю…' : 'Применить'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
