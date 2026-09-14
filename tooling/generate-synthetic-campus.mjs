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
 * английские переводы. Планы — копии заглушек из `data/`, координаты узлов
 * считаются долями размера каждой картинки, поэтому всегда лежат на плане.
 * С `--metric` планы привязаны к метрике кампуса.
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

import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

/** Масштабы привязки `--metric`: территория и планы корпусов, метров на пиксель. */
const CAMPUS_METERS_PER_PIXEL = 0.25;
const PLAN_METERS_PER_PIXEL = 0.05;
const BASE_ELEVATION_METERS = 0.5;
const FLOOR_HEIGHT_METERS = 3.6;

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

/** Размер PNG из заголовка IHDR: сигнатура (8 байт), длина и тип чанка, ширина, высота. */
function pngSize(file) {
  const bytes = readFileSync(file);
  if (bytes.length < 24 || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`Не PNG: ${file}`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Планы этажей из `data/` — заглушки, которые набор использует по кругу. */
function placeholderPlans() {
  const plans = [];
  const buildingsDir = path.join(canonicalDataDir, 'buildings');

  for (const building of readdirSync(buildingsDir).sort()) {
    const floorsDir = path.join(buildingsDir, building, 'floors');
    if (!existsSync(floorsDir)) continue;

    for (const floor of readdirSync(floorsDir).sort()) {
      const file = path.join(floorsDir, floor, 'map.png');
      if (existsSync(file)) plans.push({ file, size: pngSize(file) });
    }
  }

  if (plans.length === 0) throw new Error(`В ${buildingsDir} нет ни одного плана этажа`);
  return plans;
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

function writeJson(outDir, relativePath, value) {
  const file = path.join(outDir, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function copyFile(outDir, relativePath, source) {
  const file = path.join(outDir, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  copyFileSync(source, file);
}

/**
 * Узлы одного плана с рёбрами в обе стороны.
 *
 * Координаты задаются долями размера плана: заглушки разного размера, и
 * абсолютные пиксели увели бы узлы за край картинки.
 */
function createPlan(size) {
  const nodes = new Map();

  return {
    nodes,
    add(id, fx, fy, isPortal = false) {
      nodes.set(id, {
        id,
        x: Math.round(fx * size.width),
        y: Math.round(fy * size.height),
        neighbors: [],
        isPortal,
      });
      return id;
    },
    link(a, b) {
      nodes.get(a).neighbors.push(b);
      nodes.get(b).neighbors.push(a);
    },
  };
}

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
 * Этаж: коридор вдоль плана, аудитории по обе стороны, лестницы по концам,
 * лифт посередине. На первом этаже — вход, на втором — переходы в соседние
 * корпуса.
 */
function buildFloor({ letter, floor, size, rooms, hasWestBridge, hasEastBridge }) {
  const plan = createPlan(size);
  const prefix = `${letter.id}_f${floor}`;
  const aliases = [];

  const corridorCount = Math.ceil(rooms / 2);
  const corridor = [];
  for (let i = 0; i < corridorCount; i += 1) {
    const fx = 0.15 + (0.7 * i) / Math.max(1, corridorCount - 1);
    corridor.push(plan.add(`${prefix}_corridor${i + 1}`, fx, 0.5));
    if (i > 0) plan.link(corridor[i - 1], corridor[i]);
  }
  const first = corridor[0];
  const last = corridor[corridor.length - 1];
  const middle = corridor[Math.floor(corridor.length / 2)];

  plan.link(plan.add(`${prefix}_stairs_west`, 0.06, 0.5, true), first);
  plan.link(plan.add(`${prefix}_stairs_east`, 0.94, 0.5, true), last);
  plan.link(plan.add(`${prefix}_lift`, plan.nodes.get(middle).x / size.width, 0.4, true), middle);

  for (let i = 0; i < rooms; i += 1) {
    const anchor = plan.nodes.get(corridor[Math.floor(i / 2)]);
    const id = plan.add(`${prefix}_room${i + 1}`, anchor.x / size.width, i % 2 === 0 ? 0.25 : 0.75);
    plan.link(id, anchor.id);

    const code = roomCode(letter.cyrillic, floor, i);
    const latinCode = roomCode(letter.latin, floor, i);
    aliases.push(roomAlias(id, letter, floor, i, code, latinCode));
  }

  if (floor === 1) {
    const entrance = plan.add(`${prefix}_entrance`, 0.3, 0.92, true);
    plan.link(entrance, corridor[Math.floor(corridor.length / 4)]);
    aliases.push({
      id: entrance,
      names: [`Вход в корпус ${letter.cyrillic}`],
      translations: { en: { names: [`Building ${letter.latin} entrance`] } },
    });
  }

  if (hasWestBridge) plan.link(plan.add(`${prefix}_bridge_west`, 0.06, 0.65, true), first);
  if (hasEastBridge) plan.link(plan.add(`${prefix}_bridge_east`, 0.94, 0.65, true), last);

  return { nodes: [...plan.nodes.values()], aliases };
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

/** Территория: ворота и площадь внизу, входы в корпуса рядом по верху плана. */
function buildCampus(letters, size) {
  const plan = createPlan(size);

  const gate = plan.add('campus_gate', 0.5, 0.93);
  const square = plan.add('campus_square', 0.5, 0.65);
  const stop = plan.add('campus_bus_stop', 0.88, 0.95);
  plan.link(gate, square);
  plan.link(gate, stop);

  const entrances = new Map();
  letters.forEach((letter, index) => {
    const fx = 0.1 + (0.8 * index) / Math.max(1, letters.length - 1);
    const pathNode = plan.add(`campus_path_${letter.id}`, fx, 0.45);
    const entrance = plan.add(`campus_entrance_${letter.id}`, fx, 0.3, true);
    plan.link(square, pathNode);
    plan.link(pathNode, entrance);
    entrances.set(letter.id, plan.nodes.get(entrance));
  });

  const aliases = [
    {
      id: gate,
      names: ['Главный вход', 'Проходная'],
      translations: { en: { names: ['Main entrance', 'Checkpoint'] } },
    },
    { id: square, names: ['Площадь'], translations: { en: { names: ['Main square'] } } },
    { id: stop, names: ['Остановка'], translations: { en: { names: ['Bus stop'] } } },
  ];

  return { nodes: [...plan.nodes.values()], aliases, entrances };
}

/**
 * Привязка корпуса к метрике так, чтобы вход первого этажа стоял на входе
 * территории: тогда время перехода через вход правдоподобно.
 */
function buildingPlacement(campusEntrance, floorOneEntrance) {
  const worldX = campusEntrance.x * CAMPUS_METERS_PER_PIXEL;
  const worldY = campusEntrance.y * CAMPUS_METERS_PER_PIXEL;

  return {
    metersPerPixel: PLAN_METERS_PER_PIXEL,
    originMeters: {
      x: worldX - floorOneEntrance.x * PLAN_METERS_PER_PIXEL,
      y: worldY - floorOneEntrance.y * PLAN_METERS_PER_PIXEL,
    },
    rotationDeg: 0,
    baseElevationMeters: BASE_ELEVATION_METERS,
    floorHeightMeters: FLOOR_HEIGHT_METERS,
  };
}

function generate(options, outDir) {
  const plans = placeholderPlans();
  const campusMapSource = path.join(canonicalDataDir, campusMapPath());
  const campusSize = pngSize(campusMapSource);
  const letters = LETTERS.slice(0, options.buildings);
  const floors = floorNumbers(options.floors, options.basements);

  const campus = buildCampus(letters, campusSize);
  const aliases = [...campus.aliases];
  const transitions = [];
  const transition = (from, to, type) =>
    transitions.push({ from: { node: from }, to: { node: to }, transition_type: type });

  let planIndex = 0;

  letters.forEach((letter, buildingIndex) => {
    const buildingId = `building_${letter.id}`;
    const floorMetas = [];
    let floorOneEntrance = null;

    for (const floor of floors) {
      const plan = plans[planIndex % plans.length];
      planIndex += 1;

      const built = buildFloor({
        letter,
        floor,
        size: plan.size,
        rooms: options.rooms,
        hasWestBridge: floor === 2 && buildingIndex > 0,
        hasEastBridge: floor === 2 && buildingIndex < letters.length - 1,
      });

      writeJson(outDir, floorGraphPath(buildingId, floor), { nodes: built.nodes });
      copyFile(outDir, floorMapPath(buildingId, floor), plan.file);
      aliases.push(...built.aliases);

      if (floor === 1) floorOneEntrance = built.nodes.find((n) => n.id.endsWith('_entrance'));

      // Нумерация без нулевого этажа: формула корпуса дала бы подвалу отметку
      // на два этажа ниже первого, поэтому отметка подвала задаётся явно.
      floorMetas.push({
        floor,
        mapSize: plan.size,
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

    writeJson(outDir, buildingMetaPath(buildingId), {
      id: buildingId,
      name: `Корпус ${letter.cyrillic}`,
      translations: { en: { name: `Building ${letter.latin}` } },
      entranceFloor: 1,
      ...(options.metric
        ? { placement: buildingPlacement(campus.entrances.get(letter.id), floorOneEntrance) }
        : {}),
      floors: floorMetas,
    });
  });

  writeJson(outDir, CAMPUS_META_PATH, {
    buildings: letters.map((letter) => ({ id: `building_${letter.id}`, name: `Корпус ${letter.cyrillic}` })),
    mapSize: campusSize,
    ...(options.metric ? { metersPerPixel: CAMPUS_METERS_PER_PIXEL } : {}),
  });
  writeJson(outDir, CAMPUS_GRAPH_PATH, { nodes: campus.nodes });
  copyFile(outDir, campusMapPath(), campusMapSource);
  writeJson(outDir, TRANSITIONS_PATH, { transitions });
  writeJson(outDir, ALIASES_PATH, { aliases });
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
