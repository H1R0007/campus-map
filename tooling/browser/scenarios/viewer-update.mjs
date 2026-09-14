import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../../lib/vite-server.mjs';
import { viewerHelpers } from '../viewer.mjs';

/** Файл service worker прод-сборки: его правка и есть «вышла новая версия». */
const SW_FILE = path.join(repoRoot, 'apps', 'viewer', 'dist', 'sw.js');

/** Текст сообщений над картой. */
const NOTICES = `[...document.querySelectorAll('.campus-notices [role="status"]')].map((s) => s.textContent).join(' ')`;

/**
 * Навигатор: обновление по согласию (запись 27).
 *
 * Новую версию изображает правка `dist/sw.js`: браузер сравнивает файл service
 * worker побайтно. Файл восстанавливается в любом случае. Только прод-сборка:
 * в dev service worker нет.
 */
export default {
  app: 'viewer',
  name: 'навигатор: обновление по согласию',

  async run({ page, base, step, shot, mode }) {
    const v = viewerHelpers(page, base);
    await page.viewport(390, 844, 2);

    if (mode !== 'prod') {
      await step('обновление проверяется только на прод-сборке: в dev нет service worker', async () => {});
      return;
    }

    /** Ждёт условия, переживая перезагрузку страницы между проверками. */
    const waitAcrossReload = async (expression, timeoutMs = 20_000) => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        try {
          if (await page.eval(expression)) return;
        } catch {
          // Страница перезагружается — контекст выполнения сменился.
        }
        if (Date.now() > deadline) throw new Error(`не дождались: ${expression}`);
        await page.sleep(200);
      }
    };

    const original = fs.readFileSync(SW_FILE, 'utf8');

    try {
      await step('новая версия не перезагружает страницу и ждёт конца навигации', async () => {
        await v.open('/?from=a1_entrance&to=a3_room305');
        await page.eval('navigator.serviceWorker.ready.then(() => true)');
        if (!(await page.eval('!!navigator.serviceWorker.controller'))) await v.open('/?from=a1_entrance&to=a3_room305');
        assert.ok(await page.eval('!!navigator.serviceWorker.controller'), 'страницей управляет service worker');

        await v.click('Начать');
        await page.eval('window.__beforeUpdate = true');
        fs.writeFileSync(SW_FILE, `${original}\n// новая версия для проверки обновления ${Date.now()}\n`);
        await page.eval('navigator.serviceWorker.getRegistration().then((r) => r.update()).then(() => true)');
        await page.waitFor('navigator.serviceWorker.getRegistration().then((r) => !!r.waiting)', 20_000);
        await page.sleep(500);

        assert.equal(await page.eval('window.__beforeUpdate'), true, 'страница не перезагрузилась сама');
        assert.ok(!(await page.eval(NOTICES)).includes('Карта обновилась'), 'на шаге навигации не отвлекает');

        await v.click('Завершить пошаговую навигацию');
        await page.waitFor(`${NOTICES}.includes('Карта обновилась')`);
        await shot('viewer-update');
      });

      await step('«Обновить позже» убирает сообщение до следующего открытия', async () => {
        await v.click('Обновить позже');
        assert.ok(!(await page.eval(NOTICES)).includes('Карта обновилась'));

        await v.open('/');
        await page.waitFor(`${NOTICES}.includes('Карта обновилась')`);
      });

      await step('«Обновить» перезагружает на новую версию', async () => {
        await page.eval('window.__beforeUpdate = true');
        await v.click('Обновить');
        await waitAcrossReload(
          `window.__beforeUpdate === undefined && !!document.querySelector('.campus-map-header')`
        );
        await page.sleep(800);
        assert.ok(!(await page.eval(NOTICES)).includes('Карта обновилась'), 'после обновления сообщения нет');
        assert.equal(await page.eval('navigator.serviceWorker.getRegistration().then((r) => !!r.waiting)'), false);
      });
    } finally {
      fs.writeFileSync(SW_FILE, original);
    }
  },
};
