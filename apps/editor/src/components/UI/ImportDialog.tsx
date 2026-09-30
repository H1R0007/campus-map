import React, { useEffect, useMemo, useRef, useState } from 'react';
import { floorLabel } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { nextBuildingName } from '../../stores/editor/structureSlice';
import type { ImportFloor } from '../../stores/editor/structureSlice';
import type { PlanInput } from '../../stores/editor/structureSlice';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { guessPlace } from '../../import/guess';
import { checkPieces, floorFromText, importSummary, initialPiece, pieceId, rotatePiece } from '../../import/importModel';
import type { BuildingChoice, Piece, PieceTarget } from '../../import/importModel';
import { makePlan, metersPerUnitOf, previewPlan } from '../../import/output';
import { rotatedPage } from '../../import/planGeometry';
import { IMPORT_ACCEPT, displayName, readImportFiles } from '../../import/readers';
import type { ImportSheet, ReadProblem } from '../../import/readers';
import { clampBox, contentBox, scaleBox } from '../../import/trim';
import { plural } from '../../utils/labels';
import { digestOf } from '../../utils/planFiles';
import { CropEditor } from './CropEditor';
import { Icon } from './Icon';
import { DialogLayer } from './DialogLayer';

/**
 * Окно «Планы из файлов» (запись 48).
 *
 * Файлы бросают на редактор или выбирают кнопкой. Каждый лист получает
 * догадку — корпус, этаж, территория или «не план» — и откуда она взята;
 * поля обрезаются сами. Человек проверяет догадку, поправляет область и
 * поворот и добавляет всё разом — одной правкой, которую отменяет Ctrl+Z.
 */

