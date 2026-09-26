import { produce } from 'immer';
import type { Draft } from 'immer';
import { CAMPUS_BUILDING_ID, MAX_FLOOR_LABEL_LENGTH, floorLabel } from '@campus-map/core';
import type { BuildingMeta, MapNode, MapSize, PlanFormat, PlanPlacement, PlanSource } from '@campus-map/core';
import { useHistoryStore } from '../historyStore';
import type { StructureSide } from '../historyStore';
import { applySimilarity, planChange } from '../../import/planGeometry';
import type { Similarity } from '../../import/planGeometry';
import { plural } from '../../utils/labels';
import { planScopeKey } from '../../utils/planFiles';
import { syncPortals } from './graphState';
import { applyStructureSide, forgetPlace, snapshotPlace } from './historyApply';
import { openingFloorOf } from './viewSlice';
import type { EditorSlice, EditorStore } from './types';

/**
 * Корпуса, этажи и планы: добавить, изменить, удалить (запись 47).
 *
 * Каждое действие — одна запись истории `STRUCTURE`: отмена возвращает и
 * метаданные, и точки удалённого этажа с их названиями и переходами, и план.
 * Удаление этажа или корпуса — самая дорогая ошибка разметки, поэтому
 * интерфейс перед ним показывает, что именно уйдёт (`deletionImpact`).
 */

/** Готовый план: содержимое, формат, размер и откуда он взят. */
export interface PlanInput {
  /** Ключ содержимого (`utils/planFiles.ts`). */
  key: string;
  format: PlanFormat;
  mapSize: MapSize;
  source?: PlanSource;
  /**
   * Как переезжают точки плана: старый пиксель → новый. Нужен, когда план
   * переделан из того же исходника или совмещён со старым по парам точек.
   */
  moveNodes?: Similarity;
}

export interface NewFloor {
  floor: number;
  label?: string;
  plan?: PlanInput;
}

export interface FloorPatch {
  floor?: number;
  /** Пустая строка или `null` убирают подпись. */
  label?: string | null;
  elevationMeters?: number | null;
  placement?: PlanPlacement | null;
}

export interface BuildingPatch {
  name?: string;
  /** Английское имя; пустое убирает перевод. */
  nameEn?: string;
  entranceFloor?: number | null;
  placement?: BuildingMeta['placement'] | null;
}

/** Что уйдёт вместе с этажом или корпусом — для предупреждения. */
export interface DeletionImpact {
  floors: number;
  nodes: number;
  /** Точки с названием — то, что человек искал бы в навигаторе. */
  named: number;
  /** Переходы, которые ведут на оставшиеся планы: лестницы оборвутся. */
  crossings: number;
  plans: number;
}

/** Этаж из окна «Планы из файлов»: корпус — существующий или новый по имени. */
export interface ImportFloor {
  building: { id: string } | { newName: string };
  floor: number;
  label?: string;
  plan: PlanInput;
}

export interface ImportPlans {
  floors: ImportFloor[];
  campus?: PlanInput;
}

/** План: этаж корпуса или территория (`building === null`). */
export interface PlanRef {
  building: string | null;
  floor: number | null;
}

export interface ImportResult {
  problem: string | null;
  /**
   * Планы, которым заменили план, а точки остались в прежних координатах:
   * их нужно совместить с новым планом по парам точек. План, переделанный из
   * того же исходника, сюда не попадает — его точки пересчитаны сами.
   */
  align: PlanRef[];
}

export interface StructureSlice {
  /** Добавляет корпус без этажей. @returns id корпуса или текст проблемы */
  addBuilding: (name: string) => { id: string } | { problem: string };
  /** @returns текст проблемы или `null` */
  updateBuilding: (id: string, patch: BuildingPatch) => string | null;
  deleteBuilding: (id: string) => void;
  /** @returns текст проблемы или `null` */
  addFloor: (buildingId: string, floor: NewFloor) => string | null;
  /** @returns текст проблемы или `null` */
  updateFloor: (buildingId: string, floor: number, patch: FloorPatch) => string | null;
  deleteFloor: (buildingId: string, floor: number) => void;
  /** Ставит план этажу или территории (`buildingId === null`). */
  setPlan: (buildingId: string | null, floor: number | null, plan: PlanInput) => void;
  deletionImpact: (buildingId: string, floor?: number) => DeletionImpact;
  /**
   * Всё, что выбрано в окне «Планы из файлов», — одной записью истории: новые
   * корпуса, этажи, планы. Этажу, который уже есть, план заменяется.
   *
   * @returns текст проблемы или `null`
   */
  importPlans: (request: ImportPlans) => ImportResult;
  /** Сдвигает все точки плана одним подобием — совмещение с новым планом, одна правка. */
  moveNodesOfPlan: (plan: PlanRef, transform: Similarity, description: string) => void;
}

