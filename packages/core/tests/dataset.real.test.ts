import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Graph, PHOTOS_DIR, findConnectedComponents, photoPath } from '../src/index.js';
import { DATA_DIR, loadRealDataset } from './helpers/realDataset.js';

/** Пометка тестовой картинки в PNG — `TEST_PHOTO_MARK` из `tooling/lib/test-photos.mjs`. */
const TEST_PHOTO_MARK = Buffer.from('tEXtcampus-map\0test-photo', 'latin1');

/**
 * Инварианты продуктового `data/`.
 *
 * Единственное место, где тесты ядра читают реальные данные (кроме проверки
 * согласованности эвристики на их топологии). Количества здесь не проверяются:
 * их меняет каждая правка разметки, и тест с числами ломался бы от работы, ради
 * которой существует редактор. Проверяется то, без чего навигатор не работает
 * при любом объёме данных.
 */
describe('data/', () => {
  it('загружается без предупреждений', async () => {
    const { dataset, warnings } = await loadRealDataset();

    expect(warnings).toEqual([]);
    // Пустой датасет прошёл бы все остальные проверки.
    expect(dataset.nodes.length).toBeGreaterThan(0);
  });

  it('связен: из любой точки можно дойти до любой другой', async () => {
    const { dataset } = await loadRealDataset();
    const result = findConnectedComponents(Graph.fromDataset(dataset));

    expect(result.isolatedNodeIds).toEqual([]);
    expect(result.connected).toBe(true);
  });

  it('каждое название ведёт к существующему узлу', async () => {
    // Загрузчик алиасы с узлами не сверяет: название висячего узла нашлось бы
    // в поиске, а маршрут к нему — нет.
    const { dataset } = await loadRealDataset();
    const graph = Graph.fromDataset(dataset);

    expect(dataset.aliases.map((entry) => entry.id).filter((id) => !graph.hasNode(id))).toEqual([]);
  });

  it('у каждого фото точки есть оба файла — полный и маленький', async () => {
    const { dataset } = await loadRealDataset();
    const missing = dataset.nodes
      .flatMap((node) => node.photos ?? [])
      .flatMap((photo) => [photoPath(photo.file), photoPath(photo.file, 'small')])
      .filter((relative) => !existsSync(path.join(DATA_DIR, relative)));

    expect(missing).toEqual([]);
  });

  it('в data/photos — только тестовые картинки, на которые ссылаются точки (запись 85)', async () => {
    // Репозиторий публичный: настоящее фото вуза, сохранённое редактором в
    // data/ по ошибке, не должно доехать до git. Тестовая картинка помечена
    // генератором в самом файле (`tooling/lib/test-photos.mjs`).
    const { dataset } = await loadRealDataset();
    const referenced = new Set(
      dataset.nodes
        .flatMap((node) => node.photos ?? [])
        .flatMap((photo) => [photoPath(photo.file), photoPath(photo.file, 'small')])
        .map((relative) => path.basename(relative))
    );
    const directory = path.join(DATA_DIR, PHOTOS_DIR);
    const files = existsSync(directory) ? readdirSync(directory) : [];

    const foreign = files.filter((name) => !readFileSync(path.join(directory, name)).includes(TEST_PHOTO_MARK));
    expect(
      foreign,
      'в data/photos лежит не тестовая картинка. Настоящие фото — в общей папке фото (CAMPUS_PHOTOS_DIR), не в репозитории'
    ).toEqual([]);
    expect(files.filter((name) => !referenced.has(name)), 'картинка, на которую не ссылается ни одна точка').toEqual([]);
  });

  it('имя фото — отпечаток его содержимого', async () => {
    const { dataset } = await loadRealDataset();
    const wrong = dataset.nodes
      .flatMap((node) => node.photos ?? [])
      .filter((photo) => {
        const content = readFileSync(path.join(DATA_DIR, photoPath(photo.file)));
        return !photo.file.startsWith(createHash('sha256').update(content).digest('hex').slice(0, 16));
      })
      .map((photo) => photo.file);

    expect(wrong).toEqual([]);
  });

  it('категория есть только у места с названием', async () => {
    // Безымянное место быстрая кнопка навигатора не может ни назвать, ни
    // выбрать: `AliasManager` такую категорию не учитывает, и она молча не работала бы.
    const { dataset } = await loadRealDataset();

    expect(dataset.aliases.filter((entry) => entry.category !== undefined && (entry.names?.length ?? 0) === 0)).toEqual([]);
  });
});
