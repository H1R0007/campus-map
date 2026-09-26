import React, { useCallback, useEffect, useState } from 'react';
import { floorLabel } from '@campus-map/core';
import type { BuildingMeta, FloorMeta } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { parseFloorNumber } from '../../stores/editor/structureSlice';
import { useHistoryStore } from '../../stores/historyStore';
import { heldFile, planScopeKey } from '../../utils/planFiles';
import { plural } from '../../utils/labels';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { SessionBar } from './SessionBar';

/**
 * Карточки этажа, корпуса и плана территории — вкладка «Свойства», когда
 * точки не выбраны (запись 47).
 *
 * Правки в карточке, как и в карточке точки, — одна запись истории на всю
 * карточку: «Применить» или «Отменить изменения». Удаление этажа и корпуса
 * спрашивает подтверждения и перечисляет, что уйдёт вместе с ними.
 */

/** Правка из карточки — в её сессии: всё, что сделано в карточке, отменится разом. */
function useSessionEdit(sessionKey: string, description: string) {
  const runInSession = useEditorStore((s) => s.runInSession);
  useEffect(
    () => () => {
      if (useHistoryStore.getState().session?.key === sessionKey) useEditorStore.getState().closeSession();
    },
    [sessionKey]
  );
  return useCallback((fn: () => void) => runInSession(sessionKey, description, fn), [runInSession, sessionKey, description]);
}

/**
 * Поле карточки: правка применяется по Enter и при уходе из поля, Escape
 * возвращает прежнее. Отказ стора показывается под полем.
 */
const Field: React.FC<{
  label: string;
  value: string;
  hint: string;
  placeholder?: string;
  inputMode?: 'text' | 'decimal';
  /** @returns текст проблемы или `null` */
  onCommit: (value: string) => string | null;
}> = ({ label, value, hint, placeholder, inputMode = 'text', onCommit }) => {
  const [text, setText] = useState(value);
  const [problem, setProblem] = useState<string | null>(null);
  const id = React.useId();

  useEffect(() => {
    setText(value);
    setProblem(null);
  }, [value]);

  const commit = () => {
    if (text === value) {
      setProblem(null);
      return;
    }
    setProblem(onCommit(text));
  };

  return (
    <label className="editor-card__field">
      <span className="editor-section__hint">{label}</span>
      <input
        aria-label={label}
        aria-invalid={problem !== null}
        aria-describedby={`${id}-hint`}
        value={text}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => {
          setText(e.target.value);
          setProblem(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            e.stopPropagation();
            setText(value);
            setProblem(null);
          }
        }}
        className="editor-input"
      />
      <span id={`${id}-hint`} className={problem === null ? 'editor-section__hint' : 'editor-section__hint editor-section__hint--problem'}>
        {problem ?? hint}
      </span>
    </label>
  );
};

/** Что за план: формат, размер, откуда взят, сохранён ли. */
const PlanFacts: React.FC<{ scope: string; meta: Pick<FloorMeta, 'mapSize' | 'planFormat' | 'source'> | undefined }> = ({ scope, meta }) => {
  const key = useEditorStore((s) => s.planFiles.get(scope));
  if (key === undefined) {
    return <p className="editor-section__hint">Плана нет — точки ставятся на пустое поле.</p>;
  }
  const size = meta?.mapSize ? `${meta.mapSize.width} × ${meta.mapSize.height} пикс.` : 'размер узнается при показе';
  const source = meta?.source;
  return (
    <dl className="editor-facts">
      <dt>План</dt>
      <dd>
        {(meta?.planFormat ?? 'png').toUpperCase()}, {size}
      </dd>
      {source && (
        <>
          <dt>Взят из</dt>
          <dd>
            «{source.name ?? source.file}»{source.page ? `, страница ${source.page}` : ''}
          </dd>
        </>
      )}
      {heldFile(key) && (
        <>
          <dt>На диске</dt>
          <dd>ещё нет — появится при сохранении</dd>
        </>
      )}
    </dl>
  );
};