// ---------- проверки: общие для стора и форм ----------

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh',
  щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Латиница из русского имени: «Корпус Г» → «korpus g». */
export function transliterate(value: string): string {
  return [...value.toLowerCase()].map((char) => CYRILLIC[char] ?? char).join('');
}

/** Буква или слово корпуса из имени: «Корпус Г» → «Г»; без слова «корпус» — `null`. */
export function buildingLetter(name: string): string | null {
  return /^корпус\s+(\S+)$/i.exec(name.trim())?.[1] ?? null;
}

/**
 * Код корпуса в данных — по имени, как принято в датасете: «Корпус Г» →
 * `building_g`. Код — часть путей файлов и id точек (`g1_room101`), поэтому
 * только латиница, цифры и подчёркивание.
 */
export function buildingIdFor(name: string, taken: (id: string) => boolean): string {
  const letter = buildingLetter(name);
  const slug = transliterate(letter ?? name)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base = `building_${slug || 'new'}`;
  if (!taken(base)) return base;
  for (let i = 2; ; i += 1) if (!taken(`${base}_${i}`)) return `${base}_${i}`;
}

/** Буквы корпусов по порядку — без Ё, Й, Ъ, Ы, Ь: ими корпуса не называют. */
const BUILDING_LETTERS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';

/** Имя для нового корпуса: следующая свободная буква после последней занятой. */
export function nextBuildingName(metas: Iterable<BuildingMeta>): string {
  const used = new Set<string>();
  for (const meta of metas) {
    const letter = buildingLetter(meta.name)?.toUpperCase();
    if (letter) used.add(letter);
  }
  const last = Math.max(-1, ...[...used].map((letter) => BUILDING_LETTERS.indexOf(letter)));
  const next = [...BUILDING_LETTERS].find((letter, index) => index > last && !used.has(letter)) ??
    [...BUILDING_LETTERS].find((letter) => !used.has(letter));
  return next ? `Корпус ${next}` : 'Корпус ';
}

/** Что не так с именем корпуса: текст для человека или `null`. */
export function buildingNameProblem(name: string, metas: ReadonlyMap<string, BuildingMeta>, selfId?: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Название корпуса не может быть пустым';
  for (const meta of metas.values()) {
    if (meta.id !== selfId && meta.name.trim().toLowerCase() === trimmed.toLowerCase()) {
      return `Корпус «${meta.name}» уже есть`;
    }
  }
  return null;
}

/** Число из поля: «−1», «1,5» и «1.5» — одно и то же. */
export function parseFloorNumber(text: string): number {
  const normalized = text.trim().replace(/[−–—]/g, '-').replace(',', '.');
  return normalized === '' ? Number.NaN : Number(normalized);
}

/** Что не так с номером этажа: текст для человека или `null`. */
export function floorNumberProblem(floor: number, meta: BuildingMeta | undefined, current?: number): string | null {
  if (!Number.isFinite(floor)) return 'Номер этажа — число: 1, 2, −1 для подвала, 1.5 для антресоли';
  if (Math.abs(floor) > 200) return 'Номер этажа слишком большой';
  if (floor !== current && meta?.floors.some((item) => item.floor === floor)) {
    return `Этаж ${floorLabel(meta, floor)} в корпусе уже есть`;
  }
  return null;
}

/** Что не так с подписью этажа: текст для человека или `null`. */
export function floorLabelProblem(label: string): string | null {
  return label.trim().length > MAX_FLOOR_LABEL_LENGTH
    ? `Подпись этажа — не длиннее ${MAX_FLOOR_LABEL_LENGTH} знаков: она стоит на кнопке этажа`
    : null;
}

// ---------- запись истории ----------

type State = Draft<EditorStore>;

