import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Landmark, PointPhoto, TurnDirection } from '@campus-map/core';
import { MAX_LANDMARK_LENGTH, TURN_DIRECTIONS } from '@campus-map/core';
import { SPACE } from '../../config/space';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useEditorStore } from '../../stores/editorStore';
import { TRANSITION_LABELS } from '../../utils/labels';
import { englishAt, russianAt } from '../../utils/landmarkPhrase';
import { TURN_WORDS, passagesOf, sideLabel, stepSentence } from '../../utils/landmarkPassages';
import { holdProcessedPhoto, photoSrc } from '../../utils/photoFiles';
import { PhotoReadError, processPhoto } from '../../utils/photoProcessing';
import { useCardEdit } from './cardEdit';
import { CommitField, InfoTip } from './Field';
import { Icon } from './Icon';

/**
 * Ориентир и фото точки в её карточке (запись 87).
 *
 * Разделы отдельные: ориентир — слова, которыми навигатор поведёт студента,
 * фото — то, как место выглядит. У каждого раздела свой путь новичка: пустое
 * состояние объясняет, зачем раздел, и сразу даёт поле или кнопку.
 */

/** Сколько фото у одной точки: больше на шаге никто не пролистает. */
const MAX_PHOTOS = 6;

/** Пример поворота в предложении студента: какой будет на деле, решает маршрут. */
const EXAMPLE_TURN: TurnDirection = 'left';

const NO_PHOTOS: PointPhoto[] = [];

/* ------------------------------------------------------------------ */
/* Ориентир                                                            */
/* ------------------------------------------------------------------ */

/** Новый ориентир: фраза — сразу из названия. */
function newLandmark(name: string): Landmark {
  const at = russianAt(name);
  return at === null ? { name } : { name, at };
}

/** Проверка строки ориентира: текст отказа или `null`. */
function landmarkTextProblem(value: string, what: string): string | null {
  const text = value.trim();
  if (text.length === 0) return `${what} не может быть пустым`;
  if (text.length > MAX_LANDMARK_LENGTH) return `${what} длиннее ${MAX_LANDMARK_LENGTH} знаков — это подпись, а не описание`;
  return null;
}

export const LandmarkSection: React.FC<{ nodeId: string }> = ({ nodeId }) => {
  const landmark = useEditorStore((s) => s.nodes.get(nodeId)?.landmark);
  const setNodeLandmark = useEditorStore((s) => s.setNodeLandmark);
  const edit = useCardEdit();
  const update = (next: Landmark | null) => edit(() => setNodeLandmark(nodeId, next));

  return (
    <section className="editor-card__section" aria-labelledby="card-landmark" data-landmark-section>
      <div className="editor-card__heading-row">
        <h3 id="card-landmark" className="editor-card__heading">
          Ориентир
        </h3>
        <InfoTip about="Ориентир">
          Заметная вещь у точки — автомат, турникеты, стенд. Маршрут через точку получит шаг «У … поверните налево»;
          налево, направо или прямо навигатор считает сам по маршруту.
        </InfoTip>
      </div>
      {landmark ? <LandmarkEditor nodeId={nodeId} landmark={landmark} onChange={update} /> : <LandmarkStart onCreate={(name) => update(newLandmark(name))} />}
    </section>
  );
};

/** Пустое состояние: зачем ориентир — и сразу поле названия с живым предложением. */
const LandmarkStart: React.FC<{ onCreate: (name: string) => void }> = ({ onCreate }) => {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const at = russianAt(text);

  const commit = () => {
    if (text.trim().length === 0) return;
    const error = landmarkTextProblem(text, 'Название');
    setProblem(error);
    if (error === null) onCreate(text.trim());
  };

  return (
    <div className="editor-landmark">
      <p className="editor-section__hint">Что видно у этой точки издалека? Навигатор назовёт это на шаге маршрута.</p>
      <label className="editor-field">
        <span className="editor-field__label">Название ориентира</span>
        <input
          className="editor-input"
          value={text}
          placeholder="Например: Кофейный автомат"
          aria-invalid={problem !== null}
          onChange={(event) => {
            setText(event.target.value);
            setProblem(null);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') {
              event.stopPropagation();
              setText('');
              setProblem(null);
            }
          }}
        />
      </label>
      {problem !== null && (
        <span className="editor-field__problem" role="alert">
          {problem}
        </span>
      )}
      {at !== null && problem === null && (
        <p className="editor-landmark__sentence" aria-live="polite">
          Студент прочтёт: «{stepSentence(at, EXAMPLE_TURN)}» — Enter, чтобы добавить
        </p>
      )}
    </div>
  );
};

