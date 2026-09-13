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
   */
  activeFloor: ActiveFloor | null;

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

export const useMapStore = create<MapState>((set, get) => ({
  graph: null,
  aliasManager: null,
  campusMeta: null,
  buildingMetas: null,

  activeFloor: null,
  selectedNodeId: null,

  setData: (data) => set(data),

  setActiveFloor: (buildingId, floor) => {
    // Повторный выбор того же этажа не должен создавать новый объект:
    // подписчики сравнивают `activeFloor` по ссылке, а смена ссылки при
    // неизменном значении пересоздала бы слои карты на ровном месте.
    const current = get().activeFloor;
    if (current?.buildingId === buildingId && current.floor === floor) return;

    set({ activeFloor: { buildingId, floor }, selectedNodeId: null });
  },

  clearActiveFloor: () => {
    if (get().activeFloor === null) return;
    set({ activeFloor: null, selectedNodeId: null });
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
  },
}));
