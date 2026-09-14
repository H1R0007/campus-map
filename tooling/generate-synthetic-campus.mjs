#!/usr/bin/env node
/**
 * Синтетический кампус целевого объёма.
 *
 * Навигатор и редактор строятся под 5+ корпусов, до 11 этажей и тысячи
 * помещений, а в `data/` — три корпуса и шесть этажей. Поведение на целевом
 * объёме (панель этажей, поиск, загрузка) иначе не увидеть. Генератор пишет
 * такой датасет в отдельный каталог, а приложения подхватывают его через
 * `CAMPUS_DATA_DIR`, не трогая канонический `data/`:
 *
 *   node tooling/generate-synthetic-campus.mjs --out .local/campus-5x11
 *
 * Путь для `CAMPUS_DATA_DIR` генератор печатает абсолютным: Vite разрешает
 * относительный от каталога приложения, а не от корня репозитория.
 *
 * Что есть в наборе: подвалы и явный входной этаж; две лестницы и лифт через
 * все этажи; переходы между соседними корпусами на втором этаже; «Столовая» и
 * «Деканат» в каждом корпусе (одноимённые помещения); номера «А-305» и
 * английские переводы. Планы — SVG, нарисованные по тому же описанию этажа,
 * что и граф (`lib/floor-layout.mjs`, запись 30): узлы всегда в своих
 * помещениях. С `--metric` планы привязаны к метрике кампуса.
 *
 * Готовый набор загружается ядром и проверяется так же, как `data/` в тестах:
 * без предупреждений и связным. Иначе генератор завершается с ошибкой.
 *
 * Параметры:
 *   --out <каталог>    куда писать; обязателен, не внутри data/
 *   --buildings <n>    корпусов, по умолчанию 5 (1–10)
 *   --floors <n>       надземных этажей, по умолчанию 11
 *   --basements <n>    подземных этажей, по умолчанию 1
 *   --rooms <n>        аудиторий на этаже, по умолчанию 24
 *   --metric           привязать планы к метрике кампуса
 *   --force            перезаписать непустой каталог
 */

import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALIASES_PATH,
  CAMPUS_GRAPH_PATH,
  CAMPUS_META_PATH,
  DATA_ROOT,
  Graph,
  TRANSITIONS_PATH,
  buildingMetaPath,
  campusMapPath,
  findConnectedComponents,
  floorGraphPath,
  floorMapPath,
  loadDataset,
} from '@campus-map/core';
import { PLAN_METERS_PER_PIXEL, layoutFloor, toWorld } from './lib/floor-layout.mjs';
import { floorPlanSvg } from './lib/plan-svg.mjs';
import { campusPlanSvg, graphWalkways } from './lib/campus-svg.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonicalDataDir = path.join(repoRoot, DATA_ROOT);

/**
 * Буквы корпусов: часть id, буква на табличке и её латинская транслитерация.
 *
 * Английский номер пишется транслитерацией: «B-201» для корпуса Б. Поиск
 * сворачивает только латинские двойники кириллицы (A, E, K, M…), и без
 * перевода иностранный студент номер корпуса Б латиницей не набрал бы.
 */
const LETTERS = [
  { id: 'a', cyrillic: 'А', latin: 'A' },
  { id: 'b', cyrillic: 'Б', latin: 'B' },
  { id: 'v', cyrillic: 'В', latin: 'V' },
  { id: 'g', cyrillic: 'Г', latin: 'G' },
  { id: 'd', cyrillic: 'Д', latin: 'D' },
  { id: 'e', cyrillic: 'Е', latin: 'E' },
  { id: 'k', cyrillic: 'К', latin: 'K' },
  { id: 'l', cyrillic: 'Л', latin: 'L' },
  { id: 'm', cyrillic: 'М', latin: 'M' },
  { id: 'n', cyrillic: 'Н', latin: 'N' },
];

/** Масштаб плана территории, метров на пиксель; планы этажей — `PLAN_METERS_PER_PIXEL`. */
const CAMPUS_METERS_PER_PIXEL = 0.5;
const BASE_ELEVATION_METERS = 0.5;
const FLOOR_HEIGHT_METERS = 3.6;

/** Этаж, метры: аудитория, лестница, лифт, холл; глубина корпуса и коридор. */
const ROOM_WIDTH = 8;
const STAIRS_WIDTH = 6;
const LIFT_WIDTH = 4;
const HALL_WIDTH = 10;
const BUILDING_DEPTH = 26;
const CORRIDOR = { y: 11.5, height: 3 };

