import { useEffect, useMemo, useReducer } from 'react';
import type { BuildingMeta } from '@campus-map/core';
import { useEditorStore } from '../stores/editorStore';
import { openingFloorOf } from '../stores/editor/viewSlice';
import { DATA_BASE_URL } from '../config/dataBase';
import { composeSimilarity, invertSimilarity } from '../import/planGeometry';
import type { Similarity } from '../import/planGeometry';
import { worldOf } from '../import/placementMath';
import { planSilhouette } from '../overlay/lineArtImage';
import { matchSilhouettes } from '../overlay/silhouetteMatch';
import { planScopeKey, planUrlOf } from '../utils/planFiles';
import { floorMatchKey } from '../utils/readiness';
import type { FloorMatch } from '../utils/readiness';

/** Сравнение одного этажа с этажом входа. */
interface MatchJob {
  key: string;
  /** Меняется вместе с планами и привязкой: старый ответ к новому не относится. */
  signature: string;
  baseUrl: string;
  floorUrl: string;
  baseSize?: { width: number; height: number };
  floorSize?: { width: number; height: number };
  toBase: Similarity;
}

/** Привязка без высоты — для сравнения планов высота не нужна. */
function framePlacement(meta: BuildingMeta, floor: BuildingMeta['floors'][number]) {
  const metersPerPixel = floor.placement?.metersPerPixel ?? meta.placement?.metersPerPixel;
  const originMeters = floor.placement?.originMeters ?? meta.placement?.originMeters;
  const rotationDeg = floor.placement?.rotationDeg ?? meta.placement?.rotationDeg;
  return metersPerPixel === undefined || originMeters === undefined || rotationDeg === undefined
    ? null
    : { metersPerPixel, originMeters, rotationDeg };
}

function matchJobs(
  metas: ReadonlyMap<string, BuildingMeta>,
  planFiles: ReadonlyMap<string, string>,
  diskHashes: Record<string, string>
): MatchJob[] {
  const jobs: MatchJob[] = [];
  for (const meta of metas.values()) {
    const entrance = openingFloorOf(meta);
    const base = meta.floors.find((item) => item.floor === entrance);
    const baseUrl = planUrlOf(planFiles.get(planScopeKey(meta.id, entrance)), diskHashes, DATA_BASE_URL);
    const basePlacement = base ? framePlacement(meta, base) : null;
    if (!base || !baseUrl || !basePlacement) continue;

    for (const floor of meta.floors) {
      if (floor.floor === entrance) continue;
      const floorUrl = planUrlOf(planFiles.get(planScopeKey(meta.id, floor.floor)), diskHashes, DATA_BASE_URL);
      const placement = framePlacement(meta, floor);
      if (!floorUrl || !placement) continue;
      // Пиксель этажа → метры → пиксель этажа входа, как при совмещении (запись 53).
      const toBase = composeSimilarity(invertSimilarity(worldOf(basePlacement)), worldOf(placement));
      jobs.push({
        key: floorMatchKey(meta.id, floor.floor),
        signature: `${baseUrl}|${floorUrl}|${toBase.a}|${toBase.b}|${toBase.tx}|${toBase.ty}`,
        baseUrl,
        floorUrl,
        baseSize: base.mapSize,
        floorSize: floor.mapSize,
        toBase,
      });
    }
  }
  return jobs;
}

// Ответы помнятся на всё время работы: одни и те же планы не сравниваются дважды.
const answers = new Map<string, FloorMatch>();
const running = new Set<string>();
const listeners = new Set<() => void>();

/** Сравнение ждёт, пока откроется редактор: карта рисуется первой. */
const START_DELAY_MS = 1500;

/**
 * Совпадают ли этажи корпусов с этажом входа (запись 67): силуэты зданий на
 * планах, перенесённые привязкой этажей. Считается в фоновом потоке по
 * уменьшенным картинкам; пока не посчитано — `pending`.
 */
export function useFloorMatches(): ReadonlyMap<string, FloorMatch> {
  const buildingMetas = useEditorStore((s) => s.buildingMetas);
  const planFiles = useEditorStore((s) => s.planFiles);
  const diskHashes = useEditorStore((s) => s.diskHashes);
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  const jobs = useMemo(() => matchJobs(buildingMetas, planFiles, diskHashes), [buildingMetas, planFiles, diskHashes]);

  useEffect(() => {
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (const job of jobs) {
        if (answers.has(job.signature) || running.has(job.signature)) continue;
        running.add(job.signature);
        Promise.all([planSilhouette(job.baseUrl, job.baseSize), planSilhouette(job.floorUrl, job.floorSize)])
          .then(([base, floor]): FloorMatch => matchSilhouettes(base, floor, job.toBase) ?? 'failed')
          .catch((): FloorMatch => 'failed')
          .then((answer) => {
            answers.set(job.signature, answer);
            running.delete(job.signature);
            for (const listener of listeners) listener();
          });
      }
    }, START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [jobs]);

  return useMemo(() => {
    // `version` меняется, когда приходит новый ответ.
    void version;
    return new Map<string, FloorMatch>(jobs.map((job) => [job.key, answers.get(job.signature) ?? 'pending']));
  }, [jobs, version]);
}
