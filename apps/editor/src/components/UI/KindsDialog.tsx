import React, { useCallback, useRef, useState } from 'react';
import type { PlaceKind } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { visibleKinds } from '../../utils/placeKinds';
import { PLACE_CATEGORY_LABELS } from '../../utils/labels';
import { KindGlyph } from '../Layout/KindPalette';
import { Icon } from './Icon';
import type { IconName } from './Icon';

/** Значки, из которых разметчик выбирает вид: те же, что редактор умеет рисовать. */
const KIND_ICONS: { icon: IconName; label: string }[] = [
  { icon: 'pin', label: 'Метка' },
  { icon: 'door', label: 'Дверь' },
  { icon: 'toilet', label: 'Туалет' },
  { icon: 'food', label: 'Еда' },
  { icon: 'cloakroom', label: 'Гардероб' },
  { icon: 'star', label: 'Звезда' },
  { icon: 'note', label: 'Заметка' },
  { icon: 'building', label: 'Здание' },
  { icon: 'layers', label: 'Слои' },
  { icon: 'dot', label: 'Точка' },
];

/** Как называть поставленные точки — три понятных выбора вместо шаблона со скобками. */
type Naming = 'kind' | 'room' | 'none';

/** Номер помещения: начало «А-1» подставит редактор, номер допишет человек. */
const ROOM_PATTERN = '{корпус}-{этаж}{номер}';

function namingOf(kind: PlaceKind): Naming {
  if (!kind.namePattern) return 'none';
  return kind.namePattern.includes('{номер}') ? 'room' : 'kind';
}

function patternFor(naming: Naming, name: string): string | undefined {
  if (naming === 'kind') return name;
  if (naming === 'room') return ROOM_PATTERN;
  return undefined;
}

