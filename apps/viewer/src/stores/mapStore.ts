import { create } from 'zustand';
import { scopeOfFloor, scopeOfNode } from '@campus-map/core';
import type {
  AliasManager,
  BuildingMeta,
  CampusMeta,
  Graph,
  ViewScope,
} from '@campus-map/core';

/**
 * Состояние карты навигатора.
 *
 * Данные загружаются один раз и подменяются атомарно через `setData`.
 * Прежний набор из пяти отдельных сеттеров заставлял компоненты
 * перерисовываться на каждом шаге загрузки и допускал промежуточные
 * состояния, в которых граф уже новый, а метаданные корпусов ещё старые.
 */

/** Выбранный этаж корпуса. */
interface ActiveFloor {
  buildingId: string;
  floor: number;
}

/** Куда перевести камеру холста: на территорию, к корпусу или к месту. */
export type ViewTarget =
  | { kind: 'campus' }
  | { kind: 'building'; buildingId: string }
  | { kind: 'node'; nodeId: string };

/**
 * Просьба перевести камеру холста (запись 32). Номер отличает повторную просьбу
 * о том же виде: «к корпусу А» после того, как человек увёл карту сам.
 */
export interface ViewRequest {
  seq: number;
  target: ViewTarget;
}

/** Загруженный датасет в том виде, в каком его держит навигатор. */
interface MapData {
  graph: Graph;
  aliasManager: AliasManager;
  campusMeta: CampusMeta;
  buildingMetas: Map<string, BuildingMeta>;
}

interface MapState {
  graph: Graph | null;
  aliasManager: AliasManager | null;
  campusMeta: CampusMeta | null;
  buildingMetas: Map<string, BuildingMeta> | null;

  /**
   * Выбранный этаж. Единственный источник истины о том, что показано:
   * территория кампуса (`null`) или этаж конкретного корпуса.
   *
   * Отдельного флага режима просмотра намеренно нет: он полностью
   * выводился из этого поля и мог с ним разойтись, а `setViewMode` не
   * вызывался ни из одного компонента.
   *
   * На холсте кампуса это корпус, к которому приближена камера, и его этаж:
   * по нему шапка и колонка этажей показывают интерфейс корпуса.
   */
  activeFloor: ActiveFloor | null;

  /**
   * Этаж, открытый в каждом корпусе. На холсте у каждого корпуса свой этаж:
   * вернувшись к корпусу, человек видит тот, что смотрел, а маршрут открывает
   * этажи, по которым проходит. Корпус без записи показывает входной этаж
   * (`shownFloorOf`).
   */
  buildingFloors: Readonly<Record<string, number>>;

  /** Корпуса, приближенные настолько, что вместо крыши виден этаж. Ставит камера холста. */
  revealedBuildings: readonly string[];

  /** Корпуса, чьи этажи грузятся заранее: камера подлетает к ним. Ставит камера холста. */
  nearBuildings: readonly string[];

  /** Холст приближен настолько, что на территории видны точки мест и значки входов. */
  canvasDetailed: boolean;

  /** Последняя просьба к камере холста; карта из одного плана её не читает. */
  viewRequest: ViewRequest | null;

  /**
   * Место, выбранное нажатием на карту: узел, для которого показана карточка
   * «Отсюда / Сюда». Состояние интерфейса — вычислить его не из чего.
   *
   * Принадлежит показанному плану: смена этажа выбор снимает, иначе карточка
   * описывала бы место, которого на карте нет.
   */
  selectedNodeId: string | null;

  setData: (data: MapData) => void;
  setActiveFloor: (buildingId: string, floor: number) => void;
  clearActiveFloor: () => void;
  selectNode: (nodeId: string | null) => void;

  /**
   * Показывает область карты, где находится узел: его этаж или территорию.
   *
   * Одно правило для построенного маршрута (карта переходит к началу) и для
   * ссылки «вы здесь»; какому виду принадлежит узел, решает ядро
   * (`scopeOfNode`), а не разбор полей узла на месте.
   */
  showNode: (nodeId: string) => void;

  requestView: (target: ViewTarget) => void;

  /**
   * Корпус, к которому приближена камера холста, — или территория. В отличие
   * от `setActiveFloor` камеру никуда не ведёт и выбранное место не снимает:
   * этажи не менялись, место по-прежнему на карте.
   */
  focusFromCamera: (buildingId: string | null) => void;

  setRevealedBuildings: (buildingIds: readonly string[]) => void;
  setNearBuildings: (buildingIds: readonly string[]) => void;
  setCanvasDetailed: (detailed: boolean) => void;

  /** Открывает в корпусах этажи маршрута (`routeBuildingFloors`), камеру не ведёт. */
  showRouteFloors: (floors: Readonly<Record<string, number>>) => void;
}

/**
 * Область видимости карты для выбранного этажа.
 *
 * Производное значение, поэтому хранится не в сторе, а вычисляется:
 * дублировать источник истины — значит дать состоянию возможность
 * рассинхронизироваться. Само правило принадлежит ядру (`scopeOfFloor`),
 * здесь только переход от формы хранения навигатора к его аргументам.
 */
export function scopeOf(activeFloor: ActiveFloor | null): ViewScope {
  return scopeOfFloor(activeFloor?.buildingId ?? null, activeFloor?.floor ?? null);
}