/** Длинная сторона миниатюры: по ней же ищутся поля листа. */
const THUMB_SIDE = 640;
/** Длинная сторона листа в окне правки области. */
const PREVIEW_SIDE = 1400;

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
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [problems, setProblems] = useState<ReadProblem[]>([]);
  const [reading, setReading] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Куски, область которых человек трогал: автообрезка их больше не меняет. */
  const touched = useRef(new Set<string>());

  const dialogRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const close = () => {
    if (!busy) closeImport();
  };
  useDialogFocus(true, dialogRef, close);

  // Новые файлы — в конец списка: бросить ещё файл в открытое окно можно.
  useEffect(() => {
    if (request.files.length === 0) return;
    let cancelled = false;
    void (async () => {
      const read = await readImportFiles(request.files, (name) => !cancelled && setReading(name));
      if (cancelled) return;
      const metas = useEditorStore.getState().buildingMetas;
      const redo = request.preset.redo;
      const added = await Promise.all(
        read.sheets.map(async (sheet): Promise<Piece> => {
          const scaleText = sheet.drawingScale ? String(sheet.drawingScale.ratio) : '';
          if (!redo) return { ...initialPiece(sheet.id, guessPlace(sheet.clues), metas, request.preset), scaleText };
          // Переделка плана: тот лист того же файла — с прежними рамкой и
          // поворотом, остальные листы пропускаются.
          const same = (await digestOf(sheet.blob)).sha256.startsWith(redo.file.split('.')[0]) && sheet.page === redo.page;
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
            rotation: redo.rotation,
            crop: redo.crop,
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

      // Миниатюры и поля — по одному листу, чтобы окно оставалось живым.
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
  const selectedSheet = selected ? sheets.find((sheet) => sheet.id === selected.sheetId) ?? null : null;
  const unresolved = pieces.filter((piece) => checks.get(piece.id)?.problem).length;
  const toAdd = pieces.filter((piece) => piece.target.kind !== 'skip');

  const update = (id: string, change: (piece: Piece) => Piece) => {
    setPieces((previous) => previous.map((piece) => (piece.id === id ? change(piece) : piece)));
    setError(null);
  };

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
        setBusy(`Готовлю план ${index + 1} из ${toAdd.length}…`);
        const sheet = sheets.find((item) => item.id === piece.sheetId)!;
        const made = await makePlan(sheet, { rotation: piece.rotation, crop: piece.crop, scaleRatio: Number(piece.scaleText) || undefined });
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

  const empty = sheets.length === 0 && !reading;

  return (
    <DialogLayer>
      <div className="editor-dialog-backdrop" onClick={close}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-title"
          className="editor-dialog editor-dialog--import"
          onClick={(e) => e.stopPropagation()}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            addFiles(e.dataTransfer.files);
          }}
        >
          <div className="editor-help__head">
            <h2 id="import-title" className="editor-dialog__title">
              Загрузка планов
            </h2>
            <button type="button" className="editor-icon-button" onClick={close} aria-label="Закрыть окно планов">
              <Icon name="close" />
            </button>
          </div>

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
                Корпус и этаж редактор угадает по тексту на листе и имени файла и покажет, откуда догадка. Лишние поля
                листа обрежутся сами.
              </p>
              <button type="button" className="editor-button editor-button--primary" onClick={() => fileRef.current?.click()}>
                <Icon name="upload" />
                Выбрать файлы
              </button>
            </div>
          ) : (
            <div className="editor-import">
              <div className="editor-import__list">
                <ul aria-label="Листы">
                  {pieces.map((piece) => {
                    const sheet = sheets.find((item) => item.id === piece.sheetId)!;
                    const check = checks.get(piece.id);
                    return (
                      <li key={piece.id}>
                        <button
                          type="button"
                          className="editor-import__item"
                          aria-current={piece.id === selectedId ? 'true' : undefined}
                          onClick={() => setSelectedId(piece.id)}
                        >
                          <span className="editor-import__thumb">
                            {thumbs.get(sheet.id) && (
                              <img src={thumbs.get(sheet.id)} alt="" style={{ transform: `rotate(${piece.rotation}deg)` }} />
                            )}
                          </span>
                          <span className="editor-import__caption">
                            <span className="editor-import__name">{displayName(sheet)}</span>
                            <span className="editor-import__target">{targetText(piece.target, buildingMetas)}</span>
                            {check?.problem && <span className="editor-import__target editor-import__target--problem">{check.problem}</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {reading && <p className="editor-section__hint" role="status">Читаю «{reading}»…</p>}
                {problems.map((problem) => (
                  <p key={problem.name} className="editor-section__hint editor-section__hint--problem">
                    «{problem.name}»: {problem.problem}
                  </p>
                ))}
                <button type="button" className="editor-button editor-button--ghost editor-button--block" onClick={() => fileRef.current?.click()}>
                  <Icon name="plus" />
                  Ещё файлы…
                </button>
              </div>

              <div className="editor-import__detail">
                {selected && selectedSheet ? (
                  <PieceEditor
                    key={selected.id}
                    piece={selected}
                    sheet={selectedSheet}
                    pieces={pieces}
                    check={checks.get(selected.id) ?? { problem: null, note: null }}
                    onChange={(change) => {
                      update(selected.id, change);
                    }}
                    onTouchCrop={() => touched.current.add(selected.id)}
                    onSplit={() => {
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
                      setSelectedId(copy.id);
                    }}
                    onRemove={
                      pieces.filter((piece) => piece.sheetId === selected.sheetId).length > 1
                        ? () => {
                            setPieces((previous) => previous.filter((piece) => piece.id !== selected.id));
                            setSelectedId(pieces.find((piece) => piece.sheetId === selected.sheetId && piece.id !== selected.id)?.id ?? null);
                          }
                        : undefined
                    }
                  />
                ) : (
                  <p className="editor-section__hint">{reading ? 'Читаю файлы…' : 'Выберите лист слева.'}</p>
                )}
              </div>
            </div>
          )}

          <div className="editor-dialog__actions editor-import__actions">
            <p className="editor-import__status" role="status">
              {busy ??
                error ??
                (unresolved > 0
                  ? `Осталось решить: ${unresolved} ${plural(unresolved, ['лист', 'листа', 'листов'])}`
                  : pieces.length > toAdd.length
                    ? `Пропущено: ${pieces.length - toAdd.length} ${plural(pieces.length - toAdd.length, ['лист', 'листа', 'листов'])}`
                    : '')}
            </p>
            <button type="button" className="editor-button editor-button--ghost" onClick={close} disabled={busy !== null}>
              Отмена
            </button>
            <button
              type="button"
              className="editor-button editor-button--primary"
              onClick={() => void run()}
              disabled={busy !== null || reading !== null || toAdd.length === 0 || unresolved > 0}
            >
              {toAdd.length === 0 ? 'Добавить' : `Добавить: ${importSummary(toAdd)}`}
            </button>
          </div>
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

const PieceEditor: React.FC<{
  piece: Piece;
  sheet: ImportSheet;
  pieces: readonly Piece[];
  check: { problem: string | null; note: string | null };
  onChange: (change: (piece: Piece) => Piece) => void;
  onTouchCrop: () => void;
  onSplit: () => void;
  onRemove?: () => void;
}> = ({ piece, sheet, pieces, check, onChange, onTouchCrop, onSplit, onRemove }) => {
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const [preview, setPreview] = useState<{ rotation: number; url: string } | null>(null);
  const [trimming, setTrimming] = useState(false);
  const rotated = rotatedPage(sheet.size, piece.rotation).size;

  useEffect(() => {
    let cancelled = false;
    const scale = PREVIEW_SIDE / Math.max(rotated.width, rotated.height);
    void sheet.render(piece.rotation, null, scale).then((canvas) => {
      if (!cancelled) setPreview({ rotation: piece.rotation, url: canvas.toDataURL('image/png') });
    });
    return () => {
      cancelled = true;
    };
    // Лист перерисовывается только при повороте.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, piece.rotation]);

  const setTarget = (target: PieceTarget) => onChange((current) => ({ ...current, target }));
  const floorTarget = piece.target.kind === 'floor' ? piece.target : null;

  // Новые корпуса, уже названные в других листах, — в списке рядом с существующими.
  const newNames = [
    ...new Set(
      pieces.flatMap((item) =>
        item.target.kind === 'floor' && item.target.building && 'newName' in item.target.building ? [item.target.building.newName.trim()] : []
      )
    ),
  ].filter(Boolean);
  const choiceValue = (choice: BuildingChoice | null) =>
    choice === null ? '' : 'id' in choice ? `id:${choice.id}` : `new:${choice.newName.trim()}`;
  const suggestedName = nextBuildingName([...buildingMetas.values(), ...newNames.map((name) => ({ id: '', name, floors: [] }))]);

  const trim = async () => {
    setTrimming(true);
    try {
      const scale = THUMB_SIDE / Math.max(rotated.width, rotated.height);
      const canvas = await sheet.render(piece.rotation, null, scale);
      const box = contentBox(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
      onTouchCrop();
      onChange((current) => ({ ...current, crop: box ? clampBox(scaleBox(box, 1 / scale), rotated) : null, trimmed: box !== null }));
    } finally {
      setTrimming(false);
    }
  };

  const result = previewPlan(sheet, { rotation: piece.rotation, crop: piece.crop });
  const metersPerUnit = metersPerUnitOf(sheet, Number(piece.scaleText) || undefined);

  return (
    <section aria-label={`Лист: ${displayName(sheet)}`} className="editor-import__piece">
      <fieldset className="editor-fieldset">
        <legend className="editor-card__heading">Что на листе</legend>
        <div className="editor-card__actions" role="radiogroup" aria-label="Что на листе">
          {(
            [
              ['floor', 'Этаж корпуса'],
              ['campus', 'План территории'],
              ['skip', 'Не план — пропустить'],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={piece.target.kind === kind}
              className="editor-chip"
              onClick={() =>
                setTarget(
                  kind === 'floor'
                    ? floorTarget ?? { kind: 'floor', building: null, floorText: '', label: '' }
                    : { kind }
                )
              }
            >
              {label}
            </button>
          ))}
        </div>

        {floorTarget && (
          <div className="editor-card__row">
            <label className="editor-card__field flex-1">
              <span className="editor-section__hint">Корпус</span>
              <select
                aria-label="Корпус"
                className="editor-input"
                value={choiceValue(floorTarget.building)}
                onChange={(e) => {
                  const value = e.target.value;
                  const building: BuildingChoice | null =
                    value === '' ? null : value.startsWith('id:') ? { id: value.slice(3) } : { newName: value === 'new' ? suggestedName : value.slice(4) };
                  setTarget({ ...floorTarget, building });
                }}
              >
                <option value="">Выберите корпус</option>
                {[...buildingMetas.values()].map((meta) => (
                  <option key={meta.id} value={`id:${meta.id}`}>
                    {meta.name}
                  </option>
                ))}
                {newNames.map((name) => (
                  <option key={name} value={`new:${name}`}>
                    {name} — новый
                  </option>
                ))}
                <option value="new">Новый корпус…</option>
              </select>
            </label>
            {floorTarget.building && 'newName' in floorTarget.building && (
              <label className="editor-card__field flex-1">
                <span className="editor-section__hint">Название нового корпуса</span>
                <input
                  aria-label="Название нового корпуса"
                  className="editor-input"
                  value={floorTarget.building.newName}
                  onChange={(e) => setTarget({ ...floorTarget, building: { newName: e.target.value } })}
                />
              </label>
            )}
            <label className="editor-card__field">
              <span className="editor-section__hint">Этаж</span>
              <input
                aria-label="Номер этажа"
                className="editor-input editor-input--narrow"
                inputMode="decimal"
                value={floorTarget.floorText}
                placeholder="1"
                onChange={(e) => setTarget({ ...floorTarget, floorText: e.target.value })}
              />
            </label>
            <label className="editor-card__field">
              <span className="editor-section__hint">Подпись</span>
              <input
                aria-label="Подпись этажа"
                className="editor-input editor-input--narrow"
                value={floorTarget.label}
                placeholder={floorTarget.floorText.trim() || '—'}
                onChange={(e) => setTarget({ ...floorTarget, label: e.target.value })}
              />
            </label>
          </div>
        )}
      </fieldset>

      {check.problem && <p className="editor-section__hint editor-section__hint--problem">{check.problem}</p>}
      {check.note && <p className="editor-section__hint">{check.note}</p>}
      {piece.notes.length > 0 && (
        <ul className="editor-import__notes" aria-label="Откуда догадка">
          {piece.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      <div className="editor-card__actions" role="toolbar" aria-label="Лист">
        <button type="button" className="editor-button editor-button--ghost" onClick={() => onChange((current) => rotatePiece(current, sheet.size, -1))}>
          <Icon name="undo" />
          Повернуть влево
        </button>
        <button type="button" className="editor-button editor-button--ghost" onClick={() => onChange((current) => rotatePiece(current, sheet.size, 1))}>
          <Icon name="redo" />
          Повернуть вправо
        </button>
        <button type="button" className="editor-button editor-button--ghost" onClick={() => void trim()} disabled={trimming}>
          Обрезать поля
        </button>
        <button
          type="button"
          className="editor-button editor-button--ghost"
          onClick={() => {
            onTouchCrop();
            onChange((current) => ({ ...current, crop: null, trimmed: false }));
          }}
        >
          Весь лист
        </button>
        <button type="button" className="editor-button editor-button--ghost" onClick={onSplit}>
          <Icon name="plus" />
          Ещё область на этом листе
        </button>
        {onRemove && (
          <button type="button" className="editor-button editor-button--ghost" onClick={onRemove}>
            <Icon name="trash" />
            Убрать эту область
          </button>
        )}
      </div>

      <CropEditor
        imageUrl={preview?.rotation === piece.rotation ? preview.url : null}
        pageSize={rotated}
        crop={piece.crop}
        onChange={(crop) => {
          onTouchCrop();
          onChange((current) => ({ ...current, crop, trimmed: false }));
        }}
      />
      <p className="editor-section__hint">
        {piece.trimmed ? 'Поля обрезаны сами — поправьте рамку, если план задело. ' : ''}
        Получится: {result.format.toUpperCase()}, {result.size.width} × {result.size.height} точек
        {result.asIs ? ' — файл как есть' : ''}
        {metersPerUnit ? `, 1 точка = ${String(Math.round((metersPerUnit / result.scale) * 10000) / 10000).replace('.', ',')} м` : ''}.
      </p>
      {sheet.unitMeters !== undefined && (
        sheet.realScale ? (
          <p className="editor-section__hint">Чертёж в натуральную величину: масштаб известен сам — корпус встанет на территорию в своём размере.</p>
        ) : (
          <label className="editor-card__field">
            <span className="editor-section__hint">Масштаб чертежа</span>
            <span className="editor-place-field__row">
              1 :
              <input
                aria-label="Масштаб чертежа"
                className="editor-input editor-input--narrow"
                inputMode="numeric"
                value={piece.scaleText ?? ''}
                placeholder="200"
                onChange={(e) => onChange((current) => ({ ...current, scaleText: e.target.value.replace(/[^\d]/g, '') }))}
              />
            </span>
            <span className="editor-section__hint">
              {sheet.drawingScale && piece.scaleText === String(sheet.drawingScale.ratio)
                ? `По надписи на листе «${sheet.drawingScale.text}» — корпус встанет на территорию в своём размере`
                : 'Если масштаб указан на листе, впишите его — корпус встанет на территорию в своём размере. Не знаете — оставьте пустым'}
            </span>
          </label>
        )
      )}

    </section>
  );
};
