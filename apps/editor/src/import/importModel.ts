import { floorLabel } from '@campus-map/core';
import type { BuildingMeta, MapSize } from '@campus-map/core';
import { buildingLetter } from '../stores/editor/structureSlice';
import type { ImportPreset } from '../stores/editor/panelSlice';
import { plural } from '../utils/labels';
import { planScopeKey } from '../utils/planFiles';
import { clueSource } from './guess';
import type { PlaceGuess } from './guess';
import { rotatedPage } from './planGeometry';
import type { Box } from './trim';

/**
 * Что человек решил про каждый лист в окне «Планы из файлов» (запись 48).
 *
 * Лист может дать несколько планов — «ещё область на этом листе»: на одном
 * листе бывает два этажа. Поэтому решение — не про лист, а про кусок листа.
 */

export type BuildingChoice = { id: string } | { newName: string };

export type PieceTarget =
  | { kind: 'floor'; building: BuildingChoice | null; floorText: string; label: string }
  | { kind: 'campus' }
  | { kind: 'skip' };

export interface Piece {
  id: string;
  sheetId: string;
  /** Поворот листа по часовой: 0, 90, 180, 270. */
  rotation: number;
  /** Область повёрнутого листа; `null` — весь лист. */
  crop: Box | null;
  /** Поля обрезаны сами — человеку видно, что это сделал редактор. */
  trimmed: boolean;
  target: PieceTarget;
  /** Откуда догадка — словами. */
  notes: string[];
  /** Переделка плана из того же листа: точки пересчитаются сами. */
  redo?: boolean;
}

let nextPiece = 1;
export const pieceId = () => `piece-${nextPiece++}`;

/**
 * Корпус по букве из догадки: сначала по имени («Корпус В»), затем по коду в
 * данных (`building_c` — буква имени файла латиницей). Нет такого — новый.
 */
export function resolveBuilding(
  guess: NonNullable<PlaceGuess['building']>,
  metas: ReadonlyMap<string, BuildingMeta>
): BuildingChoice {
  for (const meta of metas.values()) {
    if (buildingLetter(meta.name)?.toUpperCase() === guess.letter) return { id: meta.id };
  }
  if (guess.latin) {
    for (const meta of metas.values()) {
      if (meta.id.toLowerCase().endsWith(`_${guess.latin}`)) return { id: meta.id };
    }
  }
  return { newName: `Корпус ${guess.letter}` };
}

/** Число из поля этажа: «−1», «1,5». `NaN` — не число. */
export function floorFromText(text: string): number {
  const normalized = text.trim().replace(/[−–—]/g, '-').replace(',', '.');
  return normalized === '' ? Number.NaN : Number(normalized);
}

/**
 * Первое решение по листу — из догадки, а где догадка молчит — из того, для
 * чего открыли окно (кнопка «Заменить план» этажа).
 */
export function initialPiece(
  sheetId: string,
  guess: PlaceGuess,
  metas: ReadonlyMap<string, BuildingMeta>,
  preset: ImportPreset
): Piece {
  const notes: string[] = [];
  let target: PieceTarget;

  if (guess.kind === 'skip') {
    target = { kind: 'skip' };
    notes.push(`Похоже, не план — ${clueSource(guess.kindFrom!)}`);
  } else if (guess.kind === 'campus' || (guess.kind === null && preset.campus)) {
    target = { kind: 'campus' };
    if (guess.kindFrom) notes.push(`План территории — ${clueSource(guess.kindFrom)}`);
  } else {
    const building = guess.building
      ? resolveBuilding(guess.building, metas)
      : preset.building && metas.has(preset.building)
        ? { id: preset.building }
        : null;
    const floor = guess.floor?.floor ?? (guess.building === null ? preset.floor : undefined);
    target = {
      kind: 'floor',
      building,
      floorText: floor === undefined ? '' : String(floor),
      label: guess.floor?.label ?? '',
    };
    if (guess.building) notes.push(`Корпус ${guess.building.letter} — ${clueSource(guess.building.from)}`);
    if (guess.floor) notes.push(`Этаж ${guess.floor.label ?? guess.floor.floor} — ${clueSource(guess.floor.from)}`);
    if (!guess.building && !guess.floor && preset.building === undefined) notes.push('Корпус и этаж по файлу не угадать — укажите');
  }

  return { id: pieceId(), sheetId, rotation: 0, crop: null, trimmed: false, target, notes };
}

