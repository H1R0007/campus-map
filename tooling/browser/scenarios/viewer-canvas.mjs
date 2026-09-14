import { strict as assert } from 'node:assert';
import { viewerHelpers } from '../viewer.mjs';

/** Видимые планы этажей холста: «корпус#этаж». */
const SHOWN_FLOORS = `[...document.querySelectorAll('.campus-placed-plan[data-plan="floor"][data-visible="true"]')].map((plan) => plan.dataset.building + '#' + plan.dataset.floor)`;

/**
 * Навигатор: холст кампуса (запись 32).
 *
 * Написан под тестовый `data/`: три корпуса на одной территории, у корпуса Б
 * два этажа. Проверяет то, чего нет на карте одного плана: крыши на общем виде,
 * этаж при приближении, текущий корпус от камеры, свой этаж у каждого корпуса,
 * просвечивающий маршрут.
 */
export default {
  app: 'viewer',
  name: 'навигатор: холст кампуса',

  async run({ page, base, step, shot }) {
    const v = viewerHelpers(page, base);
    await page.viewport(390, 844, 2);

    const shownFloors = () => page.eval(SHOWN_FLOORS);
    const waitShown = (floor) => page.waitFor(`${SHOWN_FLOORS}.includes(${JSON.stringify(floor)})`);
    const waitNoFloors = () => page.waitFor(`${SHOWN_FLOORS}.length === 0`);

    await step('общий вид: территория и крыши всех корпусов, этажей не видно', async () => {
      await v.open('/');
      assert.equal(await page.eval(`document.querySelectorAll('.campus-roof:not(.campus-roof--open)').length`), 3);
      assert.deepEqual(await shownFloors(), []);
      assert.ok((await v.headerText()).includes('Корпус Б'), 'в шапке — лента корпусов');
      await shot('viewer-canvas-overview');
    });

    await step('корпус из шапки: камера приближает его, вместо крыши — этаж, в шапке — корпус', async () => {
      await v.click('Корпус Б');
      await waitShown('building_b#1');
      const header = await v.headerText();
      assert.ok(header.includes('Корпус Б') && header.includes('Этаж 1'), `шапка: ${header}`);
      assert.ok(await page.eval(`!!document.querySelector('.campus-floor-list')`), 'колонка этажей корпуса');
      await shot('viewer-canvas-building');
    });

    await step('этаж меняется на месте и запоминается у корпуса', async () => {
      await v.click('Этаж 2');
      await waitShown('building_b#2');
      assert.ok(!(await shownFloors()).includes('building_b#1'), 'первый этаж погас');

      await v.click('Вернуться к карте кампуса');
      await waitNoFloors();
      await v.click('Корпус Б');
      await waitShown('building_b#2');
      assert.ok((await v.headerText()).includes('Этаж 2'), 'открыт этаж, который смотрели');
    });

    await step('текущий корпус выбирает камера: отдалились — снова лента корпусов', async () => {
      for (let index = 0; index < 3; index += 1) await v.click('Отдалить');
      await waitNoFloors();
      const header = await v.headerText();
      assert.ok(header.includes('Корпус А') && header.includes('Корпус В'), `шапка: ${header}`);
      assert.equal(await page.eval(`!!document.querySelector('.campus-floor-list')`), false, 'колонки этажей нет');
    });

    await step('маршрут в корпусе: линия по открытому этажу, этаж цели просвечивает', async () => {
      await v.open('/?from=a1_entrance&to=a3_room305');
      await waitShown('building_a#1');
      assert.ok((await v.routeLines()).strong > 0, 'линия по первому этажу');
      assert.ok(await page.eval(`document.querySelectorAll('.campus-route-ghost').length > 0`), 'третий этаж просвечивает');
      await shot('viewer-canvas-route');
    });

    await step('на шаге навигации другие этажи корпуса не просвечивают', async () => {
      await v.click('Начать');
      await v.click('Далее');
      await v.click('Далее');
      await waitShown('building_a#3');
      assert.equal(await page.eval(`document.querySelectorAll('.campus-route-ghost').length`), 0);
    });

    await step('при открытом этаже у двери корпуса один значок входа, а не два', async () => {
      await v.open('/?at=a1_entrance');
      await waitShown('building_a#1');
      await page.sleep(400);
      const icons = await page.eval(`(() => {
        const points = [...document.querySelectorAll('.campus-marker--portal')].map((marker) => marker.getBoundingClientRect());
        let overlapping = 0;
        for (let i = 0; i < points.length; i += 1) {
          for (let j = i + 1; j < points.length; j += 1) {
            if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) < 12) overlapping += 1;
          }
        }
        return { total: points.length, overlapping };
      })()`);
      assert.equal(icons.overlapping, 0, `значки входа: ${JSON.stringify(icons)}`);
    });
  },
};
