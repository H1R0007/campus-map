import { beforeEach, describe, expect, it } from 'vitest';
import { AliasManager, DEFAULT_PATHFINDING_OPTIONS } from '@campus-map/core';
import { useMapStore } from '../src/stores/mapStore';
import { useRouteStore } from '../src/stores/routeStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { fixtureGraph } from './helpers/graphFixture';

/**
 * Поведение стора маршрута.
 *
 * Главное, что здесь проверяется, — построенный маршрут действительно
 * показывается. Навигатор стартует в виде кампуса, где слой маршрута рисует
 * только узлы территории, поэтому маршрут между аудиториями отфильтровывался
 * целиком: пользователь видел неизменную карту и подпись «Маршрут готов».
 */

const ALIASES = [
  { id: 'a2_room201', names: ['А-201', '201'] },
  { id: 'campus_gate', names: ['Главный вход'], translations: { en: { names: ['Main gate'] } } },
  { id: 'a1_hall', names: ['Холл А'] },
];

function loadFixture(): void {
  const aliasManager = new AliasManager();
  aliasManager.load(ALIASES);

  useSettingsStore.setState({ language: 'ru' });

  useMapStore.setState({
    graph: fixtureGraph(),
    aliasManager,
    campusMeta: { buildings: [{ id: 'building_a', name: 'Корпус А' }], mapSize: { width: 1200, height: 800 } },
    buildingMetas: new Map([
      [
        'building_a',
        {
          id: 'building_a',
          name: 'Корпус А',
          floors: [{ floor: 1 }, { floor: 2 }],
        },
      ],
    ]),
    activeFloor: null,
    selectedNodeId: null,
  });

  useRouteStore.getState().clearRoute();

  // Ограничения тоже сбрасываются: `clearRoute` их не трогает, и запрет
  // лестниц из одного теста делал недостижимым второй этаж во всех следующих.
  useRouteStore.setState({ options: { ...DEFAULT_PATHFINDING_OPTIONS } });
}

beforeEach(loadFixture);

describe('построение маршрута', () => {
  it('переводит карту на этаж, где маршрут начинается', () => {
    const route = useRouteStore.getState();

    route.setQuery('from', 'Холл А');
    route.setQuery('to', 'А-201');
    route.buildRoute();

    expect(useRouteStore.getState().currentRoute?.found).toBe(true);

    // Стартовый узел — на первом этаже корпуса А, значит карта обязана
    // показывать именно его, а не территорию кампуса.
    expect(useMapStore.getState().activeFloor).toEqual({ buildingId: 'building_a', floor: 1 });
  });

  it('возвращает карту на территорию, если маршрут начинается на улице', () => {
    useMapStore.getState().setActiveFloor('building_a', 2);

    const route = useRouteStore.getState();
    route.setQuery('from', 'Главный вход');
    route.setQuery('to', 'А-201');
    route.buildRoute();

    expect(useRouteStore.getState().currentRoute?.found).toBe(true);
    expect(useMapStore.getState().activeFloor).toBeNull();
  });

  it('не трогает вид, если маршрут не найден', () => {
    useMapStore.getState().setActiveFloor('building_a', 2);

    const route = useRouteStore.getState();
    route.setQuery('from', 'Холл А');
    route.setQuery('to', 'нет такого места');
    route.buildRoute();

    expect(useRouteStore.getState().currentRoute).toBeNull();
    expect(useMapStore.getState().activeFloor).toEqual({ buildingId: 'building_a', floor: 2 });
  });
});

describe('устаревание маршрута', () => {
  it('снимает маршрут, когда точка назначения изменилась', () => {
    const route = useRouteStore.getState();

    route.setQuery('from', 'Холл А');
    route.setQuery('to', 'А-201');
    route.buildRoute();
    expect(useRouteStore.getState().currentRoute?.found).toBe(true);

    // Пользователь начал править поле «Куда»: показывать старую линию рядом с
    // новым текстом нельзя — карточка врала бы о том, что нарисовано.
    useRouteStore.getState().setQuery('to', 'А-2');
    expect(useRouteStore.getState().currentRoute).toBeNull();
  });

  it('сохраняет маршрут, пока точки те же', () => {
    const route = useRouteStore.getState();

    route.setQuery('from', 'Холл А');
    route.setQuery('to', 'А-201');
    route.buildRoute();

    // Другой алиас того же узла — маршрут остаётся верным.
    useRouteStore.getState().setQuery('to', '201');
    expect(useRouteStore.getState().currentRoute?.found).toBe(true);
  });
});

