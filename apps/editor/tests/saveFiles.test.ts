import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { datasetFromState } from '../src/stores/editor/graphState';
import { forgetHeldFiles, holdFile, loadedPlanFiles, planFilesByHash } from '../src/utils/planFiles';
import { planSave } from '../src/utils/saveFiles';
import type { SaveInput } from '../src/utils/saveFiles';
import { loadFixture, store } from './helpers/fixture';

/**
 * Что делает сохранение с файлами (запись 47): нетронутый план не трогает,
 * импортированный загружает, переехавший копирует, лишнее удаляет — но только
 * то, что редактор знал.
 */

const HASH_1 = '1'.repeat(40);
const HASH_2 = '2'.repeat(40);
const HASH_CAMPUS = 'c'.repeat(40);

/** Диск фикстуры: планы и файлы JSON, как их видит манифест. */
function disk(): Record<string, string> {
  return {
    'campus/map.svg': HASH_CAMPUS,
    'buildings/building_a/floors/1/map.svg': HASH_1,
    'buildings/building_a/floors/2/map.svg': HASH_2,
    'buildings/building_a/meta.json': 'm'.repeat(40),
    'buildings/building_a/floors/1/graph.json': 'g'.repeat(40),
    'buildings/building_a/floors/2/graph.json': 'h'.repeat(40),
  };
}

/** Состояние сразу после открытия из репозитория: планы — по отпечаткам. */
function opened(): SaveInput {
  const diskHashes = disk();
  const planFiles = planFilesByHash(store().planFiles, diskHashes);
  const input = { dataset: datasetFromState(store()), planFiles, diskHashes, diskSources: new Set<string>(), owned: new Set<string>() };
  // Знает редактор ровно то, что понял при открытии и что есть на диске.
  return { ...input, owned: new Set(planSave(input).produced.filter((path) => diskHashes[path] !== undefined)) };
}

function now(base: SaveInput): SaveInput {
  const s = store();
  return { ...base, dataset: datasetFromState(s), planFiles: s.planFiles };
}

beforeEach(() => {
  loadFixture();
  forgetHeldFiles();
  const input = opened();
  store().loadData(datasetFromState(store()), [], { planFiles: input.planFiles });
});

afterEach(() => forgetHeldFiles());

describe('план на месте', () => {
  it('нетронутые данные — ни одного плана в сохранении, ничего не удаляется', () => {
    const plan = planSave(opened());
    expect(Object.keys(plan.files).filter((path) => path.includes('/map.'))).toEqual([]);
    expect(plan.delete).toEqual([]);
    expect(plan.uploads).toEqual([]);
    expect(plan.lost).toEqual([]);
  });

  it('на диске нет плана этажа — у этажа нет плана, и сохранение его не требует', () => {
    const diskHashes = disk();
    delete diskHashes['buildings/building_a/floors/2/map.svg'];
    const loaded = loadedPlanFiles(store().campusMeta, store().buildingMetas.values());
    const planFiles = planFilesByHash(loaded, diskHashes);
    expect(planFiles.has('building_a/2')).toBe(false);
    expect(planFiles.get('building_a/1')).toBe(`sha1:${HASH_1}`);
  });
});

