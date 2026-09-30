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
import { CommitField, FieldLabel, Section } from './Field';

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

/** Что за план: формат и размер, откуда взят, сохранён ли — строками «название — значение». */
const PlanFacts: React.FC<{ scope: string; meta: Pick<FloorMeta, 'mapSize' | 'planFormat' | 'source'> | undefined }> = ({ scope, meta }) => {
  const key = useEditorStore((s) => s.planFiles.get(scope));
  if (key === undefined) {
    return (
      <dl className="editor-facts">
        <dt>План</dt>
        <dd>нет — точки ставятся на пустое поле</dd>
      </dl>
    );
  }
  const size = meta?.mapSize ? `${meta.mapSize.width} × ${meta.mapSize.height} пикс.` : 'размер узнается при показе';
  const source = meta?.source;
  const scale = source?.metersPerUnit;
  return (
    <dl className="editor-facts">
      <dt>Файл</dt>
      <dd>
        {(meta?.planFormat ?? 'png').toUpperCase()}, {size}
      </dd>
      {source && (
        <>
          <dt>Взят из</dt>
          <dd>
            «{source.name ?? source.file}»{source.page ? `, лист ${source.page}` : ''}
          </dd>
        </>
      )}
      {scale !== undefined && (
        <>
          <dt>Масштаб чертежа</dt>
          <dd>известен</dd>
        </>
      )}
      {heldFile(key) && (
        <>
          <dt>На диске</dt>
          <dd>появится при сохранении</dd>
        </>
      )}
    </dl>
  );
};

/** Правка этажа из карточки — в её сессии: всё, что сделано в карточке, отменится разом. */
function useFloorChange(building: BuildingMeta, floor: FloorMeta) {
  const updateFloor = useEditorStore((s) => s.updateFloor);
  const edit = useSessionEdit(`floor:${building.id}/${floor.floor}`, `Этаж ${floorLabel(building, floor.floor)} корпуса «${building.name}»`);
  return (patch: Parameters<typeof updateFloor>[2]) => {
    let problem: string | null = null;
    edit(() => {
      problem = updateFloor(building.id, floor.floor, patch);
    });
    return problem;
  };
}

/**
 * Этаж в «Планах и корпусах» (запись 61): «Основное», «План», «Размещение».
 * Удаление — в опасной зоне внизу карточки (`DangerZone`).
 */
export const FloorSection: React.FC<{ building: BuildingMeta; floor: FloorMeta }> = ({ building, floor }) => {
  const change = useFloorChange(building, floor);
  const sessionKey = `floor:${building.id}/${floor.floor}`;

  return (
    <>
      <Section title="Основное" label="Этаж: основное">
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
      </Section>
      <Section title="План" label="Этаж: план">
        <PlanFacts scope={planScopeKey(building.id, floor.floor)} meta={floor} />
        <div className="editor-card__actions">
          <PlanFileButton building={building.id} floor={floor.floor} />
          <RedoPlanButton building={building.id} floor={floor.floor} source={floor.source} />
          <AlignButton building={building.id} floor={floor.floor} />
        </div>
      </Section>
      <FloorPlacementSection building={building} floor={floor} />
      <SessionBar sessionKey={sessionKey} what="этажа" />
    </>
  );
};

/** Корпус: «Корпус», «Размещение», «Высоты» (запись 61). */
export const BuildingSection: React.FC<{ building: BuildingMeta }> = ({ building }) => {
  const updateBuilding = useEditorStore((s) => s.updateBuilding);
  const sessionKey = `building:${building.id}`;
  const edit = useSessionEdit(sessionKey, `Корпус «${building.name}»`);

  const change = (patch: Parameters<typeof updateBuilding>[1]) => {
    let problem: string | null = null;
    edit(() => {
      problem = updateBuilding(building.id, patch);
    });
    return problem;
  };

  const floors = [...building.floors].sort((a, b) => a.floor - b.floor);
  const placed = building.placement?.originMeters !== undefined;

  return (
    <>
      <Section title="Корпус" label="Корпус: основное">
        <CommitField label="Название" ariaLabel="Название корпуса" value={building.name} onCommit={(text) => change({ name: text })} />
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
      </Section>
      {floors.length > 0 && (
        <Section
          title="Размещение"
          label="Корпус: размещение"
          info="Где корпус стоит на территории и как повёрнут. Пока корпус не размещён, навигатор не показывает время в пути."
        >
          <dl className="editor-facts">
            <dt>На территории</dt>
            <dd>
              <span className={placed ? 'editor-state editor-state--ok' : 'editor-state editor-state--warn'}>{placed ? 'размещён' : 'не размещён'}</span>
            </dd>
          </dl>
          <div className="editor-card__actions">
            <PlaceButton building={building} />
          </div>
        </Section>
      )}
      {placed && building.placement && (
        <Section title="Высоты" label="Корпус: высоты">
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
        </Section>
      )}
      <SessionBar sessionKey={sessionKey} what="корпуса" />
    </>
  );
};

/**
 * Опасная зона внизу карточки: удаление этажа и корпуса — отдельно от
 * остальных действий, чтобы не нажать его вместо соседней кнопки (запись 61).
 */