/** Точки корпуса или этажа. */
function nodesOf(nodes: ReadonlyMap<string, MapNode>, buildingId: string, floor?: number): string[] {
  const ids: string[] = [];
  for (const node of nodes.values()) {
    if (node.building === buildingId && (floor === undefined || node.floor === floor)) ids.push(node.id);
  }
  return ids;
}

/** Точки, которые правка задевает, удаляя `removed`: они сами и их соседи. */
function touchedByRemoval(nodes: ReadonlyMap<string, MapNode>, removed: ReadonlySet<string>): string[] {
  const touched = new Set(removed);
  for (const node of nodes.values()) {
    if (node.neighbors.some((id) => removed.has(id))) touched.add(node.id);
  }
  return [...touched];
}

function sideOf(st: EditorStore, nodeIds: readonly string[]): StructureSide {
  return {
    buildingMetas: [...st.buildingMetas.values()].map((meta) => structuredClone(meta)),
    campusMeta: st.campusMeta === null ? null : structuredClone(st.campusMeta),
    planFiles: [...st.planFiles.entries()],
    transitions: st.transitions.map((transition) => ({ ...transition })),
    nodes: nodeIds.map((id) => {
      const node = st.nodes.get(id);
      return [id, node ? { ...node, neighbors: [...node.neighbors] } : null];
    }),
    places: nodeIds.map((id) => [id, snapshotPlace(st, id)]),
    view: { building: st.currentBuilding, floor: st.currentFloor },
  };
}

/** Убирает точки вместе со связями на них, переходами и названиями. */
function removeNodes(s: State, removed: ReadonlySet<string>): void {
  for (const id of removed) {
    s.nodes.delete(id);
    forgetPlace(s, id);
  }
  for (const node of s.nodes.values()) {
    if (node.neighbors.some((id) => removed.has(id))) node.neighbors = node.neighbors.filter((id) => !removed.has(id));
  }
  s.transitions = s.transitions.filter((t) => !removed.has(t.fromNode) && !removed.has(t.toNode));
}

