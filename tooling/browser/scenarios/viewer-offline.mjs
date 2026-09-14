import { strict as assert } from 'node:assert';
import { PANEL, viewerHelpers } from '../viewer.mjs';

/** Маршрут через два этажа корпуса А и переход в корпус Б. */
const ROUTE = '/?from=a1_entrance&to=b2_lab';

/**
 * Навигатор без связи (запись 26).
 *
 * Связь пропадает по-настоящему: сценарий останавливает сервер приложения, а
 * браузеру включает режим «нет сети». Поэтому сценарий идёт последним среди
 * сценариев навигатора и только на прод-сборке — в dev service worker не
 * регистрируется.
 */
export default {
  app: 'viewer',
  name: 'навигатор: без связи',

  // Без сервера браузер пишет в консоль о каждом неудачном запросе — это и есть
  // проверяемое условие, а не ошибка страницы.
  ignoreProblems: [/ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED|ERR_FAILED|Failed to fetch|no-response/],

  async run({ page, base, step, shot, mode, stopServer }) {
    const v = viewerHelpers(page, base);
    await page.viewport(390, 844, 2);

    if (mode !== 'prod') {
      await step('без связи проверяется только на прод-сборке: в dev нет service worker', async () => {});
      return;
    }

    await step('первый визит: данные и планы этажей маршрута — в кэше', async () => {
      await v.open(ROUTE);
      await page.eval('navigator.serviceWorker.ready.then(() => true)');
      await page.waitFor('!!navigator.serviceWorker.controller', 10_000);
      // Без перезагрузки: при первом открытии данные и планы грузятся раньше
      // service worker, и в кэш их обязано дозагрузить приложение
      // (`warmCacheWhenControlled`).

      const expected = [
        'campus/meta.json',
        'building_a/floors/1/map.svg',
        'building_a/floors/2/map.svg',
        'building_b/floors/2/map.svg',
      ];
      const cached = () =>
        page.eval(`(async () => {
          const paths = [];
          for (const name of ['campus-maps', 'campus-data']) {
            const cache = await caches.open(name);
            paths.push(...(await cache.keys()).map((request) => new URL(request.url).pathname));
          }
          return paths;
        })()`);

      let paths = [];
      for (const deadline = Date.now() + 20_000; Date.now() < deadline; await page.sleep(300)) {
        paths = await cached();
        if (expected.every((suffix) => paths.some((path) => path.endsWith(suffix)))) break;
      }

      // При провале — что лежит в кэше и какие планы страница запрашивала: без
      // этого непонятно, не дошёл ли запрос или не сработало правило кэша.
      const diagnostics = await page.eval(`(async () => ({
        caches: await caches.keys(),
        requests: performance.getEntriesByType('resource')
          .filter((entry) => entry.name.includes('/map.'))
          .map((entry) => entry.initiatorType + ' ' + new URL(entry.name).pathname),
      }))()`);
      assert.ok(
        expected.every((suffix) => paths.some((path) => path.endsWith(suffix))),
        `в кэше планов: ${JSON.stringify(paths)}\nкэши: ${JSON.stringify(diagnostics.caches)}\nзапросы планов: ${JSON.stringify(diagnostics.requests)}`
      );

      // Сценарии идут в одном профиле браузера, и корпус В мог открыть другой
      // сценарий — на широком экране холст показывает все корпуса. Его план
      // убирается из кэша: последний шаг проверяет именно несохранённый этаж.
      await page.eval(`(async () => {
        const cache = await caches.open('campus-maps');
        for (const request of await cache.keys()) {
          if (request.url.includes('/building_c/')) await cache.delete(request);
        }
      })()`);
    });

    await step('без связи: навигатор открывается, сообщает об этом, планы шагов на месте', async () => {
      stopServer();
      await page.send('Network.enable');
      await page.send('Network.emulateNetworkConditions', {
        offline: true,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });

      await v.open(ROUTE);
      await page.waitFor(`document.body.innerText.includes('Нет связи')`);
      await v.click('Начать');

      for (let index = 0; index < 10; index += 1) {
        await page.sleep(800);
        const status = await page.eval(`document.querySelector('.campus-plan-status')?.textContent ?? null`);
        assert.equal(status, null, `шаг ${index + 1}: ${status}`);

        const hasNext = await page.eval(
          `[...${PANEL}.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Далее')`
        );
        if (!hasNext) break;
        await v.click('Далее');
      }
      await shot('viewer-offline');
    });

    await step('без связи план, которого нет в памяти, так и называется', async () => {
      await v.click('Завершить пошаговую навигацию');
      await v.click('Вернуться к карте кампуса');
      await v.click('Корпус В');
      try {
        await page.waitFor(
          `document.querySelector('.campus-plan-status')?.textContent === 'План этого этажа не сохранён — нужна связь'`,
          15_000
        );
      } catch (cause) {
        // Что на холсте: какой корпус в шапке, какие планы видны и в каком они состоянии.
        const state = await page.eval(`({
          header: document.querySelector('.campus-map-header')?.innerText ?? null,
          status: document.querySelector('.campus-plan-status')?.textContent ?? null,
          plans: [...document.querySelectorAll('.campus-placed-plan')].map((plan) => ({ ...plan.dataset, children: plan.childElementCount })),
        })`);
        throw new Error(`${cause.message}
состояние карты: ${JSON.stringify(state)}`);
      }
      await shot('viewer-offline-missing-plan');
    });
  },
};