/** Этаж открытого корпуса: номер, подпись, план, удаление. */
export const FloorSection: React.FC<{ building: BuildingMeta; floor: FloorMeta }> = ({ building, floor }) => {
  const updateFloor = useEditorStore((s) => s.updateFloor);
  const sessionKey = `floor:${building.id}/${floor.floor}`;
  const edit = useSessionEdit(sessionKey, `Этаж ${floorLabel(building, floor.floor)} корпуса «${building.name}»`);
  const [deleting, setDeleting] = useState(false);

  const change = (patch: Parameters<typeof updateFloor>[2]) => {
    let problem: string | null = null;
    edit(() => {
      problem = updateFloor(building.id, floor.floor, patch);
    });
    return problem;
  };

  return (
    <section className="editor-card__section" aria-labelledby="floor-card-title">
      <h3 id="floor-card-title" className="editor-card__heading">
        Этаж
      </h3>
      <div className="editor-card__row">
        <Field
          label="Номер этажа"
          value={String(floor.floor)}
          inputMode="decimal"
          hint="−1 — подвал, 0 — цоколь, 1.5 — антресоль между 1 и 2"
          onCommit={(text) => change({ floor: parseFloorNumber(text) })}
        />
        <Field
          label="Подпись на кнопке"
          value={floor.label ?? ''}
          placeholder={floorLabel(undefined, floor.floor)}
          hint="Как на табличках: 1А, Ц. Пусто — номер"
          onCommit={(text) => change({ label: text })}
        />
      </div>
      <PlanFacts scope={planScopeKey(building.id, floor.floor)} meta={floor} />
      <SessionBar sessionKey={sessionKey} what="этажа" />
      <div className="editor-card__actions">
        <button type="button" className="editor-button editor-button--danger" onClick={() => setDeleting(true)}>
          <Icon name="trash" />
          Удалить этаж…
        </button>
      </div>
      <DeleteDialog open={deleting} onClose={() => setDeleting(false)} building={building} floor={floor.floor} />
    </section>
  );
};

/** Корпус: имя, английское имя, этаж входа, удаление. */
export const BuildingSection: React.FC<{ building: BuildingMeta }> = ({ building }) => {
  const updateBuilding = useEditorStore((s) => s.updateBuilding);
  const sessionKey = `building:${building.id}`;
  const edit = useSessionEdit(sessionKey, `Корпус «${building.name}»`);
  const [deleting, setDeleting] = useState(false);

  const change = (patch: Parameters<typeof updateBuilding>[1]) => {
    let problem: string | null = null;
    edit(() => {
      problem = updateBuilding(building.id, patch);
    });
    return problem;
  };

  const floors = [...building.floors].sort((a, b) => a.floor - b.floor);

  return (
    <section className="editor-card__section" aria-labelledby="building-card-title">
      <h3 id="building-card-title" className="editor-card__heading">
        Корпус
      </h3>
      <Field
        label="Название корпуса"
        value={building.name}
        hint="Так корпус называется в навигаторе и в поиске"
        onCommit={(text) => change({ name: text })}
      />
      <Field
        label="Название корпуса по-английски"
        value={building.translations?.en?.name ?? ''}
        hint="Для навигатора на английском. Пусто — показывается русское"
        onCommit={(text) => change({ nameEn: text })}
      />
      {floors.length > 0 && (
        <label className="editor-card__field">
          <span className="editor-section__hint">Этаж входа</span>
          <select
            aria-label="Этаж входа"
            className="editor-input"
            value={building.entranceFloor === undefined ? '' : String(building.entranceFloor)}
            onChange={(e) => change({ entranceFloor: e.target.value === '' ? null : Number(e.target.value) })}
          >
            <option value="">Не задан — нижний надземный</option>
            {floors.map((floor) => (
              <option key={floor.floor} value={String(floor.floor)}>
                Этаж {floorLabel(building, floor.floor)}
              </option>
            ))}
          </select>
          <span className="editor-section__hint">Этот этаж навигатор открывает, когда выбирают корпус</span>
        </label>
      )}
      <SessionBar sessionKey={sessionKey} what="корпуса" />
      <div className="editor-card__actions">
        <button type="button" className="editor-button editor-button--danger" onClick={() => setDeleting(true)}>
          <Icon name="trash" />
          Удалить корпус…
        </button>
      </div>
      <DeleteDialog open={deleting} onClose={() => setDeleting(false)} building={building} />
    </section>
  );
};

/** План территории: что за файл. */
export const CampusPlanSection: React.FC = () => {
  const campusMeta = useEditorStore((s) => s.campusMeta);
  return (
    <section className="editor-card__section" aria-label="План территории">
      <h3 className="editor-card__heading">План территории</h3>
      <PlanFacts scope={planScopeKey(null, null)} meta={campusMeta ?? undefined} />
    </section>
  );
};