const LandmarkEditor: React.FC<{ nodeId: string; landmark: Landmark; onChange: (next: Landmark | null) => void }> = ({
  nodeId,
  landmark,
  onChange,
}) => {
  const english = landmark.translations?.en;

  /** Название сменилось — фраза, которую предложил редактор, идёт за ним; своя остаётся. */
  const renameRu = (value: string): string | null => {
    const problem = landmarkTextProblem(value, 'Название');
    if (problem) return problem;
    const name = value.trim();
    const wasAuto = landmark.at === undefined || landmark.at === russianAt(landmark.name);
    onChange({ ...landmark, name, at: wasAuto ? (russianAt(name) ?? undefined) : landmark.at });
    return null;
  };

  const renameEn = (value: string): string | null => {
    const name = value.trim();
    const translations = { ...(landmark.translations ?? {}) };
    if (name.length === 0) {
      delete translations.en;
    } else {
      const problem = landmarkTextProblem(name, 'Название');
      if (problem) return problem;
      const wasAuto = !english || english.at === undefined || english.at === englishAt(english.name);
      translations.en = { name, at: wasAuto ? (englishAt(name) ?? undefined) : english?.at };
    }
    onChange({ ...landmark, translations: Object.keys(translations).length > 0 ? translations : undefined });
    return null;
  };

  return (
    <div className="editor-landmark">
      <CommitField
        label="Название"
        ariaLabel="Название ориентира"
        value={landmark.name}
        placeholder="Например: Кофейный автомат"
        info="Как ориентир подписан на карте навигатора и под его фото."
        onCommit={renameRu}
      />
      <PhraseBlock
        label="Студент прочтёт"
        sentence={(at) => stepSentence(at, EXAMPLE_TURN)}
        phrase={landmark.at}
        auto={russianAt(landmark.name)}
        hint="Налево, направо или прямо — навигатор решит по маршруту."
        onChange={(at) => onChange({ ...landmark, at })}
      />

      <div className="editor-landmark__group" role="group" aria-labelledby={`landmark-en-${nodeId}`}>
        <h4 id={`landmark-en-${nodeId}`} className="editor-landmark__subheading">
          По-английски
        </h4>
        <CommitField
          label="Название"
          ariaLabel="Название ориентира по-английски"
          value={english?.name ?? ''}
          placeholder="Coffee machine"
          onCommit={renameEn}
        />
        {english ? (
          <PhraseBlock
            label="Иностранный студент прочтёт"
            sentence={(at) => `Turn left ${at}`}
            phrase={english.at}
            auto={englishAt(english.name)}
            onChange={(at) =>
              onChange({ ...landmark, translations: { ...(landmark.translations ?? {}), en: { ...english, at } } })
            }
          />
        ) : (
          <p className="editor-section__hint">Без перевода английский навигатор скажет «Turn left» и покажет название по-русски.</p>
        )}
      </div>

      <PassagesBlock nodeId={nodeId} landmark={landmark} onChange={onChange} />

      <div className="editor-card__actions">
        <button type="button" className="editor-button editor-button--danger" onClick={() => onChange(null)}>
          <Icon name="trash" />
          Убрать ориентир
        </button>
      </div>
    </div>
  );
};

/**
 * Готовое предложение студента и фраза в нём. Фразу редактор составил сам;
 * если падеж вышел неверный, её правят прямо здесь, а «Как предлагает
 * редактор» возвращает догадку.
 */
