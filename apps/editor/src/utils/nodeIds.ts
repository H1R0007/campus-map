import { CAMPUS_BUILDING_ID } from '@campus-map/core';
import type { PlaceKind } from '@campus-map/core';

/**
 * Приставка плана в id: корпус и этаж.
 *
 * Соглашение датасета — `a1_room101`, `campus_gate`: буква корпуса берётся из
 * последней части его id (`building_a` → `a`), к ней приписан этаж.
 */
export function planPrefix(building: string | null, floor: number | null): string {
  if (building === null || building === CAMPUS_BUILDING_ID) return 'campus';
  const tail = building.split('_').pop() ?? building;
  const letters = tail.toLowerCase().replace(/[^a-z0-9]/g, '') || 'x';
  return `${letters}${floor ?? 0}`;
}

/** Только то, что годится в id: латиница, цифры и подчёркивание. */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * id новой точки — по виду и плану, а не «node_17».
 *
 * По автоматическому `building_a_1_node_3` невозможно ни найти точку в
 * данных, ни понять, что она означает: именно так в датасете однажды
 * появился мусорный треугольник (README, «Идентификаторы»). Вид точки знает,
 * что это — туалет, лестница, помещение, — и id получается говорящим.
 *
 * Номер приписывается, только если такой id уже занят: `a1_toilet`,
 * `a1_toilet_2`.
 */
export function nodeIdForKind(
  kind: Pick<PlaceKind, 'id' | 'name'> | null,
  building: string | null,
  floor: number | null,
  taken: (id: string) => boolean
): string {
  return uniqueNodeId(`${planPrefix(building, floor)}_${slug(kind?.id ?? '') || 'node'}`, taken);
}

/** Свободный id рядом с занятым: `a1_room101` → `a1_room101_2`. */
export function uniqueNodeId(base: string, taken: (id: string) => boolean): string {
  if (!taken(base)) return base;

  for (let i = 2; ; i += 1) {
    const candidate = `${base}_${i}`;
    if (!taken(candidate)) return candidate;
  }
}

/**
 * Тот же id на другом плане: `a1_room101` при вставке на второй этаж
 * становится `a2_room101`.
 *
 * Копия сохраняет смысл названия — иначе вставленный этаж превращается в
 * россыпь безымянных `node`, и найти в данных конкретное помещение нельзя.
 */
export function rebaseNodeId(id: string, fromPrefix: string, toPrefix: string): string {
  if (fromPrefix === toPrefix) return id;
  const tail = id.startsWith(`${fromPrefix}_`) ? id.slice(fromPrefix.length + 1) : id;
  return `${toPrefix}_${tail}`;
}

/** Что не так с новым id: текст для человека или `null`, если всё в порядке. */
export function nodeIdProblem(id: string, taken: (id: string) => boolean, current: string): string | null {
  const trimmed = id.trim();
  if (trimmed.length === 0) return 'id не может быть пустым';
  if (trimmed === current) return null;
  if (!/^[a-z0-9_]+$/.test(trimmed)) return 'в id только латиница в нижнем регистре, цифры и подчёркивание';
  if (taken(trimmed)) return 'такой id уже занят другой точкой';
  return null;
}
