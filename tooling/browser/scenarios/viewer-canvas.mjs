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
      const overview = await page.eval(`({
        roofs: [...document.querySelectorAll('.campus-roof')].map((roof) => Number(getComputedStyle(roof).fillOpacity)),
        portals: document.querySelectorAll('.campus-marker--portal').length,
      })`);
      assert.equal(overview.roofs.length, 3);
      assert.ok(overview.roofs.every((opacity) => opacity > 0.9), `крыши закрыты: ${overview.roofs}`);
      assert.equal(overview.portals, 0, 'на общем виде значков входа нет');
      assert.deepEqual(await shownFloors(), []);
      assert.ok((await v.headerText()).includes('Корпус Б'), 'в шапке — лента корпусов');
      await shot('viewer-canvas-overview');
    });

    await step('корпус из шапки: камера приближает его, вместо крыши — этаж, в шапке — корпус', async () => {
      await v.click('Корпус Б');
      await waitShown('building_b#1');
      await page.waitFor(`[...document.querySelectorAll('.campus-roof')].some((roof) => Number(getComputedStyle(roof).fillOpacity) < 0.05)`);
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

    await step('камера движется кадрами: перелёт к корпусу и колесо — без скачков', async () => {
      await v.open('/');
      const planWidth = `Math.round(document.querySelector('.campus-placed-plan[data-plan="campus"]').getBoundingClientRect().width)`;
      const sample = async (count) => {
        const widths = [];
        for (let index = 0; index < count; index += 1) {
          widths.push(await page.eval(planWidth));
          await page.sleep(50);
        }
        return widths;
      };

      // Нажатие без паузы помощника: иначе перелёт закончился бы до замеров.
      await page.eval(`[...document.querySelectorAll('.campus-map-header button')].find((button) => button.textContent.trim() === 'Корпус В').click()`);
      const reveal = [];
      const flight = [];
      for (let index = 0; index < 12; index += 1) {
        flight.push(await page.eval(planWidth));
        reveal.push(Number(await page.eval(`getComputedStyle(document.querySelector('.leaflet-container')).getPropertyValue('--reveal-2')`)));
        await page.sleep(50);
      }
      assert.ok(new Set(flight).size >= 4, `перелёт кадрами: ${flight}`);
      assert.ok(reveal.some((amount) => amount > 0.05 && amount < 0.95), `крыша тает постепенно: ${reveal}`);

      await page.sleep(700);
      const before = await page.eval(planWidth);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 195, y: 400, deltaX: 0, deltaY: 260 });
      const wheel = await sample(8);
      assert.ok(new Set(wheel).size >= 3 && wheel[wheel.length - 1] < before, `колесо отдаляет плавно: ${before} → ${wheel}`);
    });

    await step('корпус, въехавший в экран под пальцем, виден целиком, пока палец держит карту', async () => {
      await v.open('/');
      await v.click('Корпус Б');
      await page.sleep(900);
      // Видимая на экране часть крыши корпуса В: за краем экрана Leaflet всё равно
      // обрезает контур по области отрисовки, и полная ширина там ничего не значит.
      const roof = `(() => {
        const rect = document.getElementsByClassName('campus-roof campus-building-2')[0].getBoundingClientRect();
        return Math.round(Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0)));
      })()`;
      const mouse = (type, x, buttons) => page.send('Input.dispatchMouseEvent', { type, x, y: 380, button: 'left', buttons, clickCount: 1 });

      await mouse('mousePressed', 330, 1);
      for (let index = 1; index <= 20; index += 1) await mouse('mouseMoved', 330 - index * 15, 1);
      await page.sleep(300);
      const held = await page.eval(roof);
      // Отпускание после паузы: карта не катится по инерции, и вид тот же.
      await mouse('mouseReleased', 30, 0);
      await page.sleep(700);
      const released = await page.eval(roof);
      assert.ok(held > 0 && Math.abs(held - released) < 2, `крыша корпуса В под пальцем: ${held} px, после отпускания: ${released} px`);
    });

    await step('маршрут в корпусе: линия по открытому этажу, этаж цели просвечивает', async () => {
      await v.open('/?from=a1_entrance&to=a3_room305');
      await waitShown('building_a#1');
      // План этажа грузится и проявляется ещё в полёте, а линия по этажу и
      // пунктир других этажей появляются, когда камера долетела.
      await page.waitFor(`document.querySelectorAll('.campus-route-line:not(.campus-route-line--muted)').length > 0`);
      await page.waitFor(`document.querySelectorAll('.campus-route-ghost').length > 0`);
      await shot('viewer-canvas-route');
    });

    await step('на шаге навигации другие этажи корпуса не просвечивают', async () => {
      await v.click('Начать');
      await v.click('Далее');
      await v.click('Далее');
      await waitShown('building_a#3');
      await page.waitFor(`document.querySelectorAll('.campus-route-ghost').length === 0`);
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
