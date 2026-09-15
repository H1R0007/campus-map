#!/usr/bin/env node
/**
 * Тестовый кампус в `data/`: планы SVG, графы, привязка к метрике, переходы
 * (запись 30).
 *
 * Официальных планов пока нет, а единому холсту кампуса нужны планы, стоящие на
 * своих местах в метрах. Картинки-заглушки этого не давали: узлы на них
 * расставлялись на глаз, масштаб был выдуман. Здесь план и граф строятся из
 * одного описания (`lib/test-campus.mjs`), поэтому узел всегда в своём
 * помещении, маршрут идёт через двери, а корпус на общем виде стоит там же, где
 * откроются его этажи.
 *
 *   node tooling/generate-test-data.mjs            перезаписать data/
 *   node tooling/generate-test-data.mjs --out <к>  записать в другой каталог
 *
 * Названия, переводы и категории (`aliases.json`) генератор не пишет — это
 * ручная разметка; он только проверяет, что каждое название ведёт к узлу.
 * С официальными планами генератор уходит: `data/` размечается в редакторе.
 */

import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
import { BUILDINGS, CAMPUS, CAMPUS_POINTS, FLOOR_HEIGHT_METERS, TRANSITIONS } from './lib/test-campus.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonicalDataDir = path.join(repoRoot, DATA_ROOT);

/** Отступ точки входа территории от наружной двери, метры. */
const OUTSIDE = 1.5;
/** Дорожка от входа до общей аллеи, метры от наружной стены. */
const PATH_OFFSET = 12;
/** Половина ширины крытого перехода, метры. */
const BRIDGE_HALF_WIDTH = 1.5;

/** Номер на двери: «А-305», «Б-201». Узлы без номера подписываются значком. */
const ROOM_CODE = /^[А-ЯЁA-Z]-\d{3}$/;

function parseArgs(argv) {
  const options = { out: canonicalDataDir };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') options.out = path.resolve(repoRoot, argv[++i]);
    else throw new Error(`Неизвестный аргумент: ${argv[i]}`);
  }
  return options;
}