const PhraseBlock: React.FC<{
  label: string;
  sentence: (at: string) => string;
  phrase: string | undefined;
  auto: string | null;
  hint?: string;
  onChange: (at: string | undefined) => void;
}> = ({ label, sentence, phrase, auto, hint, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(phrase ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const custom = phrase !== undefined && auto !== null && phrase !== auto;

  const commit = () => {
    const error = landmarkTextProblem(text, 'Фраза');
    setProblem(error);
    if (error !== null) return;
    onChange(text.trim());
    setEditing(false);
  };

  return (
    <div className="editor-landmark__phrase">
      <span className="editor-field__label">{label}</span>
      <p className="editor-landmark__sentence" data-landmark-sentence>
        {phrase ? `«${sentence(phrase)}»` : '—'}
      </p>
      {editing ? (
        <div className="editor-landmark__edit">
          <input
            className="editor-input"
            aria-label="Фраза ориентира в шаге"
            value={text}
            autoFocus
            aria-invalid={problem !== null}
            onChange={(event) => {
              setText(event.target.value);
              setProblem(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
              if (event.key === 'Escape') {
                event.stopPropagation();
                setEditing(false);
                setProblem(null);
              }
            }}
          />
          <button type="button" className="editor-button editor-button--accent" onClick={commit}>
            Готово
          </button>
          {problem !== null && (
            <span className="editor-field__problem" role="alert">
              {problem}
            </span>
          )}
        </div>
      ) : (
        <div className="editor-card__actions">
          <button
            type="button"
            className="editor-button editor-button--ghost"
            onClick={() => {
              setText(phrase ?? auto ?? '');
              setEditing(true);
            }}
          >
            <Icon name="edit" />
            Изменить фразу
          </button>
          {custom && (
            <button type="button" className="editor-button editor-button--ghost" onClick={() => onChange(auto ?? undefined)}>
              Как предлагает редактор
            </button>
          )}
        </div>
      )}
      {hint && <p className="editor-section__hint">{hint}</p>}
    </div>
  );
};

/**
 * Как навигатор скажет на каждом проходе через точку. Неверный проход
 * исправляется выбором; исправление действует только на свой проход.
 */
const PassagesBlock: React.FC<{ nodeId: string; landmark: Landmark; onChange: (next: Landmark) => void }> = ({ nodeId, landmark, onChange }) => {
  const nodes = useEditorStore((s) => s.nodes);
  const aliases = useEditorStore((s) => s.aliases);
  const transitions = useEditorStore((s) => s.transitions);
  const campusMeta = useEditorStore((s) => s.campusMeta);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);

  const passages = useMemo(
    () => passagesOf(nodeId, nodes, campusMeta, buildingMetas),
    // Поворот зависит от точки и её соседей, а не от всего кампуса.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodeId, nodes.get(nodeId), campusMeta, buildingMetas, ...(nodes.get(nodeId)?.neighbors ?? []).map((id) => nodes.get(id))]
  );

  const portalName = (id: string) => {
    const transition = transitions.find((t) => t.fromNode === id || t.toNode === id);
    return transition ? TRANSITION_LABELS[transition.type].toLowerCase() : null;
  };

  if (passages.length === 0) {
    return (
      <p className="editor-section__hint editor-landmark__warn">
        Через точку с одной связью маршрут не проходит — шага с ориентиром не будет. Ставьте ориентир на точку коридора, где
        сходятся связи.
      </p>
    );
  }

  const correct = (from: string, to: string, value: string) => {
    const others = (landmark.turns ?? []).filter((turn) => !(turn.from === from && turn.to === to));
    const turns = value === 'auto' ? others : [...others, { from, to, turn: value as TurnDirection }];
    onChange({ ...landmark, turns: turns.length > 0 ? turns : undefined });
  };

  return (
    <div className="editor-landmark__group" role="group" aria-labelledby={`landmark-passages-${nodeId}`}>
      <div className="editor-card__heading-row">
        <h4 id={`landmark-passages-${nodeId}`} className="editor-landmark__subheading">
          Как скажет навигатор
        </h4>
        <InfoTip about="Как скажет навигатор">
          Каждый проход через точку: откуда пришёл человек → куда идёт дальше; сторона названа ближайшим местом в ней.
          Направление навигатор считает сам; если в этом месте выходит неверно, выберите верное — исправление действует
          только на этот проход.
        </InfoTip>
      </div>
      <ul className="editor-passages" data-passages>
        {passages.map((passage) => {
          const effective = passage.corrected ?? passage.auto;
          return (
            <li key={`${passage.from}>${passage.to}`} className="editor-passages__row" data-passage={`${passage.from}>${passage.to}`}>
              <span className="editor-passages__route">
                {sideLabel(passage.from, nodeId, nodes, aliases, portalName)} → {sideLabel(passage.to, nodeId, nodes, aliases, portalName)}
              </span>
              <select
                className="editor-input editor-passages__turn"
                aria-label={`Поворот из ${passage.from} к ${passage.to}`}
                data-corrected={passage.corrected !== null}
                value={passage.corrected ?? 'auto'}
                onChange={(event) => correct(passage.from, passage.to, event.target.value)}
              >
                <option value="auto">{passage.auto ? `${TURN_WORDS[passage.auto]} (сам)` : 'сам'}</option>
                {TURN_DIRECTIONS.map((direction) => (
                  <option key={direction} value={direction}>
                    {TURN_WORDS[direction]}
                  </option>
                ))}
              </select>
              {passage.corrected !== null && effective !== passage.auto && <span className="editor-passages__mark">исправлено</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Фото                                                                */
/* ------------------------------------------------------------------ */

/** «4,8 МБ», «160 КБ». */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

export const PhotosSection: React.FC<{ nodeId: string }> = ({ nodeId }) => {
  const photos = useEditorStore((s) => s.nodes.get(nodeId)?.photos) ?? NO_PHOTOS;
  const diskSaveAvailable = useEditorStore((s) => s.diskSaveAvailable);
  const diskPhotos = useEditorStore((s) => s.diskPhotos);
  const photosDir = useEditorStore((s) => s.photosDir);
  const setNodePhotos = useEditorStore((s) => s.setNodePhotos);
  const edit = useCardEdit();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  const onDisk = diskSaveAvailable ? diskPhotos : null;
  const room = MAX_PHOTOS - photos.length;

  const change = (next: PointPhoto[]) => edit(() => setNodePhotos(nodeId, next));

  const addFiles = async (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name));
    if (images.length === 0) {
      setMessage({ kind: 'error', text: 'Это не снимок: нужен файл JPEG, PNG или WebP' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      let before = 0;
      let after = 0;
      let small = 0;
      const added: PointPhoto[] = [];
      for (const file of images.slice(0, Math.max(0, room))) {
        const processed = await processPhoto(file);
        await holdProcessedPhoto(processed);
        before += file.size;
        after += processed.full.size;
        small += processed.small.size;
        added.push({ file: processed.file, width: processed.width, height: processed.height, source: processed.originalName });
      }
      // Фото могли поменяться, пока шло сжатие: берётся то, что в сторе сейчас.
      const current = useEditorStore.getState().nodes.get(nodeId)?.photos ?? [];
      const fresh = added.filter((photo) => !current.some((existing) => existing.file === photo.file));
      if (fresh.length > 0) change([...current, ...fresh]);
      const skipped = images.length - added.length;
      setMessage({
        kind: 'ok',
        text:
          `Сжато: ${formatBytes(before)} → ${formatBytes(after)}, для шага — ${formatBytes(small)}. ` +
          'Место съёмки и модель телефона в фото не попали.' +
          (skipped > 0 ? ` Не больше ${MAX_PHOTOS} фото у точки — ещё ${skipped} не добавлено.` : ''),
      });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof PhotoReadError ? error.message : `Не удалось сжать снимок: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = (index: number) => change(photos.filter((_, i) => i !== index));
  const makeMain = (index: number) => change([photos[index], ...photos.filter((_, i) => i !== index)]);

  // Брошенный на раздел снимок — фото точки, а не план: окно загрузки планов
  // его не получает (оно ловит только непойманные броски).
  const dropHandlers = {
    onDragOver: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      event.stopPropagation();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      event.stopPropagation();
      setDragOver(false);
      void addFiles([...event.dataTransfer.files]);
    },
  };

  const storage =
    SPACE === 'sandbox'
      ? 'Пробные фото остаются в учебной копии.'
      : photosDir === null
        ? 'Общая папка фото не настроена — фото сохранятся в data/photos/. Настоящие фото вуза в публичный репозиторий не отправляйте: путь к общей папке — CAMPUS_PHOTOS_DIR в .env.local.'
        : photosDir
          ? `Фото сохранятся в общую папку: ${photosDir}`
          : null;

  return (
    <section className="editor-card__section" aria-labelledby="card-photos" data-photos-section {...dropHandlers}>
      <div className="editor-card__heading-row">
        <h3 id="card-photos" className="editor-card__heading">
          Фото
        </h3>
        <InfoTip about="Фото">
          Помогает узнать место: дверь помещения, вход снаружи, сам ориентир. Первое фото — главное: его навигатор покажет в
          карточке и на шаге маршрута.
        </InfoTip>
      </div>

      {photos.length > 0 && (
        <ul className="editor-photos" aria-label="Фото точки">
          {photos.map((photo, index) => {
            const src = photoSrc(photo, 'small', onDisk);
            return (
              <li key={photo.file} className="editor-photos__tile" data-photo-file={photo.file}>
                {src ? (
                  <button type="button" className="editor-photos__image" onClick={() => setPreview(index)} aria-label={`Открыть фото ${index + 1}`}>
                    <img src={src} alt="" />
                  </button>
                ) : (
                  <div className="editor-photos__missing" role="note">
                    Нет файла на этой машине — общая папка ещё не синхронизировалась?
                  </div>
                )}
                {index === 0 && <span className="editor-photos__main">Главное</span>}
                <div className="editor-photos__actions">
                  {index > 0 && (
                    <button type="button" className="editor-button editor-button--ghost editor-button--compact" onClick={() => makeMain(index)}>
                      Сделать главным
                    </button>
                  )}
                  <button
                    type="button"
                    className="editor-button editor-button--danger editor-button--compact"
                    onClick={() => remove(index)}
                    aria-label={`Удалить фото ${index + 1}`}
                    title="Удалить фото"
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {room > 0 && (
        <div className={`editor-photo-drop${dragOver ? ' editor-photo-drop--over' : ''}`} data-photo-drop>
          <Icon name="photo" size={22} />
          <p className="editor-photo-drop__text">
            {busy ? 'Сжимаю снимок…' : dragOver ? 'Отпустите — фото добавится к точке' : photos.length === 0 ? 'Перетащите снимок сюда или' : 'Ещё фото — перетащите или'}
          </p>
          {!busy && (
            <button type="button" className="editor-button editor-button--accent" onClick={() => inputRef.current?.click()}>
              <Icon name="upload" />
              Выбрать файл…
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,.heic"
            multiple
            hidden
            aria-label="Файл фото"
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = '';
              if (files.length > 0) void addFiles(files);
            }}
          />
          {photos.length === 0 && <p className="editor-section__hint">Снимайте без людей: рано утром или во время пары.</p>}
        </div>
      )}

      {message && (
        <p className={message.kind === 'ok' ? 'editor-photos__done' : 'editor-field__problem'} role={message.kind === 'ok' ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
      {storage && <p className="editor-section__hint">{storage}</p>}

      {preview !== null && photos[preview] && (
        <PhotoPreview photos={photos} index={preview} onDisk={onDisk} onIndex={setPreview} onClose={() => setPreview(null)} />
      )}
    </section>
  );
};

/** Фото крупно — поверх всего редактора; стрелки листают, Escape закрывает. */
const PhotoPreview: React.FC<{
  photos: PointPhoto[];
  index: number;
  onDisk: ReadonlySet<string> | null;
  onIndex: (index: number) => void;
  onClose: () => void;
}> = ({ photos, index, onDisk, onIndex, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(true, ref, onClose);
  const photo = photos[index];
  const src = photoSrc(photo, 'full', onDisk) ?? photoSrc(photo, 'small', onDisk);

  return createPortal(
    <div className="editor-photo-preview" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={`Фото ${index + 1} из ${photos.length}`}
        className="editor-photo-preview__box"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
          if (event.key === 'ArrowRight' && index < photos.length - 1) onIndex(index + 1);
        }}
      >
        <div className="editor-photo-preview__bar">
          <span>
            Фото {index + 1} из {photos.length} · {photo.width} × {photo.height}
          </span>
          <button type="button" className="editor-icon-button" onClick={onClose} aria-label="Закрыть фото" title="Закрыть (Esc)">
            <Icon name="close" size={18} />
          </button>
        </div>
        {src ? <img className="editor-photo-preview__image" src={src} alt={`Фото ${index + 1}`} /> : <p>Нет файла на этой машине</p>}
      </div>
    </div>,
    document.body
  );
};
