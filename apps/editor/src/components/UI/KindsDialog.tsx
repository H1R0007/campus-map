import React, { useCallback, useRef, useState } from 'react';
import { PLACE_CATEGORIES, TRANSITION_TYPES } from '@campus-map/core';
import type { PlaceCategory, PlaceKind, TransitionType } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { visibleKinds } from '../../utils/placeKinds';
import { PLACE_CATEGORY_LABELS, TRANSITION_LABELS } from '../../utils/labels';
import { KindGlyph } from '../Layout/KindPalette';
import { Icon } from './Icon';
import type { IconName } from './Icon';

/** Значки, из которых разметчик выбирает вид: те же, что редактор умеет рисовать. */
const KIND_ICONS: IconName[] = ['dot', 'door', 'toilet', 'food', 'cloakroom', 'star', 'pin', 'note', 'building', 'layers'];

/** Пустой вид: с него начинается создание. */
const emptyKind = (): PlaceKind => ({ id: '', name: '', icon: 'pin', connect: true });

/** id вида из названия: латиницей, чтобы его было видно в файле данных. */
function kindIdOf(name: string, taken: readonly string[]): string {
  const translit: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l',
    м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh',
    щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  const base =
    [...name.toLowerCase()]
      .map((letter) => translit[letter] ?? (/[a-z0-9]/.test(letter) ? letter : '_'))
      .join('')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'kind';

  if (!taken.includes(base)) return base;
  for (let i = 2; ; i += 1) {
    const candidate = `${base}_${i}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

/**
 * Окно «Все виды точек».
 *
 * Виды — данные разметки, поэтому здесь их и заводят: название, значок и то,
 * что вид делает при щелчке по карте. Окно отдельное, а не колонка, чтобы
 * растущий каталог не отнимал место у карты.
 */
export const KindsDialog: React.FC = () => {
  const open = useEditorStore((s) => s.kindsOpen);
  const setKindsOpen = useEditorStore((s) => s.setKindsOpen);
  const placeKinds = useEditorStore((s) => s.placeKinds);
  const setPlaceKinds = useEditorStore((s) => s.setPlaceKinds);
  const setActiveKind = useEditorStore((s) => s.setActiveKind);

  const dialogRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setKindsOpen(false), [setKindsOpen]);
  useDialogFocus(open, dialogRef, close);

  const [draft, setDraft] = useState<PlaceKind | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!open) return null;

  const kinds = visibleKinds(placeKinds);

  const save = () => {
    if (!draft || draft.name.trim().length === 0) return;
    const name = draft.name.trim();
    const taken = kinds.filter((kind) => kind.id !== editingId).map((kind) => kind.id);
    const kind: PlaceKind = { ...draft, name, id: editingId ?? kindIdOf(name, taken) };

    const next = editingId
      ? kinds.map((item) => (item.id === editingId ? kind : item))
      : [...kinds, kind];
    setPlaceKinds(next, editingId ? `Изменён вид точки: ${name}` : `Добавлен вид точки: ${name}`);
    setActiveKind(kind.id);
    setDraft(null);
    setEditingId(null);
  };

  const remove = (kind: PlaceKind) => {
    setPlaceKinds(
      kinds.filter((item) => item.id !== kind.id),
      `Удалён вид точки: ${kind.name}`
    );
  };

  const move = (kind: PlaceKind, direction: -1 | 1) => {
    const index = kinds.findIndex((item) => item.id === kind.id);
    const next = [...kinds];
    const swap = index + direction;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setPlaceKinds(next, `Порядок видов: ${kind.name}`);
  };

  return (
    <div className="editor-dialog-backdrop" onClick={close}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kinds-title"
        className="editor-dialog editor-dialog--wide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="editor-help__head">
          <h2 id="kinds-title" className="editor-dialog__title">
            Виды точек
          </h2>
          <button type="button" className="editor-icon-button" onClick={close} aria-label="Закрыть виды точек">
            <Icon name="close" />
          </button>
        </div>

        <div className="editor-dialog__body">
          <p className="editor-section__hint">
            Вид — заготовка: щелчок по карте ставит точку и сразу делает то, что здесь написано. Виды хранятся
            вместе с разметкой, поэтому одинаковы у всей команды.
          </p>

          <ul className="editor-list" aria-label="Виды точек">
            {kinds.map((kind, index) => (
              <li key={kind.id} className="editor-list__row">
                <span className="editor-list__main">
                  <KindGlyph kind={kind} size={18} />
                  <span className="editor-list__text">
                    <span className="editor-list__name">{kind.name}</span>
                    <span className="editor-list__sub">{kindSummary(kind)}</span>
                  </span>
                </span>
                <button
                  type="button"
                  className="editor-icon-button"
                  onClick={() => move(kind, -1)}
                  disabled={index === 0}
                  aria-label={`Поднять вид «${kind.name}»`}
                  title="Выше: первые восемь видов видны в строке над картой"
                >
                  <Icon name="chevronUp" />
                </button>
                <button
                  type="button"
                  className="editor-icon-button"
                  onClick={() => move(kind, 1)}
                  disabled={index === kinds.length - 1}
                  aria-label={`Опустить вид «${kind.name}»`}
                >
                  <Icon name="chevronDown" />
                </button>
                <button
                  type="button"
                  className="editor-icon-button"
                  onClick={() => {
                    setDraft({ ...kind });
                    setEditingId(kind.id);
                  }}
                  aria-label={`Изменить вид «${kind.name}»`}
                >
                  <Icon name="edit" />
                </button>
                <button
                  type="button"
                  className="editor-icon-button editor-list__remove"
                  onClick={() => remove(kind)}
                  disabled={kinds.length === 1}
                  aria-label={`Удалить вид «${kind.name}»`}
                  title={kinds.length === 1 ? 'Последний вид удалить нельзя: кистям нечего будет ставить' : undefined}
                >
                  <Icon name="close" />
                </button>
              </li>
            ))}
          </ul>

          {draft === null ? (
            <button
              type="button"
              className="editor-button editor-button--primary mt-2"
              onClick={() => {
                setDraft(emptyKind());
                setEditingId(null);
              }}
            >
              <Icon name="plus" />
              Создать вид
            </button>
          ) : (
            <KindForm
              draft={draft}
              editing={editingId !== null}
              onChange={setDraft}
              onCancel={() => {
                setDraft(null);
                setEditingId(null);
              }}
              onSave={save}
            />
          )}
        </div>
      </div>
    </div>
  );
};

/** Что вид делает — одной строкой, словами. */
function kindSummary(kind: PlaceKind): string {
  const parts: string[] = [];
  if (kind.namePattern) parts.push(`название «${kind.namePattern}»`);
  if (kind.transition) parts.push(`переход: ${TRANSITION_LABELS[kind.transition].toLowerCase()}`);
  if (kind.stack) parts.push('сразу на всех этажах');
  if (kind.connect) parts.push('цепляется к ближайшей точке');
  if (kind.category) parts.push(`вид места: ${PLACE_CATEGORY_LABELS[kind.category].toLowerCase()}`);
  return parts.length > 0 ? parts.join(' · ') : 'обычная точка';
}

const KindForm: React.FC<{
  draft: PlaceKind;
  editing: boolean;
  onChange: (kind: PlaceKind) => void;
  onCancel: () => void;
  onSave: () => void;
}> = ({ draft, editing, onChange, onCancel, onSave }) => (
  <section className="editor-card__section" aria-label={editing ? 'Изменить вид точки' : 'Создать вид точки'}>
    <h3 className="editor-card__heading">{editing ? 'Изменить вид' : 'Новый вид'}</h3>

    <div className="editor-card__row">
      <input
        value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
        placeholder="Например: Лаборатория"
        aria-label="Название вида"
        className="editor-input"
      />
      <label className="editor-check">
        <span className="editor-check__text">Значок</span>
        <select
          value={draft.icon ?? 'pin'}
          onChange={(e) => onChange({ ...draft, icon: e.target.value })}
          aria-label="Значок вида"
          className="editor-input editor-input--narrow"
        >
          {KIND_ICONS.map((icon) => (
            <option key={icon} value={icon}>
              {icon}
            </option>
          ))}
        </select>
      </label>
    </div>

    <label className="editor-check">
      <span className="editor-check__text">
        Шаблон названия
        <span className="editor-check__hint">
          {'{корпус}'} и {'{этаж}'} подставит редактор, {'{номер}'} наберёте вы. Пусто — без названия
        </span>
      </span>
      <input
        value={draft.namePattern ?? ''}
        onChange={(e) => onChange({ ...draft, namePattern: e.target.value || undefined })}
        aria-label="Шаблон названия"
        className="editor-input editor-input--narrow"
      />
    </label>

    <label className="editor-check">
      <input
        type="checkbox"
        checked={draft.connect === true}
        onChange={(e) => onChange({ ...draft, connect: e.target.checked || undefined })}
      />
      <span className="editor-check__text">Соединять с ближайшей точкой плана</span>
    </label>

    <label className="editor-check">
      <input
        type="checkbox"
        checked={draft.isPortal === true}
        onChange={(e) =>
          onChange({
            ...draft,
            isPortal: e.target.checked || undefined,
            transition: e.target.checked ? (draft.transition ?? 'stairs') : undefined,
            stack: e.target.checked ? draft.stack : undefined,
          })
        }
      />
      <span className="editor-check__text">
        Точка перехода
        <span className="editor-check__hint">лестница, лифт, вход — навигатор рисует её значком</span>
      </span>
    </label>

    {draft.isPortal && (
      <>
        <label className="editor-check">
          <span className="editor-check__text">Тип перехода</span>
          <select
            value={draft.transition ?? 'stairs'}
            onChange={(e) => onChange({ ...draft, transition: e.target.value as TransitionType })}
            aria-label="Тип перехода"
            className="editor-input editor-input--narrow"
          >
            {TRANSITION_TYPES.map((type) => (
              <option key={type} value={type}>
                {TRANSITION_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="editor-check">
          <input
            type="checkbox"
            checked={draft.stack === true}
            onChange={(e) => onChange({ ...draft, stack: e.target.checked || undefined })}
          />
          <span className="editor-check__text">
            Ставить сразу на всех этажах корпуса
            <span className="editor-check__hint">и связывать этажи переходами — для лестниц и лифтов</span>
          </span>
        </label>
      </>
    )}

    <label className="editor-check">
      <span className="editor-check__text">
        Вид места для навигатора
        <span className="editor-check__hint">по нему работают кнопки «ближайший туалет» и «где поесть»</span>
      </span>
      <select
        value={draft.category ?? ''}
        onChange={(e) => onChange({ ...draft, category: (e.target.value || undefined) as PlaceCategory | undefined })}
        aria-label="Вид места для навигатора"
        className="editor-input editor-input--narrow"
      >
        <option value="">нет</option>
        {PLACE_CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {PLACE_CATEGORY_LABELS[category]}
          </option>
        ))}
      </select>
    </label>

    <div className="editor-card__actions">
      <button type="button" className="editor-button editor-button--primary" onClick={onSave} disabled={draft.name.trim().length === 0}>
        {editing ? 'Сохранить вид' : 'Добавить вид'}
      </button>
      <button type="button" className="editor-button editor-button--ghost" onClick={onCancel}>
        Отмена
      </button>
    </div>
  </section>
);