/** Территория, метры: поля, длина перехода между корпусами, ряд корпусов и аллея. */
const CAMPUS_MARGIN = 30;
const CAMPUS_DEPTH = 170;
const BUILDING_GAP = 18;
const BUILDINGS_Y = 40;
const ALLEY_Y = BUILDINGS_Y + BUILDING_DEPTH + 12;
/** Точка входа территории — снаружи двери корпуса. */
const ENTRANCE_OUTSIDE = 1.5;

function parseArgs(argv) {
  const options = { out: null, buildings: 5, floors: 11, basements: 1, rooms: 24, metric: false, force: false };

  const integer = (flag, value, min, max) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) {
      throw new Error(`${flag} ждёт целое от ${min} до ${max}, получено: ${value}`);
    }
    return n;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--out') options.out = argv[++i];
    else if (flag === '--buildings') options.buildings = integer(flag, argv[++i], 1, LETTERS.length);
    else if (flag === '--floors') options.floors = integer(flag, argv[++i], 1, 30);
    else if (flag === '--basements') options.basements = integer(flag, argv[++i], 0, 5);
    else if (flag === '--rooms') options.rooms = integer(flag, argv[++i], 2, 200);
    else if (flag === '--metric') options.metric = true;
    else if (flag === '--force') options.force = true;
    else throw new Error(`Неизвестный аргумент: ${flag}`);
  }

  if (!options.out) throw new Error('Нужен --out <каталог>');

  return options;
}

/**
 * Готовит каталог вывода.
 *
 * Внутрь `data/` генератор не пишет, в ссылку тоже: на Windows junction
 * выглядит ссылкой, и перезапись содержимого прошла бы по ней в чужой
 * каталог: `rm -rf` в Git Bash именно так уничтожает настоящие данные (запись 4
 * в DECISIONS.md).
 */
function prepareOutput(outDir, force) {
  const relative = path.relative(canonicalDataDir, outDir);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error(`${outDir} — внутри канонического ${DATA_ROOT}/, туда генератор не пишет`);
  }

  if (existsSync(outDir)) {
    if (lstatSync(outDir).isSymbolicLink()) {
      throw new Error(`${outDir} — ссылка или junction, генератор в неё не пишет`);
    }
    if (readdirSync(outDir).length > 0) {
      if (!force) throw new Error(`Каталог ${outDir} не пуст — добавьте --force, чтобы перезаписать`);
      rmSync(outDir, { recursive: true });
    }
  }

  mkdirSync(outDir, { recursive: true });
}