/**
 * Этажи корпуса сверху вниз — в таком порядке их рисует панель этажей.
 */
export function floorsOfBuilding(meta: BuildingMeta | undefined): number[] {
  if (!meta) return [];
  return meta.floors.map((f) => f.floor).sort((a, b) => b - a);
}

/**
 * Этаж, на который попадает студент, выбрав корпус на карте кампуса.
 *
 * Явный `entranceFloor` из метаданных корпуса важнее любого правила:
 * нумерация этажей в вузах разная, и по одним номерам её не угадать.
 *
 * Без поля действует правило. Раньше брался просто низший этаж: в тестовых
 * данных подвалов нет, поэтому это работало, но корпус с этажом −1 или 0
 * отправлял бы человека **в подвал** вместо входной группы. Теперь — низший
 * этаж не ниже первого; если все этажи отрицательные (бывает у подземных
 * переходов), берётся верхний из них, ближайший к поверхности.
 */
export function entranceFloorOf(meta: BuildingMeta | undefined): number {
  if (meta?.entranceFloor !== undefined) return meta.entranceFloor;

  const floors = floorsOfBuilding(meta);
  if (floors.length === 0) return 1;

  const aboveGround = floors.filter((floor) => floor >= 1);

  return aboveGround.length > 0
    ? aboveGround[aboveGround.length - 1] // floorsOfBuilding сортирует по убыванию
    : floors[0];
}

/** Этаж, который показывает корпус: открытый в нём последним, иначе входной. */
export function shownFloorOf(
  buildingFloors: Readonly<Record<string, number>>,
  meta: BuildingMeta | undefined,
  buildingId: string
): number {
  return buildingFloors[buildingId] ?? entranceFloorOf(meta);
}

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, index) => id === b[index]);

export const useMapStore = create<MapState>((set, get) => ({
  graph: null,
  aliasManager: null,
  campusMeta: null,
  buildingMetas: null,

  activeFloor: null,
  buildingFloors: {},
  revealedBuildings: [],
  nearBuildings: [],
  canvasDetailed: false,
  viewRequest: null,
  selectedNodeId: null,

  setData: (data) => set(data),

  setActiveFloor: (buildingId, floor) => {
    // Повторный выбор того же этажа не должен создавать новый объект:
    // подписчики сравнивают `activeFloor` по ссылке, а смена ссылки при
    // неизменном значении пересоздала бы слои карты на ровном месте.
    const { activeFloor: current, buildingFloors } = get();
    if (current?.buildingId === buildingId && current.floor === floor) {
      // Этаж маршрута мог записаться корпусу раньше (`showRouteFloors`), а
      // открыт этот: запись должна совпадать с тем, что на экране.
      if (buildingFloors[buildingId] !== floor) set({ buildingFloors: { ...buildingFloors, [buildingId]: floor } });
      return;
    }

    set({
      activeFloor: { buildingId, floor },
      buildingFloors: { ...buildingFloors, [buildingId]: floor },
      selectedNodeId: null,
    });
    // Камера идёт к корпусу, только если он другой: этажи одного корпуса
    // листаются на месте.
    if (current?.buildingId !== buildingId) get().requestView({ kind: 'building', buildingId });
  },

  clearActiveFloor: () => {
    if (get().activeFloor === null) return;
    set({ activeFloor: null, selectedNodeId: null });
    get().requestView({ kind: 'campus' });
  },

  selectNode: (nodeId) => {
    if (get().selectedNodeId !== nodeId) set({ selectedNodeId: nodeId });
  },

  showNode: (nodeId) => {
    const node = get().graph?.getNode(nodeId);
    if (!node) return;

    const scope = scopeOfNode(node);
    if (scope.mode === 'campus') get().clearActiveFloor();
    else get().setActiveFloor(scope.buildingId, scope.floor);
    // Камера — к самому месту, а не ко всему корпусу: эта просьба заменяет
    // просьбу о корпусе.
    get().requestView({ kind: 'node', nodeId });
  },

  requestView: (target) => set({ viewRequest: { seq: (get().viewRequest?.seq ?? 0) + 1, target } }),

  focusFromCamera: (buildingId) => {
    const { activeFloor, buildingFloors, buildingMetas } = get();
    if ((activeFloor?.buildingId ?? null) === buildingId) return;

    set({
      activeFloor:
        buildingId === null
          ? null
          : { buildingId, floor: shownFloorOf(buildingFloors, buildingMetas?.get(buildingId), buildingId) },
    });
  },

  // Камера ставит наборы на каждом кадре масштаба: тот же набор не должен
  // будить подписчиков.
  setRevealedBuildings: (buildingIds) => {
    if (!sameIds(get().revealedBuildings, buildingIds)) set({ revealedBuildings: buildingIds });
  },

  setNearBuildings: (buildingIds) => {
    if (!sameIds(get().nearBuildings, buildingIds)) set({ nearBuildings: buildingIds });
  },

  setCanvasDetailed: (detailed) => {
    if (get().canvasDetailed !== detailed) set({ canvasDetailed: detailed });
  },

  showRouteFloors: (floors) => set({ buildingFloors: { ...get().buildingFloors, ...floors } }),
}));