/** Этаж, которого ещё нет: номер и кнопка. */
export const AddFloorForm: React.FC<{ building: BuildingMeta; onDone?: () => void; autoFocus?: boolean }> = ({
  building,
  onDone,
  autoFocus,
}) => {
  const addFloor = useEditorStore((s) => s.addFloor);
  const suggested = building.floors.length === 0 ? 1 : Math.floor(Math.max(...building.floors.map((floor) => floor.floor))) + 1;
  const [text, setText] = useState(String(suggested));
  const [problem, setProblem] = useState<string | null>(null);

  const submit = () => {
    const result = addFloor(building.id, { floor: parseFloorNumber(text) });
    setProblem(result);
    if (result === null) onDone?.();
  };

  return (
    <form
      className="editor-card__row"
      aria-label={`Новый этаж: ${building.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="editor-card__field flex-1">
        <span className="editor-section__hint">Номер нового этажа</span>
        <input
          aria-label="Номер нового этажа"
          aria-invalid={problem !== null}
          className="editor-input"
          inputMode="decimal"
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => {
            setText(e.target.value);
            setProblem(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              onDone?.();
            }
          }}
        />
        <span className={problem === null ? 'editor-section__hint' : 'editor-section__hint editor-section__hint--problem'}>
          {problem ?? 'Пустой этаж без плана: план можно добавить потом'}
        </span>
      </label>
      <button type="submit" className="editor-button editor-button--primary self-start mt-5">
        <Icon name="plus" />
        Добавить
      </button>
    </form>
  );
};

/**
 * Удаление этажа или корпуса.
 *
 * Перечисляет, что уйдёт: точки, названия, переходы, планы. Корпус целиком
 * удаляется только после отметки «понимаю» — слишком много работы уходит
 * одним нажатием.
 */
export const DeleteDialog: React.FC<{ open: boolean; onClose: () => void; building: BuildingMeta; floor?: number }> = ({
  open,
  onClose,
  building,
  floor,
}) => {
  const deletionImpact = useEditorStore((s) => s.deletionImpact);
  const deleteFloor = useEditorStore((s) => s.deleteFloor);
  const deleteBuilding = useEditorStore((s) => s.deleteBuilding);
  const showNotice = useEditorStore((s) => s.showNotice);
  const [understood, setUnderstood] = useState(false);

  useEffect(() => {
    if (open) setUnderstood(false);
  }, [open]);

  if (!open) return null;

  const impact = deletionImpact(building.id, floor);
  const whole = floor === undefined;
  const what = whole ? `корпус «${building.name}»` : `этаж ${floorLabel(building, floor)} корпуса «${building.name}»`;
  const blocked = whole && impact.nodes > 0 && !understood;

  const confirm = () => {
    if (whole) deleteBuilding(building.id);
    else deleteFloor(building.id, floor);
    onClose();
    showNotice(`Удалён ${what}. Передумали — Ctrl+Z вернёт всё`);
  };

  return (
    <ConfirmDialog
      title={`Удалить ${what}?`}
      open={open}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="editor-button editor-button--ghost" onClick={onClose}>
            Оставить
          </button>
          <button type="button" className="editor-button editor-button--danger" disabled={blocked} onClick={confirm}>
            <Icon name="trash" />
            {whole ? 'Удалить корпус' : 'Удалить этаж'}
          </button>
        </>
      }
    >
      {impact.nodes === 0 && impact.plans === 0 ? (
        <p>{whole ? 'В корпусе нет ни точек, ни планов.' : 'На этаже нет ни точек, ни плана.'}</p>
      ) : (
        <>
          <p>Вместе с {whole ? 'корпусом' : 'этажом'} уйдут:</p>
          <ul className="editor-list-plain">
            {whole && impact.floors > 0 && (
              <li>
                {impact.floors} {plural(impact.floors, ['этаж', 'этажа', 'этажей'])}
              </li>
            )}
            {impact.nodes > 0 && (
              <li>
                {impact.nodes} {plural(impact.nodes, ['точка', 'точки', 'точек'])}
                {impact.named > 0 &&
                  `, из них ${impact.named} с названиями — их перестанут находить в навигаторе`}
              </li>
            )}
            {impact.crossings > 0 && (
              <li>
                {impact.crossings} {plural(impact.crossings, ['переход', 'перехода', 'переходов'])} на другие планы — эти лестницы,
                лифты и входы оборвутся
              </li>
            )}
            {impact.plans > 0 && (
              <li>
                {impact.plans === 1 ? 'план' : `${impact.plans} ${plural(impact.plans, ['план', 'плана', 'планов'])}`} — файлы
                удалятся из данных при сохранении
              </li>
            )}
          </ul>
        </>
      )}
      <p className="editor-section__hint">Передумаете — Ctrl+Z вернёт всё, пока редактор открыт, даже после сохранения.</p>
      {whole && impact.nodes > 0 && (
        <label className="editor-check">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
          Понимаю, что удаляю весь корпус со всеми этажами
        </label>
      )}
    </ConfirmDialog>
  );
};
