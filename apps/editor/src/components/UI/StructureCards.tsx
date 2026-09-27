import React, { useCallback, useEffect, useState } from 'react';
import { CAMPUS_BUILDING_ID, floorLabel } from '@campus-map/core';
import type { BuildingMeta, FloorMeta, PlanSource } from '@campus-map/core';
import { useEditorStore } from '../../stores/editorStore';
import { usePlaceBuilding } from '../../hooks/usePlaceBuilding';
import { openingFloorOf } from '../../stores/editor/viewSlice';
import { parseFloorNumber } from '../../stores/editor/structureSlice';
import { useHistoryStore } from '../../stores/historyStore';
import { heldFile, planScopeKey } from '../../utils/planFiles';
import { heldSource } from '../../utils/saveFiles';
import { fetchSourceFile } from '../../utils/diskStore';
import { plural } from '../../utils/labels';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { SessionBar } from './SessionBar';
import { CommitField, FieldLabel } from './Field';

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
        <CommitField
          label="Номер"
          ariaLabel="Номер этажа"
          value={String(floor.floor)}
          inputMode="decimal"
          info="Порядок этажей в корпусе: подвал −1, цоколь 0, антресоль между 1 и 2 — 1.5."
          onCommit={(text) => change({ floor: parseFloorNumber(text) })}
        />
        <CommitField
          label="Подпись"
          ariaLabel="Подпись этажа"
          value={floor.label ?? ''}
          placeholder={floorLabel(undefined, floor.floor)}
          info="Как этаж подписан на кнопке в навигаторе: «1А», «Ц». Пусто — номер."
          onCommit={(text) => change({ label: text })}
        />
      </div>
      <PlanFacts scope={planScopeKey(building.id, floor.floor)} meta={floor} />
      <FloorPlacementNote building={building} floor={floor} />
      <SessionBar sessionKey={sessionKey} what="этажа" />
      <div className="editor-card__actions">
        <PlanFileButton building={building.id} floor={floor.floor} />
        <RedoPlanButton building={building.id} floor={floor.floor} source={floor.source} />
        <AlignButton building={building.id} floor={floor.floor} />
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
      <CommitField
        label="Название"
        ariaLabel="Название корпуса"
        value={building.name}
        onCommit={(text) => change({ name: text })}
      />
      <CommitField
        label="Название по-английски"
        ariaLabel="Название корпуса по-английски"
        value={building.translations?.en?.name ?? ''}
        placeholder="например, Building A"
        info="Для английской версии навигатора. Пусто — показывается русское название."
        onCommit={(text) => change({ nameEn: text })}
      />
      {floors.length > 0 && (
        <div className="editor-field">
          <FieldLabel label="Этаж входа" info="Этот этаж навигатор открывает первым, когда выбирают корпус." />
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
        </div>
      )}
      {building.placement?.originMeters !== undefined && (
        <div className="editor-card__row">
          <CommitField
            label="Высота этажа, м"
            value={String(building.placement.floorHeightMeters ?? '')}
            inputMode="decimal"
            placeholder="3,6"
            info="Нужна, чтобы считать время в пути по лестницам."
            onCommit={(text) => {
              const value = Number(text.replace(',', '.'));
              if (!(value > 0)) return 'Высота этажа — положительное число метров';
              return change({ placement: { ...building.placement, floorHeightMeters: value } });
            }}
          />
          <CommitField
            label="Отметка 1 этажа, м"
            ariaLabel="Отметка первого этажа, м"
            value={String(building.placement.baseElevationMeters ?? '')}
            inputMode="decimal"
            placeholder="0"
            info="Высота пола первого этажа над землёй. 0 — вход с уровня земли."
            onCommit={(text) => {
              const value = Number(text.replace(',', '.').replace(/[−–—]/g, '-'));
              if (!Number.isFinite(value)) return 'Отметка — число метров';
              return change({ placement: { ...building.placement, baseElevationMeters: value } });
            }}
          />
        </div>
      )}
      <SessionBar sessionKey={sessionKey} what="корпуса" />
      <div className="editor-card__actions">
        <PlaceButton building={building} />
        <button type="button" className="editor-button editor-button--danger" onClick={() => setDeleting(true)}>
          <Icon name="trash" />
          Удалить корпус…
        </button>
      </div>
      <DeleteDialog open={deleting} onClose={() => setDeleting(false)} building={building} />
    </section>
  );
};

