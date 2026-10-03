import React, { useEffect, useMemo, useRef, useState } from 'react';
import { floorLabel } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import type { ImportFloor } from '../../stores/editor/structureSlice';
import type { PlanInput } from '../../stores/editor/structureSlice';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { guessPlace } from '../../import/guess';
import { checkPieces, floorFromText, importSummary, initialPiece, pieceId } from '../../import/importModel';
import type { Piece, PieceCheck, PieceTarget } from '../../import/importModel';
import { makePlan } from '../../import/output';
import { rotatedPage } from '../../import/planGeometry';
import { emptyHistory, record, redo, undo } from '../../import/pieceHistory';
import type { History } from '../../import/pieceHistory';
import { IMPORT_ACCEPT, displayName, readImportFiles } from '../../import/readers';
import type { ImportSheet, ReadProblem } from '../../import/readers';
import { clampBox, contentBox, scaleBox } from '../../import/trim';
import { plural } from '../../utils/labels';
import { digestOf } from '../../utils/planFiles';
import { PieceProperties } from './PieceProperties';
import { SheetCanvas } from './SheetCanvas';
import type { SheetPictures } from './SheetCanvas';
import { TOOLS } from './sheetToolList';
import type { SheetTool } from './sheetToolList';
import { Icon } from './Icon';
import { DialogLayer } from './DialogLayer';

/**
 * Мастерская листов (записи 48 и 80) — планы из файлов, во весь экран.
 *
 * Файлы бросают на редактор или выбирают кнопкой. Каждый лист получает
 * догадку — корпус, этаж, территория или «не план» — и откуда она взята;
 * поля обрезаются сами. Слева — листы с отметками, посередине — лист, который
 * приближают и двигают, как карту, справа — его свойства. Enter — лист
 * готов, дальше следующий, где нужен взгляд. Ctrl+Z отменяет правку листа.
 * Инструменты листа (запись 81) — буквами: V, H, P, R, X, B.
 * В карту всё попадает разом — одной правкой, которую отменяет Ctrl+Z
 * редактора.
 */

/** Длинная сторона миниатюры: по ней же ищутся поля листа. */
const THUMB_SIDE = 640;

const NO_CHECK: PieceCheck = { problem: null, note: null };

type Mark = 'done' | 'problem' | 'skip' | 'todo';
const MARKS: Record<Mark, { icon: 'checkCircle' | 'warning' | 'ban' | 'dot'; text: string }> = {
  done: { icon: 'checkCircle', text: 'Проверен' },
  problem: { icon: 'warning', text: 'Нужно решить' },
  skip: { icon: 'ban', text: 'Пропускается' },
  todo: { icon: 'dot', text: 'Ещё не проверен' },
};

export const ImportDialog: React.FC = () => {
  const request = useEditorStore((s) => s.importRequest);
  return request ? <ImportWindow /> : null;
};

