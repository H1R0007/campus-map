import { strict as assert } from 'node:assert';
import { PANEL, viewerHelpers } from '../viewer.mjs';

/** Маршрут через два этажа корпуса А и переход в корпус Б. */
const ROUTE = '/?from=a1_entrance&to=b2_lab';

/**
 * Маршрут с фото на шагах (запись 86): вход во двор корпуса А, кофейный
 * автомат, дверь «А-305». Маленькие фото шагов навигатор загружает заранее.
 */
const PHOTO_ROUTE = '/?from=campus_gate&to=a3_room305';

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

    // Сценарии идут в одном профиле браузера, и корпус В мог открыть другой
    // сценарий — на широком экране холст показывает все корпуса. Его план
    // убирается из кэша: последний шаг проверяет именно несохранённый этаж.
    const forgetBuildingC = () =>
      page.eval(`(async () => {
        const cache = await caches.open('campus-maps');
        for (const request of await cache.keys()) {
          if (request.url.includes('/building_c/')) await cache.delete(request);
        }
      })()`);
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

      await forgetBuildingC();
    });

    await step('маршрут с фото: маленькие фото шагов — заранее и в своём кэше, не в кэше планов', async () => {
      await v.open(PHOTO_ROUTE);
      const photos = () =>
        page.eval(`(async () => {
          const result = {};
          for (const name of ['campus-photos', 'campus-maps']) {
            const cache = await caches.open(name);
            result[name] = (await cache.keys()).map((request) => new URL(request.url).pathname).filter((path) => path.includes('/photos/'));
          }
          return result;
        })()`);
      let cached = { 'campus-photos': [], 'campus-maps': [] };
      for (const deadline = Date.now() + 20_000; Date.now() < deadline; await page.sleep(300)) {
        cached = await photos();
        if (cached['campus-photos'].length >= 3) break;
      }
      assert.equal(cached['campus-photos'].filter((path) => path.includes('.small.')).length, 3, `кэш фото: ${JSON.stringify(cached)}`);
      assert.deepEqual(cached['campus-maps'], [], 'фото не вытесняют планы из их кэша');
      // Обратно к маршруту первого шага: Chrome 130 снимает режим «нет сети»,
      // когда страница уходит на другой адрес, и навигатор без связи считал бы
      // себя на связи. Следующий шаг открывает тот же адрес, что уже открыт.
      await v.open(ROUTE);
      // Маршрут с фото открывал общий вид кампуса — корпус В снова мог попасть в кэш.
      await forgetBuildingC();
    });

    const emulateOffline = () =>
      page.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    /**
     * Другой адрес без связи. Chrome 130 при переходе на другой адрес снимает
     * режим «нет сети», и навигатор считал бы себя на связи; режим включается
     * заново — навигатор узнаёт об этом событием `offline`, как на телефоне.
     */
    const openOffline = async (url) => {
      await v.open(url);
      await emulateOffline();
    };

    await step('без связи: навигатор открывается, сообщает об этом, планы шагов на месте', async () => {
      stopServer();
      await page.send('Network.enable');
      await emulateOffline();

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

    await step('без связи фото шага у ориентира на месте', async () => {
      await v.click('Завершить пошаговую навигацию');
      await openOffline(PHOTO_ROUTE);
      await v.click('Начать');
      for (let index = 0; index < 10 && (await v.heading()) !== 'У кофейного автомата поверните налево'; index += 1) {
        await v.click('Далее');
      }
      assert.equal(await v.heading(), 'У кофейного автомата поверните налево');
      await page.waitFor(`(() => { const img = document.querySelector('[data-step-photo] img'); return !!img && img.complete && img.naturalWidth > 0; })()`);
      await v.click('Завершить пошаговую навигацию');
      // Следующий шаг начинается с пошаговой навигации по первому маршруту.
      await openOffline(ROUTE);
      await v.click('Начать');
    });

    await step('без связи план, которого нет в памяти, так и называется', async () => {
      await v.click('Завершить пошаговую навигацию');
      await v.click('Вернуться к карте кампуса');
      await v.openBuilding('Корпус В');
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
