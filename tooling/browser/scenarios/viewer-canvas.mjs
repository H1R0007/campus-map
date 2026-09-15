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
      assert.equal(
        await page.eval(`getComputedStyle(document.querySelector('.leaflet-container')).backgroundColor`),
        'rgb(228, 238, 218)',
        'вокруг кампуса — трава территории, а не серое поле'
      );
      assert.deepEqual(await shownFloors(), []);
      assert.ok((await v.headerText()).includes('Корпуса'), 'в шапке телефона — кнопка «Корпуса»');
      await shot('viewer-canvas-overview');
    });

    await step('корпус из шапки: камера приближает его, вместо крыши — этаж, в шапке — корпус', async () => {
      await v.openBuilding('Корпус Б');
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
      await v.openBuilding('Корпус Б');
      await waitShown('building_b#2');
      assert.ok((await v.headerText()).includes('Этаж 2'), 'открыт этаж, который смотрели');
    });

    await step('текущий корпус выбирает камера: отдалились — снова лента корпусов', async () => {
      for (let index = 0; index < 3; index += 1) await v.click('Отдалить');
      await waitNoFloors();
      const header = await v.headerText();
      assert.ok(header.includes('Корпуса') && !header.includes('Этаж'), `шапка: ${header}`);
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

      // Нажатие без паузы помощника: иначе перелёт закончился бы до замеров. На
      // телефоне корпуса — в списке «Корпуса»: он открывается заранее.
      await v.click('Корпуса');
      await page.eval(`[...document.querySelectorAll('.campus-map-header button')].find((button) => button.textContent.trim() === 'Корпус В').click()`);
      const reveal = [];
      const flight = [];
      for (let index = 0; index < 12; index += 1) {
        flight.push(await page.eval(planWidth));
        reveal.push(1 - Number(await page.eval(`getComputedStyle(document.getElementsByClassName('campus-roof campus-building-2')[0]).fillOpacity`)) / 0.96);
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
      await v.openBuilding('Корпус Б');
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

    await step('широкий экран, шаг «Войдите в здание»: корпус остаётся текущим, хотя вход на краю кадра', async () => {
      await page.viewport(1024, 768, 1);
      await v.open('/?from=campus_gate&to=a3_room305');
      await v.click('Начать');
      await v.click('Далее');
      await v.click('Далее');
      await waitShown('building_a#1');
      // Решение о текущем корпусе камера принимает, когда перелёт закончился.
      await page.sleep(1500);
      const header = await v.headerText();
      assert.ok(header.includes('Корпус А, этаж 1'), `в шапке — корпус шага, а не территория: ${header}`);
      assert.equal(await page.eval(`!!document.querySelector('.campus-floor-list')`), true, 'колонка этажей на месте');
    });

    // Угол плана из его CSS-преобразования: поворот плана — его угол плюс угол карты.
    const rotationOf = (selector) =>
      page.eval(`(() => {
        const plan = document.querySelector(${JSON.stringify(selector)});
        const angle = (plan?.style.transform ?? '').split('rotate(')[1]?.split('deg')[0];
        return angle === undefined ? null : Number(angle);
      })()`);
    const COMPASS = `document.querySelector('button[aria-label="Повернуть карту на север"]')`;
    const CAMPUS_PLAN = '.campus-placed-plan[data-plan="campus"]';

    await step('поворот двумя пальцами: план повёрнут, значки стоят, компас возвращает на север', async () => {
      await page.viewport(390, 844, 2);
      await v.open('/');
      await v.openBuilding('Корпус Б');
      await waitShown('building_b#1');
      await page.sleep(700);

      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      const fingers = (angle) => {
        const radians = (angle * Math.PI) / 180;
        return [
          { x: 195 - 70 * Math.cos(radians), y: 420 - 70 * Math.sin(radians), id: 0 },
          { x: 195 + 70 * Math.cos(radians), y: 420 + 70 * Math.sin(radians), id: 1 },
        ];
      };
      await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(0) });
      for (let index = 1; index <= 18; index += 1) {
        await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(index * 5) });
        await page.sleep(20);
      }
      await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      await page.sleep(600);

      const turned = await rotationOf(CAMPUS_PLAN);
      assert.ok(turned !== null && turned > 45 && turned < 95, `карта повёрнута пальцами: ${turned}°`);
      const upright = await page.eval(`[...document.querySelectorAll('.campus-roof-label, .campus-marker--portal')].every((marker) => !(marker.style.transform || '').includes('rotate'))`);
      assert.equal(upright, true, 'значки и названия не поворачиваются');
      assert.ok((await v.headerText()).includes('Корпус Б'), 'корпус остался текущим');
      assert.equal(await page.eval(`!!${COMPASS}`), true, 'компас на месте');
      await shot('viewer-canvas-rotated');

      await page.eval(`${COMPASS}.click()`);
      await page.waitFor(`!${COMPASS}`);
      assert.ok(Math.abs(await rotationOf(CAMPUS_PLAN)) < 0.5, 'компас вернул карту на север');
    });

    await step('поворот правой кнопкой мыши: перетаскивание и подгонка к корпусу — по повёрнутой карте', async () => {
      await page.viewport(1024, 768, 1);
      await v.open('/');
      // Приближено к корпусу: на общем виде территория меньше экрана, и Leaflet
      // после любого перетаскивания возвращает её на середину — с поворотом и без.
      await v.openBuilding('Корпус Б');
      await waitShown('building_b#1');
      await page.sleep(700);
      const mouse = (type, x, y, button, buttons) =>
        page.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: 1 });
      const around = (angle) => [512 + 200 * Math.cos((angle * Math.PI) / 180), 384 + 200 * Math.sin((angle * Math.PI) / 180)];

      // На 45° против часовой. При прямом угле два противоположных угла
      // прямоугольника задают весь его габарит, а Leaflet берёт углы, которые при
      // оси y вниз лежат на диагонали «низ слева — верх справа»: при повороте по
      // часовой ширина по ним считается верно. Против часовой — нет, и подгонка
      // без расчёта по четырём углам вывела бы территорию шире места под неё.
      await mouse('mousePressed', ...around(0), 'right', 2);
      for (let index = 1; index <= 12; index += 1) await mouse('mouseMoved', ...around(-index * 3.75), 'right', 2);
      await mouse('mouseReleased', ...around(-45), 'right', 0);
      await page.sleep(500);
      const turned = await rotationOf(CAMPUS_PLAN);
      assert.ok(turned !== null && Math.abs(turned + 45) < 3, `карта повёрнута мышью на 45° против часовой: ${turned}°`);

      const centerOf = `(() => { const rect = document.querySelector('${CAMPUS_PLAN}').getBoundingClientRect(); return [rect.x + rect.width / 2, rect.y + rect.height / 2]; })()`;
      const before = await page.eval(centerOf);
      await mouse('mousePressed', 700, 500, 'left', 1);
      for (let index = 1; index <= 10; index += 1) await mouse('mouseMoved', 700 - index * 10, 500, 'left', 1);
      await page.sleep(300);
      await mouse('mouseReleased', 600, 500, 'left', 0);
      await page.sleep(500);
      const after = await page.eval(centerOf);
      assert.ok(Math.abs(after[0] - before[0] + 100) < 8 && Math.abs(after[1] - before[1]) < 8, `карта идёт за мышью: ${before} → ${after}`);

      await v.click('Вернуться к карте кампуса');
      await v.openBuilding('Корпус В');
      await waitShown('building_c#1');
      await page.sleep(1200);
      const fit = await page.eval(`(() => {
        const plan = document.querySelector('.campus-placed-plan[data-plan="floor"][data-building="building_c"][data-visible="true"]').getBoundingClientRect();
        const panel = document.querySelector('section[aria-label="Панель навигатора"]').getBoundingClientRect();
        return { left: plan.left - panel.right, right: innerWidth - plan.right, top: plan.top, bottom: innerHeight - plan.bottom };
      })()`);
      assert.ok(Object.values(fit).every((gap) => gap > -2), `корпус вписан в свободную часть повёрнутой карты: ${JSON.stringify(fit)}`);
      await shot('viewer-canvas-rotated-desktop');

      // Вся территория на повёрнутой карте: ширину здесь ограничивает свободная
      // часть справа от панели, а расчёт габарита по двум углам занижал бы
      // ширину повёрнутого прямоугольника — план вышел бы шире места под него.
      await v.click('Показать план целиком');
      await page.sleep(1200);
      const whole = await page.eval(`(() => {
        const plan = document.querySelector('${CAMPUS_PLAN}').getBoundingClientRect();
        const panel = document.querySelector('section[aria-label="Панель навигатора"]').getBoundingClientRect();
        return { plan: Math.round(plan.width), free: Math.round(innerWidth - panel.right) };
      })()`);
      assert.ok(whole.plan <= whole.free + 2, `территория шириной в свободную часть: ${JSON.stringify(whole)}`);

      await page.eval(`${COMPASS}.click()`);
      await page.waitFor(`!${COMPASS}`);
    });

    await step('поворот у самого севера доводится ровно до севера', async () => {
      await v.open('/');
      const mouse = (type, x, y, button, buttons) =>
        page.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: 1 });
      await mouse('mousePressed', 712, 384, 'right', 2);
      await mouse('mouseMoved', 712, 400, 'right', 2);
      await mouse('mouseMoved', 711, 402, 'right', 2);
      await mouse('mouseReleased', 711, 402, 'right', 0);
      await page.sleep(700);
      assert.ok(Math.abs(await rotationOf(CAMPUS_PLAN)) < 0.5, 'карта снова ровно на север');
      assert.equal(await page.eval(`!!${COMPASS}`), false, 'компаса нет');
    });
  },
};
