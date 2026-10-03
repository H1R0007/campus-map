import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
// @ts-expect-error — у модулей tooling/ нет объявлений типов
import { campusDataPlugin } from '../../../tooling/vite-plugin-campus-data.mjs';
// @ts-expect-error — у модулей tooling/ нет объявлений типов
import { localDirectory } from '../../../tooling/lib/local-env.mjs';

/**
 * Общая папка фото (запись 85): настоящие фото лежат вне git, в папке, общей
 * для всех разработчиков. Сервер разработки отдаёт фото оттуда, если его нет
 * в `data/photos/`, а сборка берёт из неё только фото, на которые ссылаются
 * точки.
 */

const IN_DATA = '1111111111111111.png';
const SHARED = '2222222222222222.webp';
const UNUSED = '3333333333333333.webp';
const MISSING = '4444444444444444.jpg';

const small = (file: string) => file.replace(/\.([a-z]+)$/, '.small.$1');

let root: string;
let dataDir: string;
let photosDir: string;
let server: ViteDevServer;
let origin: string;

function write(file: string, content: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

beforeAll(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'campus-photos-test-'));
  dataDir = path.join(root, 'data');
  photosDir = path.join(root, 'shared-photos');

  const photo = (file: string) => ({ file, width: 1600, height: 1200 });
  write(path.join(dataDir, 'campus/meta.json'), '{}');
  write(
    path.join(dataDir, 'campus/graph.json'),
    JSON.stringify({
      nodes: [
        { id: 'campus_a', x: 0, y: 0, neighbors: [], photos: [photo(IN_DATA), photo(SHARED)] },
        { id: 'campus_b', x: 9, y: 9, neighbors: [], photos: [photo(MISSING)] },
      ],
    })
  );
  for (const file of [IN_DATA, small(IN_DATA)]) write(path.join(dataDir, 'photos', file), `тестовая ${file}`);
  for (const file of [SHARED, small(SHARED), UNUSED, small(UNUSED)]) write(path.join(photosDir, file), `общая ${file}`);
  // Рядом в общей папке — чужой файл не по правилам имени: его не раздают.
  write(path.join(photosDir, 'notes.txt'), 'список съёмки');

  const app = path.join(root, 'app');
  mkdirSync(app);
  server = await createServer({
    configFile: false,
    root: app,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, watch: null },
    plugins: [campusDataPlugin({ sourceDir: dataDir, photosDir })],
  });
  await server.listen();
  origin = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await server?.close();
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

async function get(relative: string): Promise<{ status: number; body: string }> {
  const response = await fetch(`${origin}/data/${relative}`);
  return { status: response.status, body: await response.text() };
}

describe('раздача фото', () => {
  it('фото из data/photos — как любой файл данных', async () => {
    expect(await get(`photos/${IN_DATA}`)).toEqual({ status: 200, body: `тестовая ${IN_DATA}` });
  });

  it('фото, которого нет в data/, — из общей папки, и полное, и маленькое', async () => {
    expect(await get(`photos/${SHARED}`)).toEqual({ status: 200, body: `общая ${SHARED}` });
    expect(await get(`photos/${small(SHARED)}`)).toEqual({ status: 200, body: `общая ${small(SHARED)}` });
  });

  it('из общей папки — только файлы фото: ни чужие файлы, ни выход за папку', async () => {
    expect((await get('photos/notes.txt')).status).toBe(404);
    expect((await get('photos/..%2Fshared-photos%2Fnotes.txt')).status).not.toBe(200);
    expect((await get(`campus/${SHARED}`)).status).toBe(404);
  });

  it('нет нигде — честный 404', async () => {
    expect((await get(`photos/${MISSING}`)).status).toBe(404);
  });
});

describe('сборка', () => {
  /** Что плагин положит в сборку: путь → содержимое, и предупреждения. */
  function bundle(photos: string | undefined) {
    const plugin = campusDataPlugin({ sourceDir: dataDir, photosDir: photos });
    const emitted = new Map<string, string>();
    const warnings: string[] = [];
    plugin.generateBundle.call({
      emitFile: ({ fileName, source }: { fileName: string; source: Buffer }) => emitted.set(fileName, source.toString()),
      warn: (message: string) => warnings.push(message),
    });
    return { emitted, warnings };
  }

  it('берёт из общей папки только фото, на которые ссылаются точки', () => {
    const { emitted } = bundle(photosDir);

    expect(emitted.get(`data/photos/${SHARED}`)).toBe(`общая ${SHARED}`);
    expect(emitted.get(`data/photos/${small(SHARED)}`)).toBe(`общая ${small(SHARED)}`);
    expect(emitted.get(`data/photos/${IN_DATA}`)).toBe(`тестовая ${IN_DATA}`);
    expect([...emitted.keys()].filter((file) => file.includes(UNUSED) || file.includes('notes'))).toEqual([]);
  });

  it('называет фото, которых нет ни в данных, ни в общей папке', () => {
    const { warnings } = bundle(photosDir);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(MISSING);
    expect(warnings[0]).not.toContain(SHARED);
  });

  it('без общей папки — предупреждение и про её фото тоже', () => {
    const { emitted, warnings } = bundle(undefined);

    expect(emitted.has(`data/photos/${SHARED}`)).toBe(false);
    expect(warnings[0]).toContain(SHARED);
    expect(warnings[0]).toContain('CAMPUS_PHOTOS_DIR');
  });
});

describe('путь к общей папке', () => {
  it('из .env.local — от корня репозитория; переменная окружения важнее', () => {
    const envFile = path.join(root, '.env.local');
    writeFileSync(envFile, '# фото\nCAMPUS_PHOTOS_DIR="D:/Облако/campus-photos"\n');
    const saved = process.env.CAMPUS_PHOTOS_DIR;
    try {
      delete process.env.CAMPUS_PHOTOS_DIR;
      expect(localDirectory('CAMPUS_PHOTOS_DIR', { envFile })).toBe(path.resolve('D:/Облако/campus-photos'));

      process.env.CAMPUS_PHOTOS_DIR = photosDir;
      expect(localDirectory('CAMPUS_PHOTOS_DIR', { envFile })).toBe(photosDir);
    } finally {
      if (saved === undefined) delete process.env.CAMPUS_PHOTOS_DIR;
      else process.env.CAMPUS_PHOTOS_DIR = saved;
    }
  });
});
