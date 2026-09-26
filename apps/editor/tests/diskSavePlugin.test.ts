import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
// @ts-expect-error — у модулей tooling/ нет объявлений типов
import { campusDataPlugin } from '../../../tooling/vite-plugin-campus-data.mjs';

/**
 * Сохранение на диск (запись 46): большие файлы загружаются заранее и
 * проверяются по отпечатку, сохранение переносит и удаляет файлы данных и
 * кладёт исходники — целиком или никак, не затирая чужих правок.
 *
 * Проверяется настоящий dev-сервер Vite с плагином на временном каталоге.
 */

const sha1 = (content: Buffer | string) => createHash('sha1').update(content).digest('hex');
const sha256 = (content: Buffer | string) => createHash('sha256').update(content).digest('hex');

const PLAN_2 = Buffer.from('план второго этажа');
const PLAN_3 = Buffer.from('план третьего этажа');
const NEW_PLAN = Buffer.from('новый план в webp');
const PDF = Buffer.from('%PDF-1.7 присланный оригинал');
const PDF_NAME = `${sha256(PDF).slice(0, 16)}.pdf`;

let root: string;
let dataDir: string;
let sourcesDir: string;
let uploadsDir: string;
let server: ViteDevServer;
let origin: string;

const EDITOR = { 'X-Campus-Editor': '1' };

