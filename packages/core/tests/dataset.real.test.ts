import { describe, expect, it } from 'vitest';
import { Graph, findConnectedComponents } from '../src/index.js';
import { loadRealDataset } from './helpers/realDataset.js';

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

  it('категория есть только у места с названием', async () => {
    // Безымянное место быстрая кнопка навигатора не может ни назвать, ни
    // выбрать: `AliasManager` такую категорию не учитывает, и она молча не работала бы.
    const { dataset } = await loadRealDataset();

    expect(dataset.aliases.filter((entry) => entry.category !== undefined && (entry.names?.length ?? 0) === 0)).toEqual([]);
  });
});
