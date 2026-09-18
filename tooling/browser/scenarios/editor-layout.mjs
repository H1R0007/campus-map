import { strict as assert } from 'node:assert';
import { MOD, editorHelpers } from '../editor.mjs';

/**
 * Редактор: колонки по бокам карты вместо панелей поверх неё.
 *
 * Раньше карточка узла закрывала треть плана, а «Маршрут», «Статистика» и
 * «Диагностика» ложились друг на друга. Теперь структура, инструменты,
 * инспектор и строка параметров стоят вокруг карты, и ни одна точка плана
 * ими не закрыта. Свёрнутая колонка отдаёт место карте, и карта это место
 * действительно использует.
 */
export default {
  app: 'editor',
  name: 'редактор: колонки вместо панелей поверх карты',

  async run({ page, base, step, shot }) {
    await page.viewport(1600, 900, 1);
    const e = editorHelpers(page, base);

    /** Все углы и центр карты принадлежат самой карте, а не панели над ней. */
    const mapUncovered = () =>
      page.eval(`(() => {
        const map = document.querySelector('.leaflet-container');
        const r = map.getBoundingClientRect();
        const points = [[r.left + 60, r.top + 12], [r.right - 12, r.top + 12], [r.left + 12, r.bottom - 12],
          [r.right - 12, r.bottom - 12], [r.left + r.width / 2, r.top + r.height / 2]];
        const covered = points.map(([x, y]) => document.elementFromPoint(x, y))
          .filter((el) => !map.contains(el) || el.closest('.leaflet-control'))
          .map((el) => el.tagName + '.' + String(el.className).slice(0, 40));
        return covered;
      })()`);
    const selectedTab = () => page.eval(`document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim() ?? ''`);

    await step('карточка узла, проверка и маршрут не закрывают карту', async () => {
      await e.open();
      await e.openFloor('Корпус А', 1);
      const room = await e.nodePoint('a1_room101');
      await e.click(room.x, room.y);
      assert.equal(await e.propertiesNodeId(), 'a1_room101', 'карточка узла не открылась');
      assert.deepEqual(await mapUncovered(), [], 'карточка узла лежит поверх карты');
      await shot('editor-layout');

      for (const tab of ['Проверка', 'Маршрут']) {
        await e.press(tab);
        assert.equal(await selectedTab(), tab);
        assert.deepEqual(await mapUncovered(), [], `вкладка «${tab}» лежит поверх карты`);
      }

      await e.press('Переход (T)');
      assert.deepEqual(await mapUncovered(), [], 'параметры инструмента лежат поверх карты');
      await e.press('Выбор (V)');
    });

    await step('щелчок по узлу показывает его карточку, даже если открыта проверка', async () => {
      await e.press('Проверка');
      const room = await e.nodePoint('a1_room102');
      await e.click(room.x, room.y);
      assert.equal(await selectedTab(), 'Свойства', 'инспектор остался на проверке');
      assert.equal(await e.propertiesNodeId(), 'a1_room102');
    });

    await step('вкладки инспектора переключаются стрелками', async () => {
      await page.eval(`document.querySelector('[role="tab"][aria-selected="true"]').focus()`);
      await e.key('ArrowRight');
      assert.equal(await selectedTab(), 'Проверка');
      assert.equal(await page.eval(`document.activeElement?.getAttribute('role')`), 'tab', 'фокус ушёл с вкладок');
      await e.key('ArrowLeft');
      assert.equal(await selectedTab(), 'Свойства');
      // Узел А-102 выбран, но стрелки ушли вкладкам, а не ему.
      assert.match(await e.status(), /Правок: 0/, 'стрелки во вкладках сдвинули выбранный узел');
    });

    await step('экран ноутбука: карта не прыгает при выборе узла и смене инструмента', async () => {
      await page.viewport(1280, 720, 1);
      await page.sleep(400);
      await e.key('Escape');
      const heights = [];
      /** Высота карты и кнопки строки над картой, которые не видны целиком. */
      const record = async (what) => {
        heights.push([what, Math.round((await e.rect('.leaflet-container')).height)]);
        const clipped = await page.eval(`(() => {
          const bar = document.querySelector('[aria-label="Параметры инструмента"]').getBoundingClientRect();
          return [...document.querySelectorAll('[aria-label="Параметры инструмента"] button')]
            .filter((b) => { const r = b.getBoundingClientRect(); return r.left < bar.left || r.right > bar.right || r.top < bar.top || r.bottom > bar.bottom; })
            .map((b) => b.getAttribute('aria-label') ?? b.textContent.trim());
        })()`);
        assert.deepEqual(clipped, [], `${what}: кнопки обрезаны краем строки`);
      };
      await record('ничего не выбрано');
      const room = await e.nodePoint('a1_room101');
      await e.click(room.x, room.y);
      await record('выбран узел');
      const other = await e.nodePoint('a1_room102');
      await e.click(other.x, other.y, { modifiers: MOD.shift });
      await record('выбрано два узла');
      await e.press('Переход (T)');
      await record('инструмент «Переход»');
      await e.press('Выбор (V)');
      assert.ok(heights.every(([, h]) => h === heights[0][1]), `высота карты менялась: ${JSON.stringify(heights)}`);
      const width = (await e.rect('.leaflet-container')).width;
      assert.ok(width >= 1280 * 0.5, `карте осталось меньше половины экрана: ${width}`);
      await shot('editor-layout-1280');
      await page.viewport(1600, 900, 1);
      await page.sleep(400);
    });

    await step('названия узлов на карте появляются, только когда не слипаются', async () => {
      const labels = () => page.eval(`document.querySelectorAll('.alias-label').length`);
      // Подписи появляются не в тот же миг: Leaflet доигрывает приближение, и
      // только по его окончании слой подписей узнаёт новый масштаб.
      const zoom = async (direction) => {
        await page.eval(`document.querySelector('.leaflet-control-zoom-${direction}').click()`);
        await page.sleep(800);
      };

      await e.toggleFilter('Названия узлов');
      assert.ok((await labels()) > 0, 'подписи не появились на открытом плане');

      // Дальше «плана целиком» карта не отдаляется, поэтому окно поуже: так
      // у плана появляется запас для отдаления, как на маленьком экране.
      await page.viewport(900, 640, 1);
      await page.sleep(400);
      const counts = [];
      for (let i = 0; i < 5 && (await labels()) > 0; i++) {
        await zoom('out');
        counts.push(await labels());
      }
      assert.equal(await labels(), 0, `на отдалённом плане подписи слиплись бы в полосу: ${JSON.stringify(counts)}`);

      const back = [];
      for (let i = 0; i < 5 && (await labels()) === 0; i++) {
        await zoom('in');
        back.push(await labels());
      }
      assert.ok((await labels()) > 0, `подписи не вернулись при приближении: ${JSON.stringify({ counts, back })}`);
      await e.toggleFilter('Названия узлов');
      await page.viewport(1600, 900, 1);
      await page.sleep(400);
    });

    await step('свёрнутые колонки отдают место карте, и план подгоняется по новому месту', async () => {
      const before = await e.rect('.leaflet-container');
      await e.press('Свернуть структуру');
      await e.press('Свернуть инспектор');
      const after = await e.rect('.leaflet-container');
      assert.ok(after.width > before.width + 400, `карта не стала шире: ${before.width} → ${after.width}`);

      // Подгонка плана считает по размеру карты: без пересчёта после
      // сворачивания план встал бы в середину прежнего, узкого места.
      const empty = await e.emptyMapPoint();
      await e.click(empty.x, empty.y, { button: 'right' });
      await e.menuPick('Показать план целиком');
      await page.sleep(1200);
      const plan = await e.rect('img.leaflet-image-layer');
      const planCenter = plan.left + plan.width / 2;
      const mapCenter = after.left + after.width / 2;
      assert.ok(Math.abs(planCenter - mapCenter) < 30, `план не по центру карты: ${Math.round(planCenter)} против ${Math.round(mapCenter)}`);
      await shot('editor-layout-collapsed');
    });

    await step('свёрнутость колонок помнится после перезагрузки', async () => {
      await e.open();
      assert.ok(await e.rect('button[aria-label="Развернуть инспектор"]'), 'инспектор развернулся после перезагрузки');
      assert.ok(await e.rect('button[aria-label="Развернуть структуру"]'), 'структура развернулась после перезагрузки');
      await e.press('Развернуть структуру');
      await e.press('Развернуть инспектор');
      assert.ok(await e.rect('[role="tablist"]'), 'инспектор не развернулся');
    });
  },
};