/**
 * Поворот куска на четверть оборота: область обрезки поворачивается вместе с
 * листом, чтобы обрезанное осталось тем же.
 */
export function rotatePiece(piece: Piece, sheetSize: MapSize, direction: 1 | -1): Piece {
  const rotation = (piece.rotation + direction * 90 + 360) % 360;
  if (!piece.crop) return { ...piece, rotation };
  const { width, height } = rotatedPage(sheetSize, piece.rotation).size;
  const { x, y, width: w, height: h } = piece.crop;
  const crop =
    direction === 1
      ? { x: height - (y + h), y: x, width: h, height: w }
      : { x: y, y: width - (x + w), width: h, height: w };
  return { ...piece, rotation, crop };
}

/** Что с куском не так (нельзя добавить) и что стоит знать (добавить можно). */
export interface PieceCheck {
  problem: string | null;
  note: string | null;
}

/** Ключ этажа, куда встанет кусок, — для поиска повторов. */
function targetKey(target: PieceTarget): string | null {
  if (target.kind === 'campus') return 'campus';
  if (target.kind !== 'floor' || target.building === null) return null;
  const floor = floorFromText(target.floorText);
  if (!Number.isFinite(floor)) return null;
  const building = 'id' in target.building ? target.building.id : `new:${target.building.newName.trim().toLowerCase()}`;
  return `${building}|${floor}`;
}

/** Проверка всех кусков разом: повторы видны только вместе. */
export function checkPieces(
  pieces: readonly Piece[],
  metas: ReadonlyMap<string, BuildingMeta>,
  planFiles: ReadonlyMap<string, string>
): Map<string, PieceCheck> {
  const counts = new Map<string, number>();
  for (const piece of pieces) {
    const key = targetKey(piece.target);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const result = new Map<string, PieceCheck>();
  for (const piece of pieces) {
    const { target } = piece;
    let problem: string | null = null;
    let note: string | null = null;
    const key = targetKey(target);

    if (target.kind === 'floor') {
      const floor = floorFromText(target.floorText);
      if (target.building === null) problem = 'Выберите корпус';
      else if ('newName' in target.building && target.building.newName.trim() === '') problem = 'Назовите новый корпус';
      else if (!Number.isFinite(floor)) problem = 'Укажите номер этажа: 1, 2, −1 для подвала, 1.5 для антресоли';
      else if (key && (counts.get(key) ?? 0) > 1) problem = 'На этот этаж выбран ещё один лист';
      else if ('id' in target.building) {
        const meta = metas.get(target.building.id);
        const exists = meta?.floors.some((item) => item.floor === floor);
        if (exists && piece.redo) {
          note = 'Точки этажа пересчитаются вместе с планом — совмещать не придётся';
        } else if (exists && planFiles.has(planScopeKey(target.building.id, floor))) {
          note = `У этажа ${floorLabel(meta, floor)} уже есть план — новый заменит его. Точки этажа сохранят прежние координаты: если масштаб нового плана другой, совместите их с планом после добавления`;
        } else if (exists) {
          note = `Этаж ${floorLabel(meta, floor)} уже есть — у него появится план`;
        }
      } else {
        note = `Будет новый корпус «${target.building.newName.trim()}»`;
      }
    } else if (target.kind === 'campus') {
      if ((counts.get('campus') ?? 0) > 1) problem = 'План территории выбран у двух листов';
      else if (piece.redo) note = 'Точки территории пересчитаются вместе с планом';
      else if (planFiles.has(planScopeKey(null, null))) note = 'План территории уже есть — новый заменит его';
    }

    result.set(piece.id, { problem, note });
  }
  return result;
}

/**
 * Итог словами — «3 плана этажей и план территории»: подходит и новым
 * этажам, и заменённым планам.
 */
export function importSummary(pieces: readonly Piece[]): string {
  const floors = pieces.filter((piece) => piece.target.kind === 'floor').length;
  const campus = pieces.some((piece) => piece.target.kind === 'campus');
  const parts: string[] = [];
  if (floors > 0) parts.push(`${floors} ${plural(floors, ['план', 'плана', 'планов'])} ${floors === 1 ? 'этажа' : 'этажей'}`);
  if (campus) parts.push('план территории');
  return parts.join(' и ');
}