export const createStructureSlice: EditorSlice<StructureSlice> = (set, get) => {
  /**
   * Одна запись истории на правку структуры.
   *
   * Правка сначала применяется к копии состояния — так запись попадает в
   * историю раньше, чем меняются данные, как у всех остальных правок: запись
   * «со стороны» закрывает открытую правку панели по данным «до».
   */
  const commit = (description: string, nodeIds: readonly string[], mutate: (s: State) => void): void => {
    const current = get();
    const next = produce(current, (draft) => {
      mutate(draft);
      syncPortals(draft);
    });
    const ids = [...new Set(nodeIds)];
    const before = sideOf(current, ids);
    const after = sideOf(next, ids);

    useHistoryStore.getState().push({ type: 'STRUCTURE', description, undoData: before, redoData: after });
    set((s) => {
      applyStructureSide(s, after);
      syncPortals(s);
    });
  };

  return {
    addBuilding: (name) => {
      const st = get();
      const problem = buildingNameProblem(name, st.buildingMetas);
      if (problem) return { problem };

      const trimmed = name.trim();
      const meta = newBuildingMeta(trimmed, (candidate) => st.buildingMetas.has(candidate));
      const id = meta.id;

      commit(`Добавлен корпус «${trimmed}»`, [], (s) => {
        s.buildingMetas.set(id, meta);
        s.currentBuilding = id;
        s.currentFloor = null;
        s.selectedNodeIds = new Set();
      });
      return { id };
    },

    updateBuilding: (id, patch) => {
      const st = get();
      const meta = st.buildingMetas.get(id);
      if (!meta) return 'Корпуса нет';
      if (patch.name !== undefined) {
        const problem = buildingNameProblem(patch.name, st.buildingMetas, id);
        if (problem) return problem;
      }
      if (patch.entranceFloor != null && !meta.floors.some((item) => item.floor === patch.entranceFloor)) {
        return 'Этаж входа — один из этажей корпуса';
      }

      commit(`Изменён корпус «${patch.name?.trim() ?? meta.name}»`, [], (s) => {
        const target = s.buildingMetas.get(id)!;
        if (patch.name !== undefined) target.name = patch.name.trim();
        if (patch.nameEn !== undefined) {
          const nameEn = patch.nameEn.trim();
          const translations = { ...target.translations };
          if (nameEn) translations.en = { name: nameEn };
          else delete translations.en;
          target.translations = Object.keys(translations).length > 0 ? translations : undefined;
        }
        if (patch.entranceFloor !== undefined) target.entranceFloor = patch.entranceFloor ?? undefined;
        if (patch.placement !== undefined) target.placement = patch.placement ?? undefined;
      });
      return null;
    },

    deleteBuilding: (id) => {
      const st = get();
      const meta = st.buildingMetas.get(id);
      if (!meta) return;
      const removed = new Set(nodesOf(st.nodes, id));

      commit(`Удалён корпус «${meta.name}»`, touchedByRemoval(st.nodes, removed), (s) => {
        removeNodes(s, removed);
        s.buildingMetas.delete(id);
        for (const floor of meta.floors) s.planFiles.delete(planScopeKey(id, floor.floor));
        if (s.currentBuilding === id) {
          s.currentBuilding = null;
          s.currentFloor = null;
        }
      });
    },

    addFloor: (buildingId, input) => {
      const st = get();
      const meta = st.buildingMetas.get(buildingId);
      if (!meta) return 'Корпуса нет';
      const problem = floorNumberProblem(input.floor, meta) ?? floorLabelProblem(input.label ?? '');
      if (problem) return problem;

      const label = input.label?.trim();
      commit(`Добавлен этаж ${label || input.floor} в корпус «${meta.name}»`, [], (s) => {
        const target = s.buildingMetas.get(buildingId)!;
        target.floors.push({
          floor: input.floor,
          ...(label ? { label } : {}),
          ...(input.plan ? planFields(input.plan) : {}),
        });
        target.floors.sort((a, b) => a.floor - b.floor);
        if (input.plan) s.planFiles.set(planScopeKey(buildingId, input.floor), input.plan.key);
        s.currentBuilding = buildingId;
        s.currentFloor = input.floor;
        s.selectedNodeIds = new Set();
      });
      return null;
    },

    updateFloor: (buildingId, floor, patch) => {
      const st = get();
      const meta = st.buildingMetas.get(buildingId);
      const floorMeta = meta?.floors.find((item) => item.floor === floor);
      if (!meta || !floorMeta) return 'Этажа нет';
      const nextFloor = patch.floor ?? floor;
      const problem =
        floorNumberProblem(nextFloor, meta, floor) ?? (typeof patch.label === 'string' ? floorLabelProblem(patch.label) : null);
      if (problem) return problem;

      const renumbered = nextFloor !== floor;
      const moved = renumbered ? nodesOf(st.nodes, buildingId, floor) : [];

      commit(`Изменён этаж ${floorLabel(meta, floor)} корпуса «${meta.name}»`, moved, (s) => {
        const target = s.buildingMetas.get(buildingId)!;
        const item = target.floors.find((entry) => entry.floor === floor)!;
        if (patch.label !== undefined) {
          const label = patch.label?.trim();
          item.label = label ? label : undefined;
        }
        if (patch.elevationMeters !== undefined) item.elevationMeters = patch.elevationMeters ?? undefined;
        if (patch.placement !== undefined) item.placement = patch.placement ?? undefined;

        if (renumbered) {
          // Номер этажа — часть пути файлов и поле каждой точки этажа: план и
          // точки переезжают вместе с ним. id точек не меняются — на них
          // ссылаются переходы и названия.
          item.floor = nextFloor;
          target.floors.sort((a, b) => a.floor - b.floor);
          if (target.entranceFloor === floor) target.entranceFloor = nextFloor;
          for (const id of moved) s.nodes.get(id)!.floor = nextFloor;
          const planKey = s.planFiles.get(planScopeKey(buildingId, floor));
          s.planFiles.delete(planScopeKey(buildingId, floor));
          if (planKey !== undefined) s.planFiles.set(planScopeKey(buildingId, nextFloor), planKey);
          if (s.currentBuilding === buildingId && s.currentFloor === floor) s.currentFloor = nextFloor;
        }
      });
      return null;
    },

    deleteFloor: (buildingId, floor) => {
      const st = get();
      const meta = st.buildingMetas.get(buildingId);
      if (!meta?.floors.some((item) => item.floor === floor)) return;
      const removed = new Set(nodesOf(st.nodes, buildingId, floor));

      commit(`Удалён этаж ${floorLabel(meta, floor)} корпуса «${meta.name}»`, touchedByRemoval(st.nodes, removed), (s) => {
        removeNodes(s, removed);
        const target = s.buildingMetas.get(buildingId)!;
        target.floors = target.floors.filter((item) => item.floor !== floor);
        if (target.entranceFloor === floor) target.entranceFloor = undefined;
        s.planFiles.delete(planScopeKey(buildingId, floor));
        if (s.currentBuilding === buildingId && s.currentFloor === floor) {
          s.currentFloor = openingFloorOf(target);
        }
      });
    },

    setPlan: (buildingId, floor, plan) => {
      const st = get();
      const scope = planScopeKey(buildingId, floor);
      const building = buildingId === null ? undefined : st.buildingMetas.get(buildingId);
      if (buildingId !== null && !building?.floors.some((item) => item.floor === floor)) return;
      const moved = plan.moveNodes
        ? buildingId === null
          ? nodesOf(st.nodes, CAMPUS_BUILDING_ID)
          : nodesOf(st.nodes, buildingId, floor ?? undefined)
        : [];

      const where = buildingId === null ? 'территории' : `этажа ${floorLabel(building, floor ?? 0)} корпуса «${building!.name}»`;
      commit(`Новый план ${where}`, moved, (s) => {
        const target =
          buildingId === null ? s.campusMeta : s.buildingMetas.get(buildingId)!.floors.find((item) => item.floor === floor)!;
        if (target) Object.assign(target, planFields(plan));
        s.planFiles.set(scope, plan.key);
        if (plan.moveNodes) {
          for (const id of moved) {
            const node = s.nodes.get(id)!;
            const next = applySimilarity(plan.moveNodes, node);
            node.x = Math.round(next.x * 10) / 10;
            node.y = Math.round(next.y * 10) / 10;
          }
        }
      });
    },

    importPlans: (request) => {
      const st = get();
      const key = (name: string) => name.trim().toLowerCase();
      const newNames = new Map<string, string>();
      for (const item of request.floors) {
        if ('newName' in item.building) newNames.set(key(item.building.newName), item.building.newName.trim());
        else if (!st.buildingMetas.has(item.building.id)) return { problem: 'Корпуса нет', align: [] };
      }
      for (const name of newNames.values()) {
        const problem = buildingNameProblem(name, st.buildingMetas);
        if (problem) return { problem, align: [] };
      }

      const seen = new Set<string>();
      for (const item of request.floors) {
        const target = 'id' in item.building ? item.building.id : `new:${key(item.building.newName)}`;
        // Этаж, который уже есть, не помеха: ему заменяется план.
        const problem = floorNumberProblem(item.floor, undefined) ?? floorLabelProblem(item.label ?? '');
        if (problem) return { problem, align: [] };
        if (seen.has(`${target}|${item.floor}`)) return { problem: `Два листа на один этаж: ${item.floor}`, align: [] };
        seen.add(`${target}|${item.floor}`);
      }
      if (request.floors.length === 0 && !request.campus) return { problem: 'Нечего добавлять', align: [] };

      // Точки планов, которым меняется план: из того же исходника — пересчёт
      // точный, иначе — совмещение по парам после импорта.
      const moves = new Map<string, Similarity>();
      const align: PlanRef[] = [];
      const plansWithNodes = (plan: PlanRef, before: { source?: PlanSource; mapSize?: MapSize } | undefined, after: PlanInput) => {
        const ids = plan.building === null ? nodesOf(st.nodes, CAMPUS_BUILDING_ID) : nodesOf(st.nodes, plan.building, plan.floor ?? undefined);
        if (ids.length === 0 || !before) return [];
        const exact =
          before.source && before.mapSize && after.source
            ? planChange({ source: before.source, mapSize: before.mapSize }, { source: after.source, mapSize: after.mapSize })
            : null;
        if (exact) {
          for (const id of ids) moves.set(id, exact);
          return ids;
        }
        align.push(plan);
        return [];
      };
      const moved: string[] = [];
      for (const item of request.floors) {
        if (!('id' in item.building)) continue;
        const before = st.buildingMetas.get(item.building.id)?.floors.find((floor) => floor.floor === item.floor);
        moved.push(...plansWithNodes({ building: item.building.id, floor: item.floor }, before, item.plan));
      }
      if (request.campus) moved.push(...plansWithNodes({ building: null, floor: null }, st.campusMeta ?? undefined, request.campus));

      const parts = [
        request.floors.length > 0 ? `${request.floors.length} ${plural(request.floors.length, ['этаж', 'этажа', 'этажей'])}` : '',
        request.campus ? 'план территории' : '',
      ].filter(Boolean);

      commit(`Планы из файлов: ${parts.join(', ')}`, moved, (s) => {
        for (const [id, transform] of moves) {
          const node = s.nodes.get(id)!;
          const next = applySimilarity(transform, node);
          node.x = Math.round(next.x * 10) / 10;
          node.y = Math.round(next.y * 10) / 10;
        }
        const ids = new Map<string, string>();
        for (const [normalized, name] of newNames) {
          const meta = newBuildingMeta(name, (candidate) => s.buildingMetas.has(candidate));
          s.buildingMetas.set(meta.id, meta);
          ids.set(normalized, meta.id);
        }

        let first: { building: string | null; floor: number | null } | null = null;
        for (const item of request.floors) {
          const id = 'id' in item.building ? item.building.id : ids.get(key(item.building.newName))!;
          const meta = s.buildingMetas.get(id)!;
          let floor = meta.floors.find((entry) => entry.floor === item.floor);
          if (!floor) {
            meta.floors.push({ floor: item.floor });
            meta.floors.sort((a, b) => a.floor - b.floor);
            floor = meta.floors.find((entry) => entry.floor === item.floor)!;
          }
          const label = item.label?.trim();
          if (label) floor.label = label;
          Object.assign(floor, planFields(item.plan));
          s.planFiles.set(planScopeKey(id, item.floor), item.plan.key);
          first ??= { building: id, floor: item.floor };
        }

        if (request.campus && s.campusMeta) {
          Object.assign(s.campusMeta, planFields(request.campus));
          s.planFiles.set(planScopeKey(null, null), request.campus.key);
          first ??= { building: null, floor: null };
        }

        // Открывается первое добавленное: видно, что получилось.
        if (first) {
          s.currentBuilding = first.building;
          s.currentFloor = first.floor;
          s.selectedNodeIds = new Set();
        }
      });
      return { problem: null, align };
    },

    moveNodesOfPlan: (plan, transform, description) => {
      const st = get();
      const ids = plan.building === null ? nodesOf(st.nodes, CAMPUS_BUILDING_ID) : nodesOf(st.nodes, plan.building, plan.floor ?? undefined);
      if (ids.length === 0) return;
      commit(description, ids, (s) => {
        for (const id of ids) {
          const node = s.nodes.get(id)!;
          const next = applySimilarity(transform, node);
          node.x = Math.round(next.x * 10) / 10;
          node.y = Math.round(next.y * 10) / 10;
        }
      });
    },

    deletionImpact: (buildingId, floor) => {
      const st = get();
      const meta = st.buildingMetas.get(buildingId);
      const removed = new Set(nodesOf(st.nodes, buildingId, floor));
      let named = 0;
      for (const id of removed) if ((st.aliases.get(id) ?? []).length > 0) named += 1;
      const crossings = st.transitions.filter((t) => removed.has(t.fromNode) !== removed.has(t.toNode)).length;
      const floors = floor === undefined ? (meta?.floors ?? []) : (meta?.floors ?? []).filter((item) => item.floor === floor);
      const plans = floors.filter((item) => st.planFiles.has(planScopeKey(buildingId, item.floor))).length;
      return { floors: floors.length, nodes: removed.size, named, crossings, plans };
    },
  };
};

/** Новый корпус без этажей: код по букве, английское имя для навигатора. */
function newBuildingMeta(name: string, taken: (id: string) => boolean): BuildingMeta {
  const letter = buildingLetter(name);
  return {
    id: buildingIdFor(name, taken),
    name,
    // Английское имя для навигатора: корпуса называют буквами, и «Building G»
    // понятнее иностранцу, чем «Корпус Г».
    ...(letter ? { translations: { en: { name: `Building ${transliterate(letter).toUpperCase()}` } } } : {}),
    floors: [],
  };
}

/** Поля метаданных, которые задаёт план. */
function planFields(plan: PlanInput) {
  return { mapSize: { ...plan.mapSize }, planFormat: plan.format, source: plan.source ? structuredClone(plan.source) : undefined };
}