const ImportWindow: React.FC = () => {
  const request = useEditorStore((s) => s.importRequest)!;
  const closeImport = useEditorStore((s) => s.closeImport);
  const openImport = useEditorStore((s) => s.openImport);
  const importPlans = useEditorStore((s) => s.importPlans);
  const startAlignment = useEditorStore((s) => s.startAlignment);
  const showNotice = useEditorStore((s) => s.showNotice);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const planFiles = useEditorStore((s) => s.planFiles);

  const [sheets, setSheets] = useState<ImportSheet[]>([]);
  const [pieces, setPiecesState] = useState<Piece[]>([]);
  /** Листы — и в ссылке: правки по ходу перетаскивания читают самое свежее. */
  const piecesRef = useRef<Piece[]>([]);
  const setPieces = (change: (list: Piece[]) => Piece[]) => {
    piecesRef.current = change(piecesRef.current);
    setPiecesState(piecesRef.current);
  };
  const [problems, setProblems] = useState<ReadProblem[]>([]);
  const [reading, setReading] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [corner, setCorner] = useState<number | null>(null);
  /** Инструмент — один на всю мастерскую: вырезать штамп на листе за листом, не выбирая заново. */
  const [tool, setTool] = useState<SheetTool>('select');
  /** Шаг назад по Escape у холста: меню, начатая обводка, инструмент, выбранный угол. */
  const canvasEscape = useRef<(() => boolean) | null>(null);
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  /** История правок — у каждого листа своя: Ctrl+Z отменяет правку того листа, что открыт. */
  const [histories, setHistories] = useState<ReadonlyMap<string, History<Piece>>>(new Map());
  /** Состояние листа в начале перетаскивания: в историю — только если лист изменился. */
  const gesture = useRef<{ id: string; before: Piece } | null>(null);
  /** Куски, область которых человек трогал: автообрезка их больше не меняет. */
  const touched = useRef(new Set<string>());
  const pictures = useRef<SheetPictures>(new Map()).current;

  const dialogRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  const dirty = confirmed.size > 0 || [...histories.values()].some((history) => history.past.length > 0);
  // Escape — по одному шагу назад: сначала холст (меню, обводка, инструмент,
  // выбранный угол), затем вопрос, затем спросить, бросать ли сделанное, и
  // только потом закрыть.
  const close = () => {
    if (busy) return;
    if (asking) {
      setAsking(false);
      return;
    }
    if (canvasEscape.current?.()) return;
    if (corner !== null) setCorner(null);
    else if (dirty) setAsking(true);
    else closeImport();
  };
  useDialogFocus(true, dialogRef, close);
  useEffect(() => {
    if (asking) backRef.current?.focus();
  }, [asking]);

  // Новые файлы — в конец списка: бросить ещё файл в открытую мастерскую можно.
  useEffect(() => {
    if (request.files.length === 0) return;
    let cancelled = false;
    void (async () => {
      const read = await readImportFiles(request.files, (name) => !cancelled && setReading(name));
      if (cancelled) return;
      const metas = useEditorStore.getState().buildingMetas;
      const redoPlan = request.preset.redo;
      const added = await Promise.all(
        read.sheets.map(async (sheet): Promise<Piece> => {
          const scaleText = sheet.drawingScale ? String(sheet.drawingScale.ratio) : '';
          if (!redoPlan) return { ...initialPiece(sheet.id, guessPlace(sheet.clues), metas, request.preset), scaleText };
          // Переделка плана: тот лист того же файла — с прежними рамкой и
          // поворотом, остальные листы пропускаются.
          const same = (await digestOf(sheet.blob)).sha256.startsWith(redoPlan.file.split('.')[0]) && sheet.page === redoPlan.page;
          const id = pieceId();
          if (!same) return { id, sheetId: sheet.id, rotation: 0, crop: null, trimmed: false, target: { kind: 'skip' }, notes: ['Другой лист — план этажа не с него'] };
          touched.current.add(id);
          const target: PieceTarget =
            request.preset.building === undefined
              ? { kind: 'campus' }
              : { kind: 'floor', building: { id: request.preset.building }, floorText: String(request.preset.floor ?? ''), label: '' };
          return {
            id,
            sheetId: sheet.id,
            rotation: redoPlan.rotation,
            crop: redoPlan.crop,
            outline: redoPlan.outline ?? null,
            trimmed: false,
            target,
            notes: ['Тот же лист, что у плана сейчас: поправьте рамку или поворот'],
            redo: true,
            scaleText,
          };
        })
      );
      if (cancelled) return;
      setSheets((previous) => [...previous, ...read.sheets]);
      setPieces((previous) => [...previous, ...added]);
      setProblems((previous) => [...previous, ...read.problems]);
      setSelectedId((previous) => previous ?? (added.find((piece) => piece.target.kind !== 'skip') ?? added[0])?.id ?? null);
      setReading(null);

      // Миниатюры и поля — по одному листу, чтобы мастерская оставалась живой.
      for (const sheet of read.sheets) {
        if (cancelled) return;
        try {
          const scale = THUMB_SIDE / Math.max(sheet.size.width, sheet.size.height);
          const canvas = await sheet.render(0, null, scale);
          if (cancelled) return;
          setThumbs((previous) => new Map(previous).set(sheet.id, canvas.toDataURL('image/png')));
          // Вектор обрезать незачем: у чертежа полей нет, а SVG уже по плану.
          if (sheet.kind === 'svg' || sheet.kind === 'dxf') continue;
          const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
          const box = contentBox(data, canvas.width, canvas.height);
          if (!box || box.width * box.height > canvas.width * canvas.height * 0.97) continue;
          const crop = clampBox(scaleBox(box, 1 / scale), sheet.size);
          setPieces((previous) =>
            previous.map((piece) =>
              piece.sheetId === sheet.id && piece.rotation === 0 && !touched.current.has(piece.id) && piece.target.kind !== 'skip'
                ? { ...piece, crop, trimmed: true }
                : piece
            )
          );
        } catch {
          // Миниатюра не нарисовалась — лист всё равно можно добавить.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Реагируем только на новую просьбу: файлы в ней те же.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id]);

  const checks = useMemo(() => checkPieces(pieces, buildingMetas, planFiles), [pieces, buildingMetas, planFiles]);
  const selected = pieces.find((piece) => piece.id === selectedId) ?? null;
  const selectedSheet = selected ? (sheets.find((sheet) => sheet.id === selected.sheetId) ?? null) : null;
  // Размер листа — один объект, пока лист и поворот те же: холст по нему вписывает лист.
  const rotation = selected?.rotation;
  const page = useMemo(
    () => (selectedSheet && rotation !== undefined ? rotatedPage(selectedSheet.size, rotation).size : null),
    [selectedSheet, rotation]
  );
  const unresolved = pieces.filter((piece) => checks.get(piece.id)?.problem).length;
  const toAdd = pieces.filter((piece) => piece.target.kind !== 'skip');
  const checked = toAdd.filter((piece) => confirmed.has(piece.id)).length;
  const history = selected ? (histories.get(selected.id) ?? emptyHistory<Piece>()) : emptyHistory<Piece>();

  const markOf = (piece: Piece): Mark =>
    checks.get(piece.id)?.problem ? 'problem' : piece.target.kind === 'skip' ? 'skip' : confirmed.has(piece.id) ? 'done' : 'todo';

  // --- правки и их история ---

  const pieceOf = (id: string) => piecesRef.current.find((piece) => piece.id === id) ?? null;
  const writeHistory = (id: string, change: (history: History<Piece>) => History<Piece>) =>
    setHistories((previous) => new Map(previous).set(id, change(previous.get(id) ?? emptyHistory<Piece>())));
  const replace = (next: Piece) => {
    // Рамку, контур или поворот поправил человек — автообрезка их больше не трогает.
    const before = pieceOf(next.id);
    if (before && (before.crop !== next.crop || before.outline !== next.outline || before.rotation !== next.rotation)) touched.current.add(next.id);
    setPieces((previous) => previous.map((piece) => (piece.id === next.id ? next : piece)));
    setError(null);
  };
  /** Правка одним действием; подряд с одним ключом — одна запись истории. */
  const edit = (id: string, change: (piece: Piece) => Piece, key: string | null = null) => {
    const before = pieceOf(id);
    if (!before) return;
    const after = change(before);
    if (after === before) return;
    gesture.current = null;
    writeHistory(id, (h) => record(h, before, key));
    replace(after);
  };
  const startGesture = (id: string) => {
    const before = pieceOf(id);
    gesture.current = before && { id, before };
  };
  /** Перетаскивание: первая перемена пишет в историю состояние до него, остальные — нет. */
  const drag = (id: string, change: (piece: Piece) => Piece) => {
    const before = pieceOf(id);
    if (!before) return;
    const after = change(before);
    if (after === before) return;
    const started = gesture.current;
    if (started?.id === id) {
      writeHistory(id, (h) => record(h, started.before));
      gesture.current = null;
    }
    replace(after);
  };
  const step = (kind: 'undo' | 'redo') => {
    if (!selected) return;
    const result = (kind === 'undo' ? undo : redo)(histories.get(selected.id) ?? emptyHistory<Piece>(), selected);
    if (!result) return;
    setHistories((previous) => new Map(previous).set(selected.id, result.history));
    replace(result.value);
    setCorner(null);
  };

  // --- листы ---

  const select = (id: string | null) => {
    setSelectedId(id);
    setCorner(null);
  };
  const neighbour = (offset: 1 | -1) => {
    if (pieces.length === 0) return;
    const index = pieces.findIndex((piece) => piece.id === selectedId);
    const next = pieces[Math.min(pieces.length - 1, Math.max(0, index + offset))];
    if (next) select(next.id);
  };
  /** Лист готов: отметить и открыть следующий, где нужен взгляд; таких нет — к кнопке «Добавить». */
  const confirmAndNext = () => {
    if (!selected || checks.get(selected.id)?.problem) return;
    const done = new Set(confirmed).add(selected.id);
    setConfirmed(done);
    const index = pieces.indexOf(selected);
    const order = [...pieces.slice(index + 1), ...pieces.slice(0, index)];
    // По порядку списка, а не прыжками по документу: с ошибкой или ещё не проверенный.
    const next = order.find((piece) => checks.get(piece.id)?.problem || (piece.target.kind !== 'skip' && !done.has(piece.id)));
    if (next) select(next.id);
    else addRef.current?.focus();
  };
  const split = () => {
    if (!selected) return;
    const copy: Piece = {
      ...selected,
      id: pieceId(),
      target: selected.target.kind === 'floor' ? { ...selected.target, floorText: '' } : selected.target,
      notes: ['Ещё одна область того же листа — выберите её и укажите этаж'],
      redo: false,
    };
    touched.current.add(copy.id);
    setPieces((previous) => {
      const index = previous.findIndex((piece) => piece.id === selected.id);
      return [...previous.slice(0, index + 1), copy, ...previous.slice(index + 1)];
    });
    select(copy.id);
  };
  const remove =
    selected && pieces.filter((piece) => piece.sheetId === selected.sheetId).length > 1
      ? () => {
          setPieces((previous) => previous.filter((piece) => piece.id !== selected.id));
          select(pieces.find((piece) => piece.sheetId === selected.sheetId && piece.id !== selected.id)?.id ?? null);
        }
      : undefined;

  const addFiles = (files: FileList | null) => {
    if (files && files.length > 0) openImport([...files], request.preset);
  };

  const run = async () => {
    if (toAdd.length === 0 || unresolved > 0) return;
    setError(null);
    try {
      const floors: ImportFloor[] = [];
      let campus: PlanInput | undefined;
      for (const [index, piece] of toAdd.entries()) {
        setBusy(`Подготовка плана ${index + 1} из ${toAdd.length}…`);
        const sheet = sheets.find((item) => item.id === piece.sheetId)!;
        const made = await makePlan(sheet, { rotation: piece.rotation, crop: piece.crop, outline: piece.outline ?? null, scaleRatio: Number(piece.scaleText) || undefined });
        const plan: PlanInput = { key: made.key, format: made.format, mapSize: made.mapSize, source: made.source };
        const target = piece.target;
        if (target.kind === 'campus') campus = plan;
        else if (target.kind === 'floor' && target.building) {
          floors.push({
            building: target.building,
            floor: floorFromText(target.floorText),
            ...(target.label.trim() ? { label: target.label.trim() } : {}),
            plan,
          });
        }
      }
      const result = importPlans({ floors, campus });
      if (result.problem) {
        setError(result.problem);
        return;
      }
      closeImport();
      showNotice(`Добавлено: ${importSummary(toAdd)}. Сохраните — тогда планы попадут в data/`);
      // Этажи, где точки остались в прежних координатах, — сразу к совмещению.
      if (result.align.length > 0) startAlignment(result.align);
    } catch (cause) {
      setError(`Не получилось подготовить план: ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setBusy(null);
    }
  };

  // Клавиши мастерской. Поля ввода — свои: Ctrl+Z в поле отменяет набор в нём.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (asking || busy) return;
    const target = event.target as HTMLElement;
    const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
    const ctrl = event.ctrlKey || event.metaKey;
    const shortcut = !typing && !ctrl && !event.altKey && !event.shiftKey ? TOOLS.find((info) => info.code === event.code) : undefined;
    if (shortcut) {
      event.preventDefault();
      setTool(shortcut.tool);
    } else if (ctrl && !event.altKey && !typing && (event.code === 'KeyZ' || event.code === 'KeyY')) {
      event.preventDefault();
      step(event.code === 'KeyY' || event.shiftKey ? 'redo' : 'undo');
    } else if (event.key === 'PageDown' || event.key === 'PageUp') {
      event.preventDefault();
      neighbour(event.key === 'PageDown' ? 1 : -1);
    } else if (
      event.key === 'Enter' &&
      !ctrl &&
      (target.classList.contains('editor-workshop__canvas') || (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'file'))
    ) {
      event.preventDefault();
      confirmAndNext();
    }
  };

  const empty = sheets.length === 0 && !reading;
  const status =
    busy ??
    error ??
    (unresolved > 0
      ? `Осталось решить: ${unresolved} ${plural(unresolved, ['лист', 'листа', 'листов'])}`
      : pieces.length > toAdd.length
        ? `Пропущено: ${pieces.length - toAdd.length} ${plural(pieces.length - toAdd.length, ['лист', 'листа', 'листов'])}`
        : toAdd.length > 0 && checked === toAdd.length
          ? 'Все листы проверены — можно добавлять'
          : '');

  return (
    <DialogLayer>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        className="editor-dialog editor-dialog--import editor-workshop"
        onKeyDown={onKeyDown}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          addFiles(e.dataTransfer.files);
        }}
      >
        {asking && (
          <div className="editor-workshop__ask" role="alertdialog" aria-modal="true" aria-labelledby="workshop-ask-title" aria-describedby="workshop-ask-text">
            <div className="editor-dialog">
              <h3 id="workshop-ask-title" className="editor-dialog__title">
                Закрыть мастерскую?
              </h3>
              <p id="workshop-ask-text" className="editor-dialog__text">
                Правки листов пропадут: в карту попадает только то, что добавлено кнопкой «Добавить».
              </p>
              <div className="editor-dialog__actions">
                <button ref={backRef} type="button" className="editor-button editor-button--primary" onClick={() => setAsking(false)}>
                  Вернуться к листам
                </button>
                <button type="button" className="editor-button editor-button--ghost" onClick={closeImport}>
                  Закрыть без добавления
                </button>
              </div>
            </div>
          </div>
        )}

        <header className="editor-workshop__head">
          <Icon name="layers" />
          <h2 id="import-title" className="editor-dialog__title">
            Мастерская листов
          </h2>
          {toAdd.length > 0 && (
            <span className="editor-workshop__progress" aria-live="polite">
              Проверено {checked} из {toAdd.length}
            </span>
          )}
          <div className="editor-workshop__history" role="group" aria-label="Правки листа">
            <button
              type="button"
              className="editor-icon-button"
              aria-label="Отменить правку листа"
              title="Отменить правку листа (Ctrl+Z)"
              disabled={history.past.length === 0}
              onClick={() => step('undo')}
            >
              <Icon name="undo" />
            </button>
            <button
              type="button"
              className="editor-icon-button"
              aria-label="Повторить правку листа"
              title="Повторить правку листа (Ctrl+Y)"
              disabled={history.future.length === 0}
              onClick={() => step('redo')}
            >
              <Icon name="redo" />
            </button>
          </div>
          <span className="editor-workshop__keys">PageUp / PageDown — соседний лист · Enter — лист готов · правая кнопка — меню</span>
          <button type="button" className="editor-icon-button" onClick={close} aria-label="Закрыть мастерскую листов" title="Закрыть (Esc)">
            <Icon name="close" />
          </button>
        </header>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept={IMPORT_ACCEPT}
          className="sr-only"
          data-import-files
          tabIndex={-1}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {empty ? (
          <div className="editor-import__empty">
            <Icon name="upload" size={32} />
            <p>Перетащите сюда планы: PDF, сканы и картинки, чертежи DXF, архивы ZIP — сколько угодно разом.</p>
            <p className="editor-section__hint">
              Корпус и этаж редактор угадает по тексту на листе и имени файла и покажет, откуда догадка. Лишние поля листа
              обрежутся сами, а лист можно приблизить колесом, чтобы поправить контур до угла.
            </p>
            <button type="button" className="editor-button editor-button--primary" data-autofocus onClick={() => fileRef.current?.click()}>
              <Icon name="upload" />
              Выбрать файлы
            </button>
          </div>
        ) : (
          <div className="editor-workshop__body">
            <nav className="editor-import__list" aria-label="Листы">
              <ul>
                {pieces.map((piece) => {
                  const sheet = sheets.find((item) => item.id === piece.sheetId)!;
                  const check = checks.get(piece.id);
                  const mark = MARKS[markOf(piece)];
                  return (
                    <li key={piece.id}>
                      <button
                        type="button"
                        className={`editor-import__item editor-import__item--${markOf(piece)}`}
                        aria-current={piece.id === selectedId ? 'true' : undefined}
                        onClick={() => select(piece.id)}
                      >
                        <span className="editor-import__thumb">
                          {thumbs.get(sheet.id) && <img src={thumbs.get(sheet.id)} alt="" style={{ transform: `rotate(${piece.rotation}deg)` }} />}
                        </span>
                        <span className="editor-import__caption">
                          <span className="editor-import__name">{displayName(sheet)}</span>
                          <span className="editor-import__target">{targetText(piece.target, buildingMetas)}</span>
                          {check?.problem && <span className="editor-import__target editor-import__target--problem">{check.problem}</span>}
                        </span>
                        <span className="editor-import__mark" title={mark.text}>
                          <Icon name={mark.icon} />
                          <span className="sr-only">{mark.text}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {reading && (
                <p className="editor-section__hint" role="status">
                  Чтение «{reading}»…
                </p>
              )}
              {problems.map((problem) => (
                <p key={problem.name} className="editor-section__hint editor-section__hint--problem">
                  «{problem.name}»: {problem.problem}
                </p>
              ))}
              <button type="button" className="editor-button editor-button--ghost editor-button--block" onClick={() => fileRef.current?.click()}>
                <Icon name="plus" />
                Ещё файлы…
              </button>
            </nav>

            {selected && selectedSheet && page ? (
              <SheetCanvas
                key={selected.id}
                sheet={selectedSheet}
                piece={selected}
                page={page}
                pictures={pictures}
                selected={corner}
                onSelect={setCorner}
                onGesture={() => startGesture(selected.id)}
                onDrag={(change) => drag(selected.id, change)}
                onEdit={(change, key) => edit(selected.id, change, key ?? null)}
                tool={tool}
                onTool={setTool}
                escapeRef={canvasEscape}
              />
            ) : (
              <div className="editor-workshop__center editor-workshop__center--empty">
                <p className="editor-section__hint">{reading ? 'Чтение файлов…' : 'Выберите лист слева.'}</p>
              </div>
            )}

            <aside className="editor-import__detail" aria-label="Свойства листа">
              {selected && selectedSheet && page && (
                <PieceProperties
                  key={selected.id}
                  piece={selected}
                  sheet={selectedSheet}
                  page={page}
                  pieces={pieces}
                  check={checks.get(selected.id) ?? NO_CHECK}
                  confirmed={confirmed.has(selected.id)}
                  onEdit={(change, key) => edit(selected.id, change, key ?? null)}
                  onConfirm={confirmAndNext}
                  onSplit={split}
                  onRemove={remove}
                />
              )}
            </aside>
          </div>
        )}

        {/* Кнопки — последние в окне: «Добавить» замыкает и порядок Tab. */}
        <div className="editor-dialog__actions editor-import__actions">
          <p className="editor-import__status" role="status">
            {status}
          </p>
          <button type="button" className="editor-button editor-button--ghost" onClick={close} disabled={busy !== null}>
            Отмена
          </button>
          <button
            ref={addRef}
            type="button"
            className="editor-button editor-button--primary"
            onClick={() => void run()}
            disabled={busy !== null || reading !== null || toAdd.length === 0 || unresolved > 0}
          >
            {toAdd.length === 0 ? 'Добавить' : `Добавить: ${importSummary(toAdd)}`}
          </button>
        </div>
      </div>
    </DialogLayer>
  );
};

/** Куда пойдёт кусок — коротко, для списка. */
function targetText(target: PieceTarget, metas: ReadonlyMap<string, { name: string }>): string {
  if (target.kind === 'skip') return 'Пропустить';
  if (target.kind === 'campus') return 'План территории';
  const building = target.building === null ? '?' : 'id' in target.building ? (metas.get(target.building.id)?.name ?? '?') : target.building.newName;
  const number = floorFromText(target.floorText);
  const floor = target.label.trim() || (Number.isFinite(number) ? floorLabel(undefined, number) : target.floorText.trim() || '?');
  return `${building}, этаж ${floor}`;
}