function resetData() {
  for (const directory of [dataDir, sourcesDir, uploadsDir]) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
  const files: Record<string, Buffer | string> = {
    'campus/meta.json': '{}',
    'buildings/b/meta.json': '{"id":"b"}',
    'buildings/b/floors/2/map.png': PLAN_2,
    'buildings/b/floors/2/graph.json': '{"nodes":[]}',
    'buildings/b/floors/3/map.png': PLAN_3,
    'buildings/c/meta.json': '{"id":"c"}',
    'buildings/c/floors/1/graph.json': '{"nodes":[]}',
    'buildings/c/floors/1/map.png': 'план корпуса В',
  };
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(dataDir, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}

const read = (relative: string) => readFileSync(path.join(dataDir, relative));
const exists = (relative: string) => existsSync(path.join(dataDir, relative));

async function manifest(): Promise<{ files: Record<string, string>; sources: string[] }> {
  const response = await fetch(`${origin}/__campus/manifest`, { headers: EDITOR });
  return response.json();
}

async function upload(content: Buffer, name = sha256(content), headers: Record<string, string> = EDITOR) {
  return fetch(`${origin}/__campus/upload/${name}`, { method: 'PUT', headers, body: new Uint8Array(content) });
}

async function save(body: Record<string, unknown>) {
  const response = await fetch(`${origin}/__campus/save`, {
    method: 'POST',
    headers: { ...EDITOR, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'campus-save-test-'));
  dataDir = path.join(root, 'data');
  sourcesDir = path.join(root, 'data-sources');
  uploadsDir = path.join(root, 'uploads');
  resetData();

  // Своё пустое приложение и без слежения за файлами: на Windows слежение
  // держит файлы данных открытыми, и очистка между проверками падает.
  const app = path.join(root, 'app');
  mkdirSync(app);
  server = await createServer({
    configFile: false,
    root: app,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, watch: null },
    plugins: [campusDataPlugin({ sourceDir: dataDir, sourcesDir, uploadsDir, writable: true })],
  });
  await server.listen();
  origin = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await server?.close();
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

beforeEach(() => {
  resetData();
});

describe('загрузка большого файла', () => {
  it('принимает файл, если отпечаток совпал', async () => {
    const response = await upload(NEW_PLAN);
    expect(response.status).toBe(200);
    expect(readFileSync(path.join(uploadsDir, sha256(NEW_PLAN)))).toEqual(NEW_PLAN);
  });

  it('отказывает, если содержимое не совпало с отпечатком', async () => {
    const response = await upload(NEW_PLAN, sha256('другое'));
    expect(response.status).toBe(400);
    expect(existsSync(path.join(uploadsDir, sha256('другое')))).toBe(false);
  });

  it('отказывает в чужом имени и без заголовка редактора', async () => {
    expect((await upload(NEW_PLAN, '..%2Fevil')).status).toBe(400);
    expect((await upload(NEW_PLAN, sha256(NEW_PLAN), {})).status).toBe(403);
  });
});

describe('сохранение: перенос, загрузка, удаление, исходник', () => {
  it('переносит план на другой номер, кладёт новый и исходник, удаляет старый', async () => {
    const { files: base } = await manifest();
    await upload(NEW_PLAN);
    await upload(PDF);

    const { status, body } = await save({
      files: {
        'buildings/b/floors/4/map.png': { copy: 'buildings/b/floors/2/map.png' },
        'buildings/b/floors/2/map.webp': { upload: sha256(NEW_PLAN) },
      },
      delete: ['buildings/b/floors/2/map.png'],
      sources: { [PDF_NAME]: { upload: sha256(PDF) } },
      base,
    });

    expect(status).toBe(200);
    expect(read('buildings/b/floors/4/map.png')).toEqual(PLAN_2);
    expect(read('buildings/b/floors/2/map.webp')).toEqual(NEW_PLAN);
    expect(exists('buildings/b/floors/2/map.png')).toBe(false);
    expect(readFileSync(path.join(sourcesDir, PDF_NAME))).toEqual(PDF);
    expect(body.deleted).toEqual(['buildings/b/floors/2/map.png']);
    expect(body.sources).toEqual([PDF_NAME]);
    expect(body.hashes['buildings/b/floors/4/map.png']).toBe(sha1(PLAN_2));

    // Загрузки, вошедшие в сохранение, убраны; исходник виден в манифесте.
    expect(readdirSync(uploadsDir)).toEqual([]);
    expect((await manifest()).sources).toEqual([PDF_NAME]);
  });

  it('обмен этажей местами не теряет ни один план', async () => {
    const { files: base } = await manifest();
    const { status } = await save({
      files: {
        'buildings/b/floors/2/map.png': { copy: 'buildings/b/floors/3/map.png' },
        'buildings/b/floors/3/map.png': { copy: 'buildings/b/floors/2/map.png' },
      },
      base,
    });

    expect(status).toBe(200);
    expect(read('buildings/b/floors/2/map.png')).toEqual(PLAN_3);
    expect(read('buildings/b/floors/3/map.png')).toEqual(PLAN_2);
  });

  it('удалённый корпус не оставляет пустых каталогов', async () => {
    const { files: base } = await manifest();
    const { status } = await save({
      files: {},
      delete: ['buildings/c/meta.json', 'buildings/c/floors/1/graph.json', 'buildings/c/floors/1/map.png'],
      base,
    });

    expect(status).toBe(200);
    expect(exists('buildings/c')).toBe(false);
    expect(exists('buildings')).toBe(true);
  });

  it('удалять уже удалённое — не ошибка', async () => {
    const { status, body } = await save({ files: {}, delete: ['buildings/b/floors/9/map.png'], base: {} });
    expect(status).toBe(200);
    expect(body.deleted).toEqual([]);
  });
});

describe('сохранение: целиком или никак', () => {
  it('чужая правка удаляемого файла — отказ, и ничего не записано', async () => {
    const { files: base } = await manifest();
    writeFileSync(path.join(dataDir, 'buildings/c/floors/1/map.png'), 'кто-то поправил план');

    const { status, body } = await save({
      files: { 'campus/meta.json': { text: '{"changed":true}' } },
      delete: ['buildings/c/floors/1/map.png'],
      base,
    });

    expect(status).toBe(409);
    expect(body.conflicts.map((conflict: { path: string }) => conflict.path)).toEqual(['buildings/c/floors/1/map.png']);
    expect(read('campus/meta.json').toString()).toBe('{}');
    expect(exists('buildings/c/floors/1/map.png')).toBe(true);
  });

  it('чужая правка переносимого файла — отказ', async () => {
    const { files: base } = await manifest();
    writeFileSync(path.join(dataDir, 'buildings/b/floors/2/map.png'), 'кто-то поправил план');

    const { status } = await save({ files: { 'buildings/b/floors/5/map.png': { copy: 'buildings/b/floors/2/map.png' } }, base });
    expect(status).toBe(409);
    expect(exists('buildings/b/floors/5/map.png')).toBe(false);
  });

  it('пропавшая загрузка — отказ с её отпечатком, чтобы редактор загрузил заново', async () => {
    const { status, body } = await save({ files: { 'buildings/b/floors/2/map.webp': { upload: sha256('нет такой') } }, base: {} });
    expect(status).toBe(400);
    expect(body.missingUpload).toBe(sha256('нет такой'));
  });

  it('исходник, не совпавший с именем, — отказ', async () => {
    await upload(NEW_PLAN);
    const { status } = await save({ files: {}, sources: { [PDF_NAME]: { upload: sha256(NEW_PLAN) } }, base: {} });
    expect(status).toBe(400);
    expect(existsSync(path.join(sourcesDir, PDF_NAME))).toBe(false);
  });

  it.each([
    ['выход из каталога данных', { delete: ['../outside.json'] }],
    ['чужое расширение', { delete: ['buildings/b/notes.txt'] }],
    ['файл и пишется, и удаляется', { files: { 'campus/meta.json': { text: '{}' } }, delete: ['campus/meta.json'] }],
    ['чужое имя исходника', { sources: { 'Корпус А.pdf': { upload: sha256(PDF) } } }],
  ])('недопустимый запрос (%s) — отказ', async (_why, request) => {
    const { status } = await save({ files: {}, base: {}, ...request });
    expect(status).toBe(400);
  });
});

describe('чтение исходника', () => {
  it('отдаёт сохранённый исходник только редактору с этой машины', async () => {
    mkdirSync(sourcesDir, { recursive: true });
    writeFileSync(path.join(sourcesDir, PDF_NAME), PDF);

    const ok = await fetch(`${origin}/__campus/sources/${PDF_NAME}`, { headers: EDITOR });
    expect(ok.status).toBe(200);
    expect(Buffer.from(await ok.arrayBuffer())).toEqual(PDF);

    expect((await fetch(`${origin}/__campus/sources/${PDF_NAME}`)).status).toBe(403);
    expect((await fetch(`${origin}/__campus/sources/${sha256('нет').slice(0, 16)}.pdf`, { headers: EDITOR })).status).toBe(404);
    expect((await fetch(`${origin}/__campus/sources/meta.json`, { headers: EDITOR })).status).toBe(400);
  });
});
