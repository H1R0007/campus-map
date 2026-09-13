import { describe, expect, it } from 'vitest';
import { CAMPUS_BUILDING_ID, CAMPUS_FLOOR, loadDataset } from '../src/index.js';
import type { DatasetSource } from '../src/index.js';
import { createFsDatasetSource } from './helpers/realDataset.js';
import { loadSampleDataset } from './helpers/sampleDataset.js';

/**
 * Загрузка и нормализация датасета.
 *
 * Здесь проверяется контракт, на который опираются оба приложения: из
 * произвольного JSON получается строго типизированный `Dataset`, а
 * `building` и `floor` узла определяются путём файла, а не содержимым.
 */
describe('loadDataset', () => {
  it('загружает корректный датасет без предупреждений и без потерь', async () => {
    // Числа — из схемы синтетического кампуса в `helpers/sampleDataset.ts`.
    const { dataset, warnings } = await loadSampleDataset();

    expect(warnings).toEqual([]);
    expect(dataset.nodes.length).toBe(20);
    expect(dataset.buildingMetas.length).toBe(2);
    expect(dataset.transitions.length).toBe(4);
    expect(dataset.aliases.length).toBe(7);
  });

  it('проставляет узлам кампуса building и floor из расположения файла', async () => {
    const { dataset } = await loadSampleDataset();
    const campusNodes = dataset.nodes.filter((n) => n.building === CAMPUS_BUILDING_ID);

    expect(campusNodes.length).toBe(4);
    expect(campusNodes.every((n) => n.floor === CAMPUS_FLOOR)).toBe(true);
  });

  it('берёт building и floor узла корпуса из пути файла, а не из полей JSON', async () => {
    const { dataset } = await loadSampleDataset();
    const secondFloor = dataset.nodes.filter((n) => n.id.startsWith('a2_'));

    expect(secondFloor.length).toBeGreaterThan(0);
    expect(secondFloor.every((n) => n.building === 'building_a' && n.floor === 2)).toBe(true);
  });

  it('не оставляет в BuildingMeta поля bounds', async () => {
    const { dataset } = await loadSampleDataset();

    expect(dataset.buildingMetas.every((meta) => !('bounds' in meta))).toBe(true);
  });

  it('нормализует neighbors и isPortal даже когда поля отсутствуют в JSON', async () => {
    const source: DatasetSource = {
      async readJson(path) {
        switch (path) {
          case 'campus/meta.json':
            return { buildings: [], mapSize: { width: 10, height: 10 } };
          case 'campus/graph.json':
            return { nodes: [{ id: 'bare', x: 1, y: 2 }] };
          default:
            return null;
        }
      },
    };

    const { dataset } = await loadDataset(source);
    const node = dataset.nodes[0];

    expect(node.neighbors).toEqual([]);
    expect(node.isPortal).toBe(false);
    expect(node.building).toBe(CAMPUS_BUILDING_ID);
    expect(node.floor).toBe(CAMPUS_FLOOR);
  });

  it('сохраняет рабочую заметку разметчика', async () => {
    const source: DatasetSource = {
      async readJson(path) {
        switch (path) {
          case 'campus/meta.json':
            return { buildings: [], mapSize: { width: 10, height: 10 } };
          case 'campus/graph.json':
            return { nodes: [{ id: 'n1', x: 0, y: 0, comment: 'уточнить у коменданта' }] };
          default:
            return null;
        }
      },
    };

    const { dataset } = await loadDataset(source);

    expect(dataset.nodes[0].comment).toBe('уточнить у коменданта');
  });

  it('бросает понятную ошибку, если campus/meta.json отсутствует', async () => {
    const source: DatasetSource = { async readJson() { return null; } };

    await expect(loadDataset(source)).rejects.toThrow(/campus\/meta\.json/);
  });

  it('отличает «файла нет» от «файл не JSON»', async () => {
    // Отсутствующий transitions.json — норма: переходов может не быть.
    const missing = createFsDatasetSource();
    expect(await missing.readJson('transitions-absent.json')).toBeNull();

    // А вот битый JSON обязан упасть, а не молча стать пустым списком.
    const broken: DatasetSource = {
      async readJson(path) {
        if (path === 'campus/meta.json') return { buildings: [], mapSize: { width: 1, height: 1 } };
        if (path === 'campus/graph.json') return { nodes: [] };
        throw new Error('Некорректный JSON в transitions.json');
      },
    };

    await expect(loadDataset(broken)).rejects.toThrow(/Некорректный JSON/);
  });
});
