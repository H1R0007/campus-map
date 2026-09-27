import React, { useEffect, useId, useState } from 'react';
import type { BuildingMeta } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { nextBuildingName, parseFloorNumber } from '../../stores/editor/structureSlice';
import { ConfirmDialog } from './ConfirmDialog';
import { FieldLabel } from './Field';

/**
 * Окна «Новый корпус» и «Новый этаж» (запись 58).
 *
 * Раньше это были формы прямо в дереве структуры: узкая колонка, подпись
 * мелким шрифтом и пояснение под полем. Окно даёт полям место, а выбор
 * «с планом или без» — сразу, а не потом.
 */

/** Номер, который напрашивается: следующий над самым верхним этажом. */
function suggestedFloor(building: BuildingMeta): number {
  return building.floors.length === 0 ? 1 : Math.floor(Math.max(...building.floors.map((floor) => floor.floor))) + 1;
}

export const NewBuildingDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const addBuilding = useEditorStore((s) => s.addBuilding);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const formId = useId();
  const inputId = useId();

  useEffect(() => {
    if (!open) return;
    setName(nextBuildingName(useEditorStore.getState().buildingMetas.values()));
    setProblem(null);
  }, [open]);

  const submit = () => {
    const result = addBuilding(name);
    if ('problem' in result) {
      setProblem(result.problem);
      return;
    }
    onClose();
  };

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="Новый корпус"
      footer={
        <>
          <button type="button" className="editor-button editor-button--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" form={formId} className="editor-button editor-button--primary">
            Создать
          </button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="editor-field">
          <FieldLabel label="Название" htmlFor={inputId} info="Так корпус называется в навигаторе и в поиске. Английское название — в свойствах корпуса." />
          <input
            id={inputId}
            aria-label="Название корпуса"
            aria-invalid={problem !== null}
            className="editor-input"
            value={name}
            data-autofocus
            onChange={(event) => {
              setName(event.target.value);
              setProblem(null);
            }}
          />
          {problem !== null && <span className="editor-field__problem">{problem}</span>}
        </div>
        <p className="editor-dialog__text">Этажи добавите после — из файлов планов или вручную.</p>
      </form>
    </ConfirmDialog>
  );
};

export const NewFloorDialog: React.FC<{ building: BuildingMeta | null; onClose: () => void }> = ({ building, onClose }) => {
  const addFloor = useEditorStore((s) => s.addFloor);
  const openImport = useEditorStore((s) => s.openImport);
  const [number, setNumber] = useState('');
  const [label, setLabel] = useState('');
  const [withPlan, setWithPlan] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const formId = useId();
  const numberId = useId();
  const labelId = useId();

  useEffect(() => {
    if (!building) return;
    setNumber(String(suggestedFloor(building)));
    setLabel('');
    setWithPlan(true);
    setProblem(null);
  }, [building]);

  const submit = () => {
    if (!building) return;
    const floor = parseFloorNumber(number);
    const result = addFloor(building.id, { floor, label });
    if (result !== null) {
      setProblem(result);
      return;
    }
    onClose();
    // С планом — сразу окно загрузки для этого этажа.
    if (withPlan) openImport([], { building: building.id, floor });
  };

  return (
    <ConfirmDialog
      open={building !== null}
      onClose={onClose}
      title={building ? `Новый этаж · ${building.name}` : 'Новый этаж'}
      footer={
        <>
          <button type="button" className="editor-button editor-button--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" form={formId} className="editor-button editor-button--primary">
            {withPlan ? 'Создать и загрузить план…' : 'Создать'}
          </button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="editor-card__row">
          <div className="editor-field">
            <FieldLabel label="Номер" htmlFor={numberId} info="Порядок этажей в корпусе: подвал −1, цоколь 0, антресоль между 1 и 2 — 1.5." />
            <input
              id={numberId}
              aria-label="Номер этажа"
              aria-invalid={problem !== null}
              className="editor-input"
              inputMode="decimal"
              value={number}
              data-autofocus
              onChange={(event) => {
                setNumber(event.target.value);
                setProblem(null);
              }}
            />
          </div>
          <div className="editor-field">
            <FieldLabel label="Подпись" htmlFor={labelId} info="Как этаж подписан на кнопке в навигаторе: «1А», «Ц». Пусто — номер." />
            <input
              id={labelId}
              aria-label="Подпись этажа"
              className="editor-input"
              placeholder={number || '1'}
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                setProblem(null);
              }}
            />
          </div>
        </div>
        {problem !== null && <p className="editor-field__problem">{problem}</p>}
        <fieldset className="editor-choice">
          <legend className="editor-field__label">План</legend>
          <label className="editor-check">
            <input type="radio" name={`${formId}-plan`} checked={withPlan} onChange={() => setWithPlan(true)} />
            <span className="editor-check__text">Загрузить файл плана</span>
          </label>
          <label className="editor-check">
            <input type="radio" name={`${formId}-plan`} checked={!withPlan} onChange={() => setWithPlan(false)} />
            <span className="editor-check__text">Без плана — добавить позже</span>
          </label>
        </fieldset>
      </form>
    </ConfirmDialog>
  );
};
