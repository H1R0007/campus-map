import { strict as assert } from 'node:assert';
import { MOD, editorHelpers } from '../editor.mjs';

/**
 * Редактор: мышь как в графических редакторах и одно контекстное меню.
 *
 * Закрывает дефекты, которые нашёл владелец: карточка узла гасла через пару
 * секунд, а кнопки меню ребра не срабатывали — открывались два меню сразу и
 * закрывали друг друга раньше нажатия.
 *
 * Написан под тестовый `data/`: корпус А, этаж 1 — аудитории А-101…А-104,
 * коридор, лестница и лифт на второй этаж.
 */
export default {
  app: 'editor',
  name: 'редактор: мышь и контекстное меню',

  async run({ page, base, step, shot }) {
    await page.viewport(1600, 900, 1);
    const e = editorHelpers(page, base);
    const near = (a, b, tolerance = 3) => Math.abs(a - b) <= tolerance;

    await step('щелчок выбирает узел, и карточка не пропадает', async () => {
      await e.open();
      await e.openFloor('Корпус А', 1);
      const room = await e.nodePoint('a1_room101');
      await e.click(room.x, room.y);
      assert.equal(await e.propertiesNodeId(), 'a1_room101');
      await page.sleep(2500);
      assert.equal(await e.propertiesNodeId(), 'a1_room101', 'карточка узла пропала сама');
      assert.equal(await e.selectedCount(), 1);
    });

    await step('перетаскивание узла двигает узел, а не карту; отмена возвращает', async () => {
      await e.key('Escape');
      const reference = await e.nodePoint('a1_room101');
      const start = await e.nodePoint('a1_room103');
      await e.drag(start.x, start.y, start.x + 40, start.y + 24);

      const moved = await e.nodePoint('a1_room103');
      assert.ok(near(moved.x, start.x + 40) && near(moved.y, start.y + 24), `узел не доехал: ${JSON.stringify({ start, moved })}`);
      const still = await e.nodePoint('a1_room101');
      assert.ok(near(still.x, reference.x) && near(still.y, reference.y), 'сдвинулась карта');
      assert.equal(await e.propertiesNodeId(), 'a1_room103', 'перетащенный узел выбран');
      assert.match(await e.status(), /Правок: 1/, 'одна запись истории на всё перетаскивание');
      await shot('editor-drag');

      await e.key('z', { modifiers: MOD.ctrl });
      const back = await e.nodePoint('a1_room103');
      assert.ok(near(back.x, start.x) && near(back.y, start.y), 'отмена вернула узел');
    });

    await step('перетаскивание пустого места двигает карту', async () => {
      const before = await e.nodePoint('a1_room101');
      const empty = await e.emptyMapPoint();
      // Вправо: левый край плана с коридором остаётся на виду, а не уходит
      // под колонку инструментов.
      await e.drag(empty.x, empty.y, empty.x + 60, empty.y - 30);
      const after = await e.nodePoint('a1_room101');
      assert.ok(near(after.x, before.x + 60, 4) && near(after.y, before.y - 30, 4), `карта не сдвинулась: ${JSON.stringify({ before, after })}`);
      assert.equal(await e.propertiesNodeId(), 'a1_room103', 'выбор не снят перетаскиванием карты');
    });

    await step('Shift + рамка добавляет узлы к выбору, щелчок по пустому месту снимает', async () => {
      const a = await e.nodePoint('a1_room101');
      const b = await e.nodePoint('a1_room102');
      await e.drag(Math.min(a.x, b.x) - 12, a.y - 12, Math.max(a.x, b.x) + 12, b.y + 12, { modifiers: MOD.shift });
      assert.equal(await e.selectedCount(), 3, 'А-101 и А-102 добавились к выбранному А-103');

      const empty = await e.emptyMapPoint();
      await e.click(empty.x, empty.y);
      assert.equal(await e.selectedCount(), 0);
    });

    await step('меню ребра: одно меню, пункт срабатывает', async () => {
      const nodesBefore = (await e.nodeIds()).length;
      const edge = await e.linePoint('path[data-edge="a1_corridor_10|a1_corridor_9"]');
      await e.click(edge.x, edge.y, { button: 'right' });

      const menus = await e.menus();
      assert.equal(menus.length, 1, `открыто меню: ${menus.length}`);
      assert.ok(menus[0].items.includes('Вставить узел посередине'), JSON.stringify(menus[0]));
      await shot('editor-edge-menu');

      await e.menuPick('Вставить узел посередине');
      assert.equal((await e.nodeIds()).length, nodesBefore + 1, 'узел не вставлен');
      assert.equal((await e.menus()).length, 0, 'меню закрылось');
      await e.key('z', { modifiers: MOD.ctrl });
      assert.equal((await e.nodeIds()).length, nodesBefore);
    });

    await step('меню узла: удалить узел', async () => {
      const room = await e.nodePoint('a1_room103');
      await e.click(room.x, room.y, { button: 'right' });
      const [menu] = await e.menus();
      assert.ok(menu?.label.startsWith('А-103'), `заголовок меню: ${menu?.label}`);
      await e.menuPick('Удалить узел');
      assert.ok(!(await e.nodeIds()).includes('a1_room103'), 'узел не удалён');
      await e.key('z', { modifiers: MOD.ctrl });
      assert.ok((await e.nodeIds()).includes('a1_room103'), 'отмена вернула узел');
    });

    await step('клавиши под открытым меню не трогают узлы, Escape закрывает меню', async () => {
      const room = await e.nodePoint('a1_room103');
      await e.click(room.x, room.y, { button: 'right' });
      const focused = () => page.eval(`document.activeElement?.closest('[role="menu"]') ? document.activeElement.textContent.trim() : null`);
      assert.equal(await focused(), 'Соединить связью с другим узлом', 'фокус — на первом пункте меню');
      await e.key('ArrowDown');
      assert.equal(await focused(), 'Вход в корпус', 'стрелка перевела фокус на следующий пункт');
      await e.key('Delete');
      assert.ok((await e.nodeIds()).includes('a1_room103'), 'Delete под меню удалил узел');
      // Меню открыто и может лежать поверх узла: нужно только положение.
      const after = await e.nodePoint('a1_room103', { allowCovered: true });
      assert.ok(near(after.x, room.x) && near(after.y, room.y), 'стрелка под меню сдвинула узел');
      await e.key('Escape', { keyCode: 27 });
      assert.equal((await e.menus()).length, 0);
      assert.equal(await e.propertiesNodeId(), 'a1_room103', 'Escape меню не снимает выбор');
    });

    await step('меню пустого места: поставить узел здесь', async () => {
      const nodesBefore = await e.nodeIds();
      const empty = await e.emptyMapPoint();
      await e.click(empty.x, empty.y, { button: 'right' });
      await e.menuPick('Поставить узел здесь');
      const added = (await e.nodeIds()).filter((id) => !nodesBefore.includes(id));
      assert.equal(added.length, 1, 'узел не поставлен');
      const point = await e.nodePoint(added[0]);
      assert.ok(near(point.x, empty.x, 2) && near(point.y, empty.y, 2), 'узел не в точке меню');
      await e.key('z', { modifiers: MOD.ctrl });
    });

    await step('меню перехода на другой этаж: смена типа и отмена', async () => {
      const row = await e.transitionRowPoint('a1_lift|a2_lift');
      await e.click(row.x, row.y, { button: 'right' });
      let [menu] = await e.menus();
      assert.ok(menu.label.startsWith('Лифт'), menu.label);
      assert.deepEqual(menu.checked, ['Лифт']);
      await e.menuPick('Лестница');

      const again = await e.transitionRowPoint('a1_lift|a2_lift');
      await e.click(again.x, again.y, { button: 'right' });
      [menu] = await e.menus();
      assert.deepEqual(menu.checked, ['Лестница'], 'тип не сменился');
      await e.key('Escape', { keyCode: 27 });
      await e.key('z', { modifiers: MOD.ctrl });
    });

    await step('щелчок по отметке перехода ведёт к другому концу', async () => {
      const row = await e.transitionRowPoint('a1_stairs|a2_stairs');
      await e.click(row.x, row.y);
      await page.waitFor(`document.querySelector('footer[aria-label="Строка состояния"]')?.textContent.includes('Этаж 2')`);
      await page.sleep(400);
      assert.equal(await e.propertiesNodeId(), 'a2_stairs');
      assert.ok((await e.nodeIds()).includes('a2_stairs'));
      await shot('editor-other-end');
    });
  },
};