/** Масштаб территории и корпуса на ней: что поставлено, что нет. */
const TerritorySection: React.FC = () => {
  const campusMpp = useEditorStore((s) => s.campusMeta?.metersPerPixel);
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const startMeasuring = useEditorStore((s) => s.startMeasuring);
  const place = usePlaceBuilding();

  return (
    <section className="editor-card__section" aria-label="Корпуса на территории">
      <h3 className="editor-card__heading">Корпуса на территории</h3>
      <p className="editor-section__hint">
        {campusMpp === undefined
          ? 'Масштаб территории не задан: без него нет метров — ни времени в пути, ни постановки корпусов.'
          : `Масштаб территории: 1 пикс. = ${String(Math.round(campusMpp * 10000) / 10000).replace('.', ',')} м.`}
      </p>
      <div className="editor-card__actions">
        <button type="button" className="editor-button editor-button--ghost" onClick={startMeasuring}>
          <Icon name="ruler" />
          {campusMpp === undefined ? 'Задать масштаб по двум точкам…' : 'Уточнить масштаб…'}
        </button>
      </div>
      <ul className="editor-list" aria-label="Корпуса">
        {[...buildingMetas.values()].map((meta) => {
          const placed = meta.placement?.originMeters !== undefined;
          return (
            <li key={meta.id} className="editor-list__row">
              <span className="editor-list__main">
                <span className="editor-list__text">
                  <span className="editor-list__name">{meta.name}</span>
                  <span className="editor-list__sub">{placed ? 'размещён на территории' : 'не размещён — навигатор не знает, где он'}</span>
                </span>
              </span>
              <button type="button" className="editor-button editor-button--ghost" onClick={() => place(meta.id)} disabled={meta.floors.length === 0}>
                {placed ? 'Изменить размещение…' : 'Разместить…'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** План территории: что за файл. */
export const CampusPlanSection: React.FC = () => {
  const campusMeta = useEditorStore((s) => s.campusMeta);
  return (
    <>
    <section className="editor-card__section" aria-label="План территории">
      <h3 className="editor-card__heading">План территории</h3>
      <PlanFacts scope={planScopeKey(null, null)} meta={campusMeta ?? undefined} />
      <div className="editor-card__actions">
        <PlanFileButton building={null} floor={null} />
        <RedoPlanButton building={null} floor={null} source={campusMeta?.source} />
        <AlignButton building={null} floor={null} />
      </div>
    </section>
    <TerritorySection />
    </>
  );
};

/**
 * «Переделать план…» — тот же лист присланного файла, с прежней рамкой и
 * поворотом: поправить обрезку или поворот, а точки пересчитаются сами.
 */
const RedoPlanButton: React.FC<{ building: string | null; floor: number | null; source: PlanSource | undefined }> = ({
  building,
  floor,
  source,
}) => {
  const openImport = useEditorStore((s) => s.openImport);
  const showNotice = useEditorStore((s) => s.showNotice);
  const [loading, setLoading] = useState(false);
  if (!source) return null;

  const redo = async () => {
    setLoading(true);
    try {
      const blob = heldSource(source.file)?.blob ?? (await fetchSourceFile(source.file));
      const name = (source.name ?? source.file).split(' › ').pop() ?? source.file;
      if (!blob) {
        showNotice(`Оригинала «${name}» на этой машине нет. Перетащите тот же файл на редактор — он узнает его`, 'warn');
        return;
      }
      openImport([new File([blob], name)], {
        ...(building === null ? { campus: true } : { building, floor: floor ?? undefined }),
        redo: { file: source.file, page: source.page ?? 1, rotation: source.rotation ?? 0, crop: source.crop ?? null },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className="editor-button editor-button--ghost"
      disabled={loading}
      onClick={() => void redo()}
      title="Открыть тот же лист присланного файла: поправить рамку или поворот, точки пересчитаются сами"
    >
      Изменить обрезку…
    </button>
  );
};

/**
 * Совмещение этажа с этажом входа: этажи одного корпуса бывают начерчены в
 * разном масштабе или с разными полями, а лестницы должны стоять друг над
 * другом (запись 53).
 */
const FloorPlacementNote: React.FC<{ building: BuildingMeta; floor: FloorMeta }> = ({ building, floor }) => {
  const startPlacingFloor = useEditorStore((s) => s.startPlacingFloor);
  const setFloorPlacement = useEditorStore((s) => s.setFloorPlacement);
  const showNotice = useEditorStore((s) => s.showNotice);
  const entrance = openingFloorOf(building);
  if (entrance === null || floor.floor === entrance || building.placement?.originMeters === undefined) return null;
  return (
    <div className="editor-card__field">
      <span className="editor-section__hint">
        {floor.placement
          ? `Этаж совмещён с этажом входа ${floorLabel(building, entrance)} отдельно от корпуса.`
          : `Этаж стоит как этаж входа ${floorLabel(building, entrance)}. Если план начерчен в другом масштабе, лестницы разъедутся — совместите.`}
      </span>
      <div className="editor-card__actions">
        <button
          type="button"
          className="editor-button editor-button--ghost"
          onClick={() => {
            const problem = startPlacingFloor(building.id, floor.floor);
            if (problem) showNotice(problem, 'warn');
          }}
        >
          <Icon name="layers" />
          Совместить с этажом входа…
        </button>
        {floor.placement && (
          <button type="button" className="editor-button editor-button--ghost" onClick={() => setFloorPlacement(building.id, floor.floor, null)}>
            Как у корпуса
          </button>
        )}
      </div>
    </div>
  );
};

/** «Поставить на территорию…» из карточки корпуса. */
const PlaceButton: React.FC<{ building: BuildingMeta }> = ({ building }) => {
  const place = usePlaceBuilding();
  if (building.floors.length === 0) return null;
  const placed = building.placement?.originMeters !== undefined;
  return (
    <button type="button" className="editor-button editor-button--ghost" onClick={() => place(building.id)}>
      <Icon name="map" />
      {placed ? 'Изменить размещение…' : 'Разместить на территории…'}
    </button>
  );
};

/** «Совместить точки с планом» — когда точки плана не легли на новый план. */
const AlignButton: React.FC<{ building: string | null; floor: number | null }> = ({ building, floor }) => {
  const startAlignment = useEditorStore((s) => s.startAlignment);
  const hasNodes = useEditorStore((s) => {
    for (const node of s.nodes.values()) {
      if (building === null ? node.building === CAMPUS_BUILDING_ID : node.building === building && node.floor === floor) return true;
    }
    return false;
  });
  const hasPlan = useEditorStore((s) => s.planFiles.has(planScopeKey(building, floor)));
  if (!hasNodes || !hasPlan) return null;
  return (
    <button
      type="button"
      className="editor-button editor-button--ghost"
      onClick={() => startAlignment([{ building, floor }])}
      title="Точки не на своих местах после замены плана: назовите пары «эта точка — вот здесь», и все точки переедут разом"
    >
      <Icon name="move" />
      Совместить точки с планом…
    </button>
  );
};

/** «Заменить план…» или «Добавить план…» — окно «Планы из файлов» для этого плана. */
const PlanFileButton: React.FC<{ building: string | null; floor: number | null }> = ({ building, floor }) => {
  const openImport = useEditorStore((s) => s.openImport);
  const hasPlan = useEditorStore((s) => s.planFiles.has(planScopeKey(building, floor)));
  return (
    <button
      type="button"
      className="editor-button editor-button--ghost"
      onClick={() => openImport([], building === null ? { campus: true } : { building, floor: floor ?? undefined })}
    >
      <Icon name="upload" />
      {hasPlan ? 'Заменить план…' : 'Добавить план…'}
    </button>
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
