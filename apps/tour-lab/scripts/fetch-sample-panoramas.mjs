#!/usr/bin/env node
/* global process, console, fetch, Buffer, setTimeout */
/**
 * Открытые панорамы для прототипа экскурсий (запись 90).
 *
 * Скачивает снимки Poly Haven (CC0 — без ограничений и без обязательной
 * подписи) для точек тестового кампуса из `data/panoramas.json` и кладёт их
 * в `.local/panoramas` — вне git: снимки тяжёлые. Оригиналы 8192×4096
 * уменьшаются вдвое, до 4096×2048: столько показывает телефон, и столько
 * будет весить настоящий снимок после подготовки (~1–2 МБ).
 *
 * Снимки — не наш вуз: стрелки ведут по графу тестового кампуса, а не к
 * дверям на фото.
 *
 *   pnpm --filter @campus-map/tour-lab samples            # ~115 МБ скачать, ~2 мин
 *   pnpm --filter @campus-map/tour-lab samples -- --quick # превью 1920×960, ~2 МБ
 *   ... -- --out <каталог> --force
 *
 * Готовые файлы не перекачиваются: сорвавшийся запуск достаточно повторить.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Файл из `data/panoramas.json` → снимок Poly Haven. */
const SAMPLES = {
  'campus/entrance-a.jpg': 'quadrangle_cloudy',
  'building_a/1/entrance.jpg': 'entrance_hall',
  'building_a/1/hall.jpg': 'newman_lobby',
  'building_a/1/corridor-lift.jpg': 'large_corridor',
  'building_a/1/corridor-101.jpg': 'newman_locker_room',
  'building_a/1/canteen.jpg': 'newman_cafeteria',
  'building_a/2/corridor-lift.jpg': 'cinema_lobby',
};

const HEADERS = { 'User-Agent': 'campus-map-tour-lab (github.com/H1R0007/campus-map)' };

function parseArgs(argv) {
  const options = {
    quick: false,
    force: false,
    out: process.env.CAMPUS_PANORAMAS_DIR ?? path.join(repoRoot, '.local', 'panoramas'),
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--quick') options.quick = true;
    else if (argv[i] === '--force') options.force = true;
    else if (argv[i] === '--out') options.out = argv[++i];
    else if (argv[i] !== '--') throw new Error(`Неизвестный аргумент: ${argv[i]}`);
  }
  options.out = path.resolve(options.out);
  return options;
}

/** Скачивает файл; связь с хранилищем Poly Haven иногда рвётся — пять попыток. */
async function download(url, attempts = 5) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: HEADERS });
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (cause) {
      if (attempt >= attempts) throw cause;
      console.log(`    повтор ${attempt + 1}/${attempts}: ${cause.cause?.code ?? cause.message}`);
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
}

/** Уменьшает вдвое по каждой оси средним четырёх точек. */
function halve({ width, height, data }) {
  const w = width >> 1;
  const h = height >> 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = (2 * y * width + 2 * x) * 4;
      const b = a + width * 4;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) out[o + c] = (data[a + c] + data[a + 4 + c] + data[b + c] + data[b + 4 + c] + 2) >> 2;
      out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

/** Скачивает снимок и уменьшает его до 4096 точек в ширину. */
async function fetchSample(asset, target, quick) {
  mkdirSync(path.dirname(target), { recursive: true });

  if (quick) {
    const preview = await download(`https://cdn.polyhaven.com/asset_img/primary/${asset}.png?width=1920&format=jpg`);
    writeFileSync(target, preview);
    return `превью ${(preview.length / 1e6).toFixed(1)} МБ`;
  }

  const started = Date.now();
  const original = await download(`https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/${asset}.jpg`);
  let image = jpeg.decode(original, { useTArray: true, maxMemoryUsageInMB: 1024, formatAsRGBA: true });
  while (image.width > 4096) image = halve(image);
  const encoded = jpeg.encode(image, 82).data;
  writeFileSync(target, encoded);
  return (
    `${(original.length / 1e6).toFixed(1)} МБ → ${image.width}×${image.height}, ` +
    `${(encoded.length / 1e6).toFixed(1)} МБ, ${((Date.now() - started) / 1000).toFixed(0)} с`
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'data', 'panoramas.json'), 'utf8'));
  const credits = [];
  const failed = [];

  for (const { file } of manifest.panoramas) {
    const asset = SAMPLES[file];
    if (!asset) {
      console.log(`  ${file}: открытого снимка нет — прототип покажет заглушку-компас`);
      continue;
    }
    credits.push(`- \`${file}\` — ${asset}: https://polyhaven.com/a/${asset}`);

    const target = path.join(options.out, ...file.split('/'));
    if (existsSync(target) && !options.force) {
      console.log(`  ${file}: уже есть`);
      continue;
    }

    try {
      console.log(`  ${file}: ${await fetchSample(asset, target, options.quick)}`);
    } catch (cause) {
      // Один сорвавшийся файл не останавливает остальные: повторный запуск докачает его.
      failed.push(file);
      console.log(`  ${file}: не скачан — ${cause.cause?.code ?? cause.message}`);
    }
  }

  mkdirSync(options.out, { recursive: true });
  writeFileSync(
    path.join(options.out, 'CREDITS.md'),
    [
      '# Открытые панорамы прототипа',
      '',
      'Poly Haven, лицензия CC0 (https://polyhaven.com/license): можно использовать без ограничений и без подписи.',
      'Это не снимки нашего вуза — только образцы для прототипа экскурсий.',
      '',
      ...credits,
      '',
    ].join('\n')
  );

  console.log(`\nСнимки в ${options.out}`);
  if (failed.length > 0) {
    console.log(`Не скачано: ${failed.length}. Запустите ещё раз — готовые файлы не перекачиваются.`);
    process.exitCode = 1;
  }
}

main().catch((cause) => {
  console.error(`Снимки не скачаны: ${cause?.stack ?? cause}`);
  process.exit(1);
});