describe('ограничения маршрута', () => {
  it('не строит маршрут по своей инициативе при смене ограничений', () => {
    const route = useRouteStore.getState();

    route.setQuery('from', 'Холл А');
    route.setQuery('to', 'А-201');
    // «Построить» не нажимали.

    route.setOptions({ preferLift: true });

    expect(useRouteStore.getState().currentRoute).toBeNull();
  });

  it('пересчитывает уже показанный маршрут', () => {
    const route = useRouteStore.getState();

    route.setQuery('from', 'Холл А');
    route.setQuery('to', 'А-201');
    route.buildRoute();

    // Единственный путь наверх — лестница. Запрет делает цель недостижимой,
    // и об этом нужно сообщить сразу, а не оставлять прежний результат.
    useRouteStore.getState().setOptions({ allowStairs: false });

    expect(useRouteStore.getState().currentRoute?.found).toBe(false);
  });

  it('не уводит карту с открытого этажа, через который идёт пересчитанный маршрут', () => {
    useRouteStore.getState().setPoint('from', 'a1_hall');
    useRouteStore.getState().setPoint('to', 'a2_room201');
    // Человек рассматривает второй этаж маршрута, а карта открылась на первом.
    useMapStore.getState().setActiveFloor('building_a', 2);

    useRouteStore.getState().setOptions({ preferLift: true });

    expect(useRouteStore.getState().currentRoute?.found).toBe(true);
    expect(useMapStore.getState().activeFloor).toEqual({ buildingId: 'building_a', floor: 2 });
  });

  it('ведёт к началу, если пересчитанный маршрут через открытый вид не проходит', () => {
    useRouteStore.getState().setPoint('from', 'a1_hall');
    useRouteStore.getState().setPoint('to', 'campus_gate');
    useMapStore.getState().setActiveFloor('building_a', 2);

    useRouteStore.getState().setOptions({ preferLift: true });

    expect(useRouteStore.getState().currentRoute?.found).toBe(true);
    expect(useMapStore.getState().activeFloor).toEqual({ buildingId: 'building_a', floor: 1 });
  });
});

describe('точка маршрута узлом', () => {
  it('первая точка маршрут не строит, вторая — строит и показывает', () => {
    expect(useRouteStore.getState().setPoint('to', 'a2_room201')).toBeNull();
    expect(useRouteStore.getState().currentRoute).toBeNull();

    const route = useRouteStore.getState().setPoint('from', 'a1_hall');

    expect(route?.found).toBe(true);
    expect(useRouteStore.getState().currentRoute).toBe(route);
    expect(useMapStore.getState().activeFloor).toEqual({ buildingId: 'building_a', floor: 1 });
  });

  it('набор текста в поле маршрут по-прежнему не строит', () => {
    // Выбор точки — явное намерение, а промежуточный текст при наборе — нет.
    useRouteStore.getState().setQuery('from', 'Холл А');
    useRouteStore.getState().setQuery('to', 'А-201');

    expect(useRouteStore.getState().currentRoute).toBeNull();
  });

  it('подпись поля — имя узла на языке интерфейса', () => {
    useSettingsStore.setState({ language: 'en' });
    useRouteStore.getState().setPoint('from', 'campus_gate');
    expect(useRouteStore.getState().fromQuery).toBe('Main gate');

    // Узел без перевода подписывается исходным именем.
    useRouteStore.getState().setPoint('to', 'a1_hall');
    expect(useRouteStore.getState().toQuery).toBe('Холл А');
  });

  it('подпись поля не зависит от того, по какому имени место нашлось', () => {
    // Поиск находит «Main gate» и в русском интерфейсе, но поле получает имя
    // на языке интерфейса.
    useRouteStore.getState().setPoint('from', 'campus_gate');

    expect(useRouteStore.getState().fromQuery).toBe('Главный вход');
  });

  it('повторный выбор тех же точек не перестраивает показанный маршрут', () => {
    useRouteStore.getState().setPoint('from', 'a1_hall');
    const first = useRouteStore.getState().setPoint('to', 'a2_room201');

    expect(useRouteStore.getState().setPoint('to', 'a2_room201')).toBe(first);
  });
});