export const DangerZone: React.FC<{ building: BuildingMeta; floor?: FloorMeta }> = ({ building, floor }) => {
  const [deleting, setDeleting] = useState<'floor' | 'building' | null>(null);
  return (
    <div className="editor-card__danger" role="group" aria-label="Удаление">
      {floor && (
        <button type="button" className="editor-button editor-button--danger" onClick={() => setDeleting('floor')}>
          <Icon name="trash" />
          Удалить этаж…
        </button>
      )}
      <button type="button" className="editor-button editor-button--danger" onClick={() => setDeleting('building')}>
        <Icon name="trash" />
        Удалить корпус…
      </button>
      <DeleteDialog open={deleting === 'floor'} onClose={() => setDeleting(null)} building={building} floor={floor?.floor} />
      <DeleteDialog open={deleting === 'building'} onClose={() => setDeleting(null)} building={building} />
    </div>
  );
};

/** Территория в «Планах и корпусах»: «План», «Масштаб», «Корпуса» (запись 61). */
export const CampusPlanSection: React.FC = () => {
  const campusMeta = useEditorStore((s) => s.campusMeta);
  const campusMpp = campusMeta?.metersPerPixel;
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const startMeasuring = useEditorStore((s) => s.startMeasuring);
  const place = usePlaceBuilding();

  return (
    <>
      <Section title="План" label="Территория: план">
        <PlanFacts scope={planScopeKey(null, null)} meta={campusMeta ?? undefined} />
        <div className="editor-card__actions">
          <PlanFileButton building={null} floor={null} />
          <RedoPlanButton building={null} floor={null} source={campusMeta?.source} />
          <AlignButton building={null} floor={null} />
        </div>
      </Section>
      <Section
        title="Масштаб"
        label="Территория: масштаб"
        info="Сколько метров в пикселе плана территории. Без масштаба навигатор не показывает время в пути, а корпуса не разместить."
      >
        <dl className="editor-facts">
          <dt>1 пиксель</dt>
          <dd>
            {campusMpp === undefined ? (
              <span className="editor-state editor-state--warn">не задан</span>
            ) : (
              `${String(Math.round(campusMpp * 10000) / 10000).replace('.', ',')} м`
            )}
          </dd>
        </dl>
        <div className="editor-card__actions">
          <button type="button" className="editor-button editor-button--ghost" onClick={startMeasuring}>
            <Icon name="ruler" />
            {campusMpp === undefined ? 'Измерить масштаб…' : 'Уточнить масштаб…'}
          </button>
        </div>
      </Section>
      <Section title="Корпуса" label="Территория: корпуса">
        {buildingMetas.size === 0 && (
          <p className="editor-section__hint">Корпусов пока нет: «+ Корпус» в дереве или «Загрузить планы…» — корпус появится по листу.</p>
        )}
        <ul className="editor-list" aria-label="Корпуса">
          {[...buildingMetas.values()].map((meta) => {
            const placed = meta.placement?.originMeters !== undefined;
            return (
              <li key={meta.id} className="editor-list__row">
                <span className="editor-list__main">
                  <span className="editor-list__text">
                    <span className="editor-list__name">{meta.name}</span>
                    <span className={placed ? 'editor-list__sub' : 'editor-list__sub editor-state--warn'}>{placed ? 'размещён' : 'не размещён'}</span>
                  </span>
                </span>
                <button
                  type="button"
                  className="editor-button editor-button--ghost"
                  onClick={() => place(meta.id)}
                  disabled={meta.floors.length === 0}
                  aria-label={(placed ? 'Изменить размещение: ' : 'Разместить: ') + meta.name}
                >
                  {placed ? 'Изменить…' : 'Разместить…'}
                </button>
              </li>
            );
          })}
        </ul>
      </Section>
    </>
  );
};

/**
 * «Изменить обрезку…» — тот же лист присланного файла, с прежней рамкой и
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
        redo: { file: source.file, page: source.page ?? 1, rotation: source.rotation ?? 0, crop: source.crop ?? null, outline: source.outline ?? null },
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
 * другом (запись 53). «Размещение» по словарю — только корпус на территории:
 * в карточке этажа рядом стоит и секция корпуса, два одинаковых заголовка
 * путали.
 */
const FloorPlacementSection: React.FC<{ building: BuildingMeta; floor: FloorMeta }> = ({ building, floor }) => {
  const startPlacingFloor = useEditorStore((s) => s.startPlacingFloor);
  const setFloorPlacement = useEditorStore((s) => s.setFloorPlacement);
  const showNotice = useEditorStore((s) => s.showNotice);
  const entrance = openingFloorOf(building);
  if (entrance === null || floor.floor === entrance || building.placement?.originMeters === undefined) return null;
  return (
    <Section
      title="Совмещение"
      label="Этаж: совмещение с этажом входа"
      info="Если план этажа начерчен в другом масштабе или со смещением, лестницы соседних этажей разъедутся. Совместите этаж с этажом входа."
    >
      <dl className="editor-facts">
        <dt>Положение</dt>
        <dd>{floor.placement ? 'совмещён с этажом входа' : `как у этажа входа ${floorLabel(building, entrance)}`}</dd>
      </dl>
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
    </Section>
  );
};

/** «Разместить на территории…» из карточки корпуса. */
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

/** «Заменить план…» или «Добавить план…» — окно загрузки планов для этого плана. */
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
    showNotice(`Удалён ${what}. Ctrl+Z вернёт всё`);
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
      <p className="editor-section__hint">Ctrl+Z вернёт всё, пока редактор открыт, даже после сохранения.</p>
      {whole && impact.nodes > 0 && (
        <label className="editor-check">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
          Понимаю, что удаляю весь корпус со всеми этажами
        </label>
      )}
    </ConfirmDialog>
  );
};