/** Ключ правки окна: всё, что сделано в окне до его закрытия, — одна запись. */
const KINDS_SESSION = 'kinds';

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
  const runInSession = useEditorStore((s) => s.runInSession);
  const pending = useHistoryStore(
    (s) => s.session !== null && s.session.key === KINDS_SESSION && s.currentIndex > s.session.startIndex
  );

  const dialogRef = useRef<HTMLDivElement>(null);
  // Закрытое окно применяет свою правку: всё сделанное в нём — одна запись.
  const close = useCallback(() => {
    if (useHistoryStore.getState().session?.key === KINDS_SESSION) useEditorStore.getState().closeSession();
    setKindsOpen(false);
  }, [setKindsOpen]);
  const setKinds = (kinds: PlaceKind[], description: string) =>
    runInSession(KINDS_SESSION, 'Виды точек', () => setPlaceKinds(kinds, description));
  useDialogFocus(open, dialogRef, close);

  const [draft, setDraft] = useState<PlaceKind | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [naming, setNaming] = useState<Naming>('kind');

  if (!open) return null;

  const kinds = visibleKinds(placeKinds);

  const save = () => {
    if (!draft || draft.name.trim().length === 0) return;
    const name = draft.name.trim();
    const taken = kinds.filter((kind) => kind.id !== editingId).map((kind) => kind.id);
    const kind: PlaceKind = {
      ...draft,
      name,
      id: editingId ?? kindIdOf(name, taken),
      namePattern: patternFor(naming, name),
    };

    const next = editingId
      ? kinds.map((item) => (item.id === editingId ? kind : item))
      : [...kinds, kind];
    setKinds(next, editingId ? `Изменён вид точки: ${name}` : `Добавлен вид точки: ${name}`);
    setActiveKind(kind.id);
    setDraft(null);
    setEditingId(null);
  };

  const remove = (kind: PlaceKind) => {
    setKinds(
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
    setKinds(next, `Порядок видов: ${kind.name}`);
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
                    setNaming(namingOf(kind));
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

          {pending && (
            <div className="editor-card__session" role="group" aria-label="Изменения видов">
              <p className="editor-section__hint">Всё, что сделано в этом окне, — одна правка: отмена вернёт её разом.</p>
              <div className="editor-card__actions">
                <button type="button" className="editor-button editor-button--primary" onClick={close}>
                  <Icon name="checkCircle" />
                  Готово
                </button>
                <button
                  type="button"
                  className="editor-button editor-button--ghost"
                  onClick={() => useEditorStore.getState().revertSession()}
                >
                  Отменить изменения
                </button>
              </div>
            </div>
          )}

          {draft === null ? (
            <button
              type="button"
              className="editor-button editor-button--primary mt-2"
              onClick={() => {
                setDraft(emptyKind());
                setEditingId(null);
                setNaming('kind');
              }}
            >
              <Icon name="plus" />
              Создать вид
            </button>
          ) : (
            <KindForm
              draft={draft}
              naming={naming}
              editing={editingId !== null}
              onChange={setDraft}
              onNaming={setNaming}
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
  const naming = namingOf(kind);
  if (naming === 'kind') parts.push(`точка называется «${kind.namePattern}»`);
  if (naming === 'room') parts.push('номер помещения: «А-1…» и ваш номер');
  if (kind.chain) parts.push('ведёт линию');
  if (kind.connect) parts.push('цепляется к ближайшей точке');
  if (kind.category) parts.push(`в навигаторе: ${PLACE_CATEGORY_LABELS[kind.category].toLowerCase()}`);
  return parts.length > 0 ? parts.join(' · ') : 'точка без названия';
}

/** Один из выборов «какое название получит точка». */
const NamingChoice: React.FC<{
  value: Naming;
  current: Naming;
  onChoose: (naming: Naming) => void;
  title: string;
  hint: string;
}> = ({ value, current, onChoose, title, hint }) => (
  <label className="editor-check">
    <input type="radio" name="kind-naming" checked={current === value} onChange={() => onChoose(value)} />
    <span className="editor-check__text">
      {title}
      <span className="editor-check__hint">{hint}</span>
    </span>
  </label>
);

const KindForm: React.FC<{
  draft: PlaceKind;
  naming: Naming;
  editing: boolean;
  onChange: (kind: PlaceKind) => void;
  onNaming: (naming: Naming) => void;
  onCancel: () => void;
  onSave: () => void;
}> = ({ draft, naming, editing, onChange, onNaming, onCancel, onSave }) => (
  <section className="editor-card__section" aria-label={editing ? 'Изменить вид точки' : 'Создать вид точки'}>
    <h3 className="editor-card__heading">{editing ? 'Изменить вид' : 'Новый вид'}</h3>

    <label className="editor-card__field">
      <span className="editor-section__hint">Название вида</span>
      <input
        value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
        placeholder="Например: Медпункт"
        aria-label="Название вида"
        className="editor-input"
      />
    </label>

    <div className="editor-card__field">
      <span className="editor-section__hint" id="kind-icon-label">
        Значок
      </span>
      <div className="editor-icon-grid" role="group" aria-labelledby="kind-icon-label">
        {KIND_ICONS.map(({ icon, label }) => (
          <button
            key={icon}
            type="button"
            className="editor-icon-choice"
            aria-pressed={(draft.icon ?? 'pin') === icon}
            aria-label={label}
            title={label}
            onClick={() => onChange({ ...draft, icon })}
          >
            <Icon name={icon} size={20} />
          </button>
        ))}
      </div>
    </div>

    <fieldset className="editor-fieldset">
      <legend className="editor-section__hint">Какое название получит поставленная точка</legend>
      <NamingChoice
        value="kind"
        current={naming}
        onChoose={onNaming}
        title="Как у вида"
        hint={`каждая точка сразу называется «${draft.name.trim() || 'Медпункт'}»`}
      />
      <NamingChoice
        value="room"
        current={naming}
        onChoose={onNaming}
        title="Номер помещения"
        hint="в поле названия уже «А-1», останется дописать номер: «А-107»"
      />
      <NamingChoice
        value="none"
        current={naming}
        onChoose={onNaming}
        title="Без названия"
        hint="как у коридора: точка нужна только для маршрута"
      />
    </fieldset>

    <label className="editor-check">
      <input
        type="checkbox"
        checked={draft.connect === true}
        onChange={(e) => onChange({ ...draft, connect: e.target.checked || undefined })}
      />
      <span className="editor-check__text">
        Соединять с ближайшей точкой плана
        <span className="editor-check__hint">точка сразу связана с коридором — отдельно щёлкать «Связь» не нужно</span>
      </span>
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
