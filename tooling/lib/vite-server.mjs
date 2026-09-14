/**
 * Сервер vite приложения для проверок: dev-сервер или preview прод-сборки.
 *
 * Общий для смоук-теста раздачи (`smoke-test.mjs`) и сценариев в браузере
 * (`browser-check.mjs`): оба поднимают приложение на свободном порту и обязаны
 * гарантированно его погасить.
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Ищет свободный TCP-порт. */
export function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * Отправляет запрос с дословным путём, без нормализации `..`.
 *
 * Через `node:http`, а не `fetch`: WHATWG URL нормализует `..` до отправки, и
 * проверки обхода каталога в смоук-тесте стали бы бесполезными.
 *
 * @returns {Promise<{status: number, contentType: string}>}
 */
export function request(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: urlPath, method: 'GET' },
      (res) => {
        res.resume();
        res.once('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            contentType: String(res.headers['content-type'] ?? ''),
          });
        });
      }
    );

    req.once('error', reject);
    req.end();
  });
}

/** Ждёт, пока сервер начнёт отвечать. */
async function waitForServer(port, base, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await request(port, base);
      return;
    } catch {
      // Сервер ещё не слушает порт — это и есть ожидание.
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  throw new Error(`Сервер не поднялся на порту ${port} за ${timeoutMs / 1000} с`);
}

/**
 * Поднимает vite приложения на свободном порту.
 *
 * @param {{ app: 'viewer' | 'editor', mode: 'dev' | 'prod', base?: string, timeoutMs?: number }} options
 * @returns {Promise<{ port: number, output: () => string, stop: () => void }>}
 */
export async function startVite({ app, mode, base = '/', timeoutMs = 60_000 }) {
  const appDir = path.join(repoRoot, 'apps', app);
  const port = await findFreePort();

  // Запускаем vite напрямую из node_modules, а не через `npx`: тот порождает
  // цепочку npm → sh → node, и SIGKILL обёртке оставляет сервер-внук жить с
  // открытыми пайпами — процесс проверки из-за этого никогда не завершается.
  const viteBin = path.join(appDir, 'node_modules', 'vite', 'bin', 'vite.js');
  const args = [
    viteBin,
    ...(mode === 'dev' ? [] : ['preview']),
    '--host', '127.0.0.1',
    '--port', String(port),
    '--strictPort',
  ];

  // `detached` даёт собственную группу процессов — её можно снять целиком.
  const child = spawn(process.execPath, args, {
    cwd: appDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, BROWSER: 'none' },
  });

  let output = '';
  const capture = (chunk) => {
    output += chunk.toString();
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);

  const stop = () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      // Отрицательный pid — сигнал всей группе процессов.
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // Групп процессов нет (Windows) — гасим сам vite: он запущен напрямую,
      // без обёрток, и внуков у него нет.
      child.kill('SIGKILL');
    }
  };
  process.on('exit', stop);

  try {
    await waitForServer(port, base, timeoutMs);
  } catch (cause) {
    stop();
    throw new Error(`${cause.message}\n--- вывод сервера ---\n${output}`, { cause });
  }

  return { port, output: () => output, stop };
}