describe('импортированный план', () => {
  it('загружается и пишется по пути этажа, старый файл другого формата удаляется', async () => {
    const base = opened();
    const key = await holdFile(new Blob(['новый план']));
    store().setPlan('building_a', 1, { key, format: 'webp', mapSize: { width: 800, height: 400 } });

    const plan = planSave(now(base));
    expect(plan.uploads).toHaveLength(1);
    expect(plan.files['buildings/building_a/floors/1/map.webp']).toEqual({ upload: plan.uploads[0].sha256 });
    expect(plan.delete).toEqual(['buildings/building_a/floors/1/map.svg']);
    expect(plan.produced).toContain('buildings/building_a/floors/1/map.webp');
  });

  it('исходник, которого нет на диске, уходит вместе с планом', async () => {
    const base = opened();
    const pdf = new Blob(['%PDF присланный']);
    const key = await holdFile(pdf);
    const sourceKey = await holdFile(pdf);
    expect(sourceKey).toBe(key);
    const { sha256 } = (await import('../src/utils/planFiles')).heldFile(key)!;
    const name = `${sha256.slice(0, 16)}.pdf`;

    store().setPlan('building_a', 1, {
      key,
      format: 'png',
      mapSize: { width: 800, height: 400 },
      source: { file: name, pageSize: { width: 842, height: 595 } },
    });

    expect(planSave(now(base)).sources).toEqual({ [name]: { upload: sha256 } });
    expect(planSave({ ...now(base), diskSources: new Set([name]) }).sources).toEqual({});
  });
});

describe('переезд', () => {
  it('этаж сменил номер — план копируется со старого места, старое удаляется', () => {
    const base = opened();
    store().updateFloor('building_a', 2, { floor: 3 });

    const plan = planSave(now(base));
    expect(plan.files['buildings/building_a/floors/3/map.svg']).toEqual({ copy: 'buildings/building_a/floors/2/map.svg' });
    expect(plan.delete).toEqual(['buildings/building_a/floors/2/graph.json', 'buildings/building_a/floors/2/map.svg']);
    expect(plan.uploads).toEqual([]);
  });

  it('этажи поменялись номерами — оба плана копируются накрест, ничего не удаляется', () => {
    const base = opened();
    store().updateFloor('building_a', 2, { floor: 20 });
    store().updateFloor('building_a', 1, { floor: 2 });
    store().updateFloor('building_a', 20, { floor: 1 });

    const plan = planSave(now(base));
    expect(plan.files['buildings/building_a/floors/1/map.svg']).toEqual({ copy: 'buildings/building_a/floors/2/map.svg' });
    expect(plan.files['buildings/building_a/floors/2/map.svg']).toEqual({ copy: 'buildings/building_a/floors/1/map.svg' });
    expect(plan.delete).toEqual([]);
  });
});

describe('удаление', () => {
  it('удалённый этаж — его план и граф удаляются', () => {
    const base = opened();
    store().deleteFloor('building_a', 2);
    expect(planSave(now(base)).delete).toEqual([
      'buildings/building_a/floors/2/graph.json',
      'buildings/building_a/floors/2/map.svg',
    ]);
  });

  it('файл, которого редактор не знал, не удаляется', () => {
    const base = opened();
    store().deleteFloor('building_a', 2);
    const plan = planSave({ ...now(base), owned: new Set(['buildings/building_a/floors/1/graph.json']) });
    expect(plan.delete).toEqual([]);
  });

  it('отмена удаления после сохранения находит план на диске по отпечатку', () => {
    const base = opened();
    store().updateFloor('building_a', 2, { floor: 3 });
    // Сохранили: план этажа лежит уже по новому пути.
    const diskHashes: Record<string, string> = { ...base.diskHashes, 'buildings/building_a/floors/3/map.svg': HASH_2 };
    delete diskHashes['buildings/building_a/floors/2/map.svg'];
    store().undo();

    const plan = planSave({ ...now(base), diskHashes });
    expect(plan.files['buildings/building_a/floors/2/map.svg']).toEqual({ copy: 'buildings/building_a/floors/3/map.svg' });
    expect(plan.lost).toEqual([]);
  });

  it('план, которого нет ни на диске, ни в памяти, — сохранение не идёт', () => {
    const base = opened();
    store().updateFloor('building_a', 2, { floor: 3 });
    const diskHashes = { ...base.diskHashes };
    delete diskHashes['buildings/building_a/floors/2/map.svg'];

    expect(planSave({ ...now(base), diskHashes }).lost).toEqual(['buildings/building_a/floors/3/map.svg']);
  });
});