function writeText(outDir, relativePath, text) {
  const file = path.join(outDir, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

const writeJson = (outDir, relativePath, value) => writeText(outDir, relativePath, `${JSON.stringify(value, null, 2)}\n`);

/** Номера этажей по возрастанию, без нулевого: подвалы отрицательные. */
function floorNumbers(floors, basements) {
  const result = [];
  for (let floor = -basements; floor <= floors; floor += 1) {
    if (floor !== 0) result.push(floor);
  }
  return result;
}

/** Номер аудитории: «А-305», «А-1105»; в подвале — «А-0105». */
function roomCode(letter, floor, index) {
  const number = String(index + 1).padStart(2, '0');
  return floor > 0
    ? `${letter}-${floor}${number}`
    : `${letter}-0${-floor}${number}`;
}

/**
 * Ширина корпуса, метры: одна на все этажи — лестницы, лифт и переходы стоят
 * друг над другом.
 */
function buildingWidth(rooms) {
  const north = Math.ceil(rooms / 2) * ROOM_WIDTH + LIFT_WIDTH;
  const south = Math.floor(rooms / 2) * ROOM_WIDTH + HALL_WIDTH;
  return 2 * STAIRS_WIDTH + Math.max(north, south);
}

/**
 * Описание этажа для `layoutFloor`: коридор вдоль корпуса, аудитории по обе
 * стороны, лестницы в торцах северной стороны, лифт посередине. На первом
 * этаже — холл со входом, на втором — переходы в соседние корпуса через торцы
 * коридора.
 */
function buildFloor({ letter, floor, rooms, width, hasWestBridge, hasEastBridge }) {
  const prefix = `${letter.id}_f${floor}`;
  const aliases = [];
  const labels = new Map();
  const layout = [];
  const cursor = { n: 0, s: 0 };
  const place = (side, size, room = { kind: 'service' }) => {
    layout.push({ ...room, side, from: cursor[side], to: cursor[side] + size });
    cursor[side] += size;
  };
  const middle = Math.floor(Math.ceil(rooms / 2) / 2);

  place('n', STAIRS_WIDTH, { id: `${prefix}_stairs_west`, kind: 'stairs' });
  place('s', STAIRS_WIDTH);
  for (let i = 0; i < rooms; i += 1) {
    const side = i % 2 === 0 ? 'n' : 's';
    const column = Math.floor(i / 2);
    if (column === middle && side === 'n') place('n', LIFT_WIDTH, { id: `${prefix}_lift`, kind: 'lift' });
    if (column === middle && side === 's') {
      place('s', HALL_WIDTH, floor === 1 ? { id: `${prefix}_hall`, kind: 'hall' } : undefined);
    }

    const id = `${prefix}_room${i + 1}`;
    const kind = i === 0 && floor === 1 ? 'canteen' : i === 0 && floor === 2 ? 'dean' : 'room';
    place(side, ROOM_WIDTH, { id, kind });

    const code = roomCode(letter.cyrillic, floor, i);
    labels.set(id, { code });
    aliases.push(roomAlias(id, letter, floor, i, code, roomCode(letter.latin, floor, i)));
  }
  for (const side of ['n', 's']) {
    if (cursor[side] < width - STAIRS_WIDTH) place(side, width - STAIRS_WIDTH - cursor[side]);
  }
  place('n', STAIRS_WIDTH, { id: `${prefix}_stairs_east`, kind: 'stairs' });
  place('s', STAIRS_WIDTH);

  const entrances = [];
  if (floor === 1) {
    entrances.push({ id: `${prefix}_entrance`, hall: `${prefix}_hall` });
    aliases.push({
      id: `${prefix}_entrance`,
      names: [`Вход в корпус ${letter.cyrillic}`],
      translations: { en: { names: [`Building ${letter.latin} entrance`] } },
    });
  }

  const ends = [];
  if (hasWestBridge) ends.push({ id: `${prefix}_bridge_west`, end: 'west', kind: 'bridge' });
  if (hasEastBridge) ends.push({ id: `${prefix}_bridge_east`, end: 'east', kind: 'bridge' });

  const { size, nodes, geometry } = layoutFloor({
    prefix,
    width,
    depth: BUILDING_DEPTH,
    corridor: CORRIDOR,
    rooms: layout,
    entrances,
    ends,
  });

  return { size, nodes, geometry, labels, aliases };
}

/**
 * Алиас аудитории. Первая аудитория первых этажей получает название —
 * одинаковое во всех корпусах, чтобы в наборе были одноимённые помещения.
 */
function roomAlias(id, letter, floor, index, code, latinCode) {
  const englishCodes = latinCode === code ? [] : [latinCode];

  if (index === 0 && floor === 1) {
    return {
      id,
      names: ['Столовая', code],
      translations: { en: { names: ['Canteen', ...englishCodes] } },
    };
  }
  if (index === 0 && floor === 2) {
    return {
      id,
      names: [`Деканат корпуса ${letter.cyrillic}`, 'Деканат', code],
      translations: { en: { names: [`Dean's office, Building ${letter.latin}`, ...englishCodes] } },
    };
  }

  return englishCodes.length > 0
    ? { id, names: [code], translations: { en: { names: englishCodes } } }
    : { id, names: [code] };
}

/**
 * Территория: корпуса в ряд вдоль аллеи, площадь и ворота к югу. Между
 * корпусами — длина перехода, поэтому мост второго этажа прямой.
 */
function campusLayout(letters, width) {
  const campusWidth = 2 * CAMPUS_MARGIN + letters.length * width + (letters.length - 1) * BUILDING_GAP;
  return {
    width: campusWidth,
    depth: CAMPUS_DEPTH,
    origins: letters.map((_, index) => ({ x: CAMPUS_MARGIN + index * (width + BUILDING_GAP), y: BUILDINGS_Y })),
  };
}

/** Узлы территории по точкам входов корпусов (метры кампуса). */
function buildCampus(letters, layout, entrances) {
  const nodes = new Map();
  const add = (id, point, isPortal = false) => {
    nodes.set(id, {
      id,
      x: Math.round(point.x / CAMPUS_METERS_PER_PIXEL),
      y: Math.round(point.y / CAMPUS_METERS_PER_PIXEL),
      neighbors: [],
      isPortal,
    });
    return id;
  };
  const link = (a, b) => {
    nodes.get(a).neighbors.push(b);
    nodes.get(b).neighbors.push(a);
  };

  const center = layout.width / 2;
  const gate = add('campus_gate', { x: center, y: layout.depth - 10 });
  const square = add('campus_square', { x: center, y: layout.depth - 50 });
  const stop = add('campus_bus_stop', { x: layout.width - 20, y: layout.depth - 10 });
  link(gate, square);
  link(gate, stop);

  const paths = letters.map((letter) => {
    const door = entrances.get(letter.id);
    const pathNode = add(`campus_path_${letter.id}`, { x: door.x, y: ALLEY_Y });
    link(pathNode, add(`campus_entrance_${letter.id}`, door, true));
    return pathNode;
  });
  for (let i = 1; i < paths.length; i += 1) link(paths[i - 1], paths[i]);
  const nearest = paths.reduce((best, id) =>
    Math.abs(nodes.get(id).x * CAMPUS_METERS_PER_PIXEL - center) < Math.abs(nodes.get(best).x * CAMPUS_METERS_PER_PIXEL - center) ? id : best
  );
  link(square, nearest);

  const aliases = [
    {
      id: gate,
      names: ['Главный вход', 'Проходная'],
      translations: { en: { names: ['Main entrance', 'Checkpoint'] } },
    },
    { id: square, names: ['Площадь'], translations: { en: { names: ['Main square'] } } },
    { id: stop, names: ['Остановка'], translations: { en: { names: ['Bus stop'] } } },
  ];

  return { nodes: [...nodes.values()], aliases };
}

function generate(options, outDir) {
  const letters = LETTERS.slice(0, options.buildings);
  const floors = floorNumbers(options.floors, options.basements);
  const width = buildingWidth(options.rooms);
  const layout = campusLayout(letters, width);

  const aliases = [];
  const transitions = [];
  const transition = (from, to, type) =>
    transitions.push({ from: { node: from }, to: { node: to }, transition_type: type });
  const entrances = new Map();
  const roofs = [];
  const bridges = [];

  letters.forEach((letter, buildingIndex) => {
    const buildingId = `building_${letter.id}`;
    // Без `--metric` привязка в данные не попадает: по ней только ставятся
    // входы территории и крыши на плане кампуса.
    const placement = {
      metersPerPixel: PLAN_METERS_PER_PIXEL,
      originMeters: layout.origins[buildingIndex],
      rotationDeg: 0,
      baseElevationMeters: BASE_ELEVATION_METERS,
      floorHeightMeters: FLOOR_HEIGHT_METERS,
    };
    const floorMetas = [];

    for (const floor of floors) {
      const built = buildFloor({
        letter,
        floor,
        rooms: options.rooms,
        width,
        hasWestBridge: floor === 2 && buildingIndex > 0,
        hasEastBridge: floor === 2 && buildingIndex < letters.length - 1,
      });

      writeJson(outDir, floorGraphPath(buildingId, floor), { nodes: built.nodes });
      writeText(outDir, floorMapPath(buildingId, floor, 'svg'), floorPlanSvg(built.geometry, built.labels));
      aliases.push(...built.aliases);

      for (const entrance of built.geometry.entrances) {
        entrances.set(letter.id, toWorld(placement, entrance.door.x, entrance.door.y + ENTRANCE_OUTSIDE));
      }

      // Нумерация без нулевого этажа: формула корпуса дала бы подвалу отметку
      // на два этажа ниже первого, поэтому отметка подвала задаётся явно.
      floorMetas.push({
        floor,
        mapSize: built.size,
        planFormat: 'svg',
        ...(options.metric && floor < 0
          ? { elevationMeters: BASE_ELEVATION_METERS + floor * FLOOR_HEIGHT_METERS }
          : {}),
      });
    }

    for (let i = 1; i < floors.length; i += 1) {
      const lower = `${letter.id}_f${floors[i - 1]}`;
      const upper = `${letter.id}_f${floors[i]}`;
      transition(`${lower}_stairs_west`, `${upper}_stairs_west`, 'stairs');
      transition(`${lower}_stairs_east`, `${upper}_stairs_east`, 'stairs');
      transition(`${lower}_lift`, `${upper}_lift`, 'lift');
    }

    transition(`campus_entrance_${letter.id}`, `${letter.id}_f1_entrance`, 'entrance');
    if (buildingIndex < letters.length - 1 && options.floors >= 2) {
      transition(`${letter.id}_f2_bridge_east`, `${letters[buildingIndex + 1].id}_f2_bridge_west`, 'bridge');
    }

    roofs.push({
      corners: [
        [0, 0],
        [width, 0],
        [width, BUILDING_DEPTH],
        [0, BUILDING_DEPTH],
      ].map(([x, y]) => toWorld(placement, x, y)),
      label: letter.cyrillic,
    });
    if (buildingIndex < letters.length - 1 && options.floors >= 2) {
      const y = placement.originMeters.y + CORRIDOR.y + CORRIDOR.height / 2;
      const from = placement.originMeters.x + width;
      const to = from + BUILDING_GAP;
      bridges.push({
        corners: [
          { x: from, y: y - CORRIDOR.height / 2 },
          { x: to, y: y - CORRIDOR.height / 2 },
          { x: to, y: y + CORRIDOR.height / 2 },
          { x: from, y: y + CORRIDOR.height / 2 },
        ],
      });
    }

    writeJson(outDir, buildingMetaPath(buildingId), {
      id: buildingId,
      name: `Корпус ${letter.cyrillic}`,
      translations: { en: { name: `Building ${letter.latin}` } },
      entranceFloor: 1,
      ...(options.metric ? { placement } : {}),
      floors: floorMetas,
    });
  });

  const campus = buildCampus(letters, layout, entrances);

  writeJson(outDir, CAMPUS_META_PATH, {
    buildings: letters.map((letter) => ({ id: `building_${letter.id}`, name: `Корпус ${letter.cyrillic}` })),
    mapSize: {
      width: Math.round(layout.width / CAMPUS_METERS_PER_PIXEL),
      height: Math.round(layout.depth / CAMPUS_METERS_PER_PIXEL),
    },
    planFormat: 'svg',
    ...(options.metric ? { metersPerPixel: CAMPUS_METERS_PER_PIXEL } : {}),
  });
  writeJson(outDir, CAMPUS_GRAPH_PATH, { nodes: campus.nodes });
  writeText(
    outDir,
    campusMapPath('svg'),
    campusPlanSvg({
      width: layout.width,
      depth: layout.depth,
      metersPerPixel: CAMPUS_METERS_PER_PIXEL,
      street: { y: layout.depth - 6, height: 6 },
      walkways: graphWalkways(campus.nodes, CAMPUS_METERS_PER_PIXEL),
      square: { x: layout.width / 2, y: layout.depth - 50, radius: 11 },
      parking: { x: 4, y: layout.depth - 40, width: 30, height: 22 },
      busStop: { x: layout.width - 20, y: layout.depth - 10 },
      buildings: roofs,
      bridges,
    })
  );
  writeJson(outDir, TRANSITIONS_PATH, { transitions });
  writeJson(outDir, ALIASES_PATH, { aliases: [...campus.aliases, ...aliases] });
}

/** Загружает набор тем же ядром, что и приложения, и проверяет инварианты `data/`. */
async function verify(outDir) {
  const source = {
    async readJson(relativePath) {
      const file = path.join(outDir, relativePath);
      return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    },
  };

  const { dataset, warnings } = await loadDataset(source);
  const graph = Graph.fromDataset(dataset);
  const { connected, components } = findConnectedComponents(graph);

  const floorCount = dataset.buildingMetas.reduce((sum, meta) => sum + meta.floors.length, 0);
  process.stdout.write(
    `\nНабор: корпусов ${dataset.buildingMetas.length}, этажей ${floorCount}, ` +
      `узлов ${graph.nodeCount}, переходов ${graph.transitionCount}, ` +
      `помещений с названием ${dataset.aliases.length}, режим ${graph.isMetric ? 'метрический' : 'пиксельный'}\n`
  );

  for (const warning of warnings) process.stdout.write(`  ПРЕДУПРЕЖДЕНИЕ  ${warning}\n`);
  if (!connected) process.stdout.write(`  НЕСВЯЗЕН: компонент ${components.length}\n`);

  return warnings.length === 0 && connected;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(repoRoot, options.out);

  prepareOutput(outDir, options.force);
  generate(options, outDir);

  if (!(await verify(outDir))) {
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `\nГотово: ${outDir}\n` +
      `  PowerShell: $env:CAMPUS_DATA_DIR = '${outDir}'\n` +
      `  bash:       CAMPUS_DATA_DIR='${outDir}'\n`
  );
}

main().catch((cause) => {
  process.stderr.write(`\nНабор не создан: ${cause?.message ?? cause}\n`);
  process.exitCode = 1;
});