function writeText(outDir, relativePath, text) {
  const file = path.join(outDir, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

const writeJson = (outDir, relativePath, value) => writeText(outDir, relativePath, `${JSON.stringify(value, null, 2)}\n`);

/** Прежний растровый план рядом с новым — удалить: иначе он уедет в сборку. */
function removeStalePlan(outDir, relativePath) {
  const file = path.join(outDir, relativePath);
  if (existsSync(file) && lstatSync(file).isFile()) rmSync(file);
}

function roomCodes(aliases) {
  const codes = new Map();
  for (const entry of aliases) {
    const code = entry.names?.find((name) => ROOM_CODE.test(name));
    if (code) codes.set(entry.id, { code });
  }
  return codes;
}

/** Территория: узлы по точкам в метрах кампуса. */
function buildCampus({ a, aYard, b, c }) {
  const nodes = new Map();
  const add = (id, point, isPortal = false) =>
    nodes.set(id, {
      id,
      x: Math.round(point.x / CAMPUS.metersPerPixel),
      y: Math.round(point.y / CAMPUS.metersPerPixel),
      neighbors: [],
      isPortal,
    });
  const link = (from, to) => {
    nodes.get(from).neighbors.push(to);
    nodes.get(to).neighbors.push(from);
  };

  add('campus_gate', CAMPUS_POINTS.gate);
  add('campus_bus_stop', CAMPUS_POINTS.busStop);
  add('campus_parking', CAMPUS_POINTS.parking);
  add('campus_square', CAMPUS_POINTS.square);
  add('campus_path_a', a.path);
  add('campus_path_a_west', { x: aYard.door.x - 8, y: a.path.y });
  add('campus_entrance_a', a.door, true);
  add('campus_entrance_a_yard', aYard.door, true);
  // Дорожки А и Б — на одной аллее вдоль фасадов.
  add('campus_path_b', { x: b.path.x, y: a.path.y });
  add('campus_entrance_b', b.door, true);
  add('campus_path_c', c.path);
  add('campus_entrance_c', c.door, true);

  link('campus_gate', 'campus_square');
  link('campus_gate', 'campus_bus_stop');
  link('campus_gate', 'campus_parking');
  link('campus_parking', 'campus_path_a_west');
  link('campus_path_a_west', 'campus_path_a');
  link('campus_path_a_west', 'campus_entrance_a_yard');
  link('campus_path_a', 'campus_entrance_a');
  link('campus_path_a', 'campus_path_b');
  link('campus_square', 'campus_path_b');
  link('campus_path_b', 'campus_entrance_b');
  link('campus_square', 'campus_path_c');
  link('campus_path_c', 'campus_entrance_c');

  return [...nodes.values()];
}

function generate(outDir) {
  const aliases = JSON.parse(readFileSync(path.join(canonicalDataDir, ALIASES_PATH), 'utf8')).aliases;
  const codes = roomCodes(aliases);
  const doors = {};
  const roofs = [];
  const bridgeDoors = [];

  for (const building of BUILDINGS) {
    const placement = {
      metersPerPixel: PLAN_METERS_PER_PIXEL,
      originMeters: building.placement.originMeters,
      rotationDeg: building.placement.rotationDeg,
      baseElevationMeters: 0,
      floorHeightMeters: FLOOR_HEIGHT_METERS,
    };
    const floors = [];

    for (const [floorKey, floorSpec] of Object.entries(building.floors)) {
      const floor = Number(floorKey);
      const { size, nodes, geometry } = layoutFloor({
        prefix: `${building.id.replace('building_', '')}${floor}`,
        width: building.width,
        depth: building.depth,
        corridor: building.corridor,
        ...floorSpec,
      });

      writeJson(outDir, floorGraphPath(building.id, floor), { nodes });
      writeText(outDir, floorMapPath(building.id, floor, 'svg'), floorPlanSvg(geometry, codes));
      removeStalePlan(outDir, floorMapPath(building.id, floor, 'png'));
      floors.push({ floor, mapSize: size, planFormat: 'svg' });

      // Точки входа территории — чуть снаружи наружных дверей.
      for (const entrance of geometry.entrances) {
        const sign = entrance.side === 's' ? 1 : -1;
        doors[entrance.id] = {
          door: toWorld(placement, entrance.door.x, entrance.door.y + sign * OUTSIDE),
          path: toWorld(placement, entrance.door.x, entrance.door.y + sign * PATH_OFFSET),
        };
      }
      for (const end of geometry.ends) {
        const sign = end.end === 'west' ? -1 : 1;
        doors[end.id] = { door: toWorld(placement, end.door.x + sign * OUTSIDE, end.door.y) };
        if (end.kind === 'bridge') bridgeDoors.push(toWorld(placement, end.door.x, end.door.y));
      }
    }

    const corners = [
      [0, 0],
      [building.width, 0],
      [building.width, building.depth],
      [0, building.depth],
    ].map(([x, y]) => toWorld(placement, x, y));
    roofs.push({ corners, label: building.label });

    writeJson(outDir, buildingMetaPath(building.id), {
      id: building.id,
      name: building.name,
      translations: { en: { name: building.nameEn } },
      entranceFloor: 1,
      placement,
      floors,
    });
  }

  const campusNodes = buildCampus({
    a: doors.a1_entrance,
    aYard: doors.a1_entrance_yard,
    b: doors.b1_entrance,
    c: doors.c1_entrance,
  });

  // Крытый переход — полоса между торцевыми дверями корпусов, стоящих в ряд. У
  // корпусов вплотную переход — дверь в общей стене, и рисовать нечего.
  const bridges = [];
  if (bridgeDoors.length === 2 && Math.hypot(bridgeDoors[0].x - bridgeDoors[1].x, bridgeDoors[0].y - bridgeDoors[1].y) >= 1) {
    const [from, to] = bridgeDoors;
    bridges.push({
      corners: [
        { x: from.x, y: from.y - BRIDGE_HALF_WIDTH },
        { x: to.x, y: to.y - BRIDGE_HALF_WIDTH },
        { x: to.x, y: to.y + BRIDGE_HALF_WIDTH },
        { x: from.x, y: from.y + BRIDGE_HALF_WIDTH },
      ],
    });
  }

  writeJson(outDir, CAMPUS_META_PATH, {
    buildings: BUILDINGS.map((building) => ({ id: building.id, name: building.name })),
    mapSize: { width: CAMPUS.width / CAMPUS.metersPerPixel, height: CAMPUS.depth / CAMPUS.metersPerPixel },
    metersPerPixel: CAMPUS.metersPerPixel,
    planFormat: 'svg',
  });
  writeJson(outDir, CAMPUS_GRAPH_PATH, { nodes: campusNodes });
  writeText(
    outDir,
    campusMapPath('svg'),
    campusPlanSvg({
      ...CAMPUS,
      street: { y: CAMPUS.depth - 6, height: 6 },
      walkways: graphWalkways(campusNodes, CAMPUS.metersPerPixel),
      square: { ...CAMPUS_POINTS.square, radius: 11 },
      parking: { x: 4, y: 132, width: 30, height: 22 },
      busStop: CAMPUS_POINTS.busStop,
      buildings: roofs,
      bridges,
    })
  );
  removeStalePlan(outDir, campusMapPath('png'));
  writeJson(outDir, TRANSITIONS_PATH, {
    transitions: TRANSITIONS.map(([from, to, type]) => ({ from: { node: from }, to: { node: to }, transition_type: type })),
  });

  if (path.resolve(outDir) !== canonicalDataDir) {
    copyFileSync(path.join(canonicalDataDir, ALIASES_PATH), path.join(outDir, ALIASES_PATH));
  }
}

/** Та же проверка, что `dataset.real.test.ts`: без предупреждений, связен, названия ведут к узлам. */
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
  const orphanAliases = dataset.aliases.filter((entry) => !graph.hasNode(entry.id)).map((entry) => entry.id);

  process.stdout.write(
    `Тестовый кампус: узлов ${graph.nodeCount}, переходов ${graph.transitionCount}, ` +
      `режим ${graph.isMetric ? 'метрический' : 'пиксельный'}\n`
  );
  for (const warning of warnings) process.stdout.write(`  ПРЕДУПРЕЖДЕНИЕ  ${warning}\n`);
  if (!connected) process.stdout.write(`  НЕСВЯЗЕН: компонент ${components.length}\n`);
  if (orphanAliases.length > 0) process.stdout.write(`  НАЗВАНИЯ БЕЗ УЗЛА: ${orphanAliases.join(', ')}\n`);
  if (!graph.isMetric) process.stdout.write('  НЕ МЕТРИЧЕСКИЙ: привязка неполная\n');

  return warnings.length === 0 && connected && orphanAliases.length === 0 && graph.isMetric;
}

async function main() {
  const { out } = parseArgs(process.argv.slice(2));
  if (existsSync(out) && lstatSync(out).isSymbolicLink()) {
    throw new Error(`${out} — ссылка или junction, генератор в неё не пишет`);
  }
  generate(out);
  if (!(await verify(out))) process.exitCode = 1;
}

main().catch((cause) => {
  process.stderr.write(`\nТестовый кампус не создан: ${cause?.message ?? cause}\n`);
  process.exitCode = 1;
});
