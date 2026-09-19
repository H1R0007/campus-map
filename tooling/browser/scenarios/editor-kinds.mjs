import { strict as assert } from 'node:assert';
import { MOD, editorHelpers } from '../editor.mjs';

/**
 * Редактор: виды точек — заготовки разметчика.
 *
 * Владелец просил, чтобы разметчик заводил свои виды сам: заранее неизвестно,
 * какие понадобятся с официальными планами. Вид выбирается цифрой и держится,
 * новый вид появляется в палитре и в данных, а отмена возвращает каталог как
 * было.
 */
export default {
  app: 'editor',
  name: 'редактор: виды точек',

  async run({ page, base, step, shot }) {
    await page.viewport(1600, 900, 1);
    const e = editorHelpers(page, base);

    const palette = () =>
      page.eval(`[...document.querySelectorAll('[aria-label="Вид точки"] button')].map((b) => b.textContent.trim())`);
    /** Сколько правок сделано — по строке состояния. */
    const edits = async () => Number((await e.status()).match(/Правок: (\d+)/)?.[1] ?? -1);
    const activeKind = () =>
      page.eval(
        `document.querySelector('[aria-label="Вид точки"] button[aria-pressed="true"]')?.textContent.trim() ?? null`
      );

    await step('палитра видов появляется у инструмента «Узел», цифра выбирает вид', async () => {
      await e.open();
      await e.openFloor('Корпус А', 1);

      await e.press('Узел (N)');
      const kinds = await palette();
      assert.ok(kinds.includes('Коридор') && kinds.includes('Помещение'), `в палитре: ${JSON.stringify(kinds)}`);
      await shot('editor-kinds');

      await e.key('1', { code: 'Digit1' });
      assert.equal(await activeKind(), 'Коридор', 'цифра не выбрала первый вид');

      // Цифра работает и из другого инструмента: разметчик не должен сперва
      // возвращаться к «Узлу».
      await e.press('Выбор (V)');
      assert.equal(await e.tool(), 'Выбор');
      await e.key('2', { code: 'Digit2' });
      assert.equal(await e.tool(), 'Узел', 'цифра должна брать инструмент, которым ставят точки');
      assert.equal(await activeKind(), 'Помещение');
    });

    await step('свой вид заводится в редакторе и попадает в палитру', async () => {
      await e.press('Все виды…');
      assert.equal(
        await page.eval(`document.querySelector('[role="dialog"]')?.querySelector('h2')?.textContent.trim()`),
        'Виды точек'
      );

      await e.press('Создать вид');
      await page.eval(`document.querySelector('[aria-label="Название вида"]').focus()`);
      await e.type('Лаборатория');
      await e.press('Добавить вид');
      await shot('editor-kinds-new');

      await e.key('Escape', { keyCode: 27 });
      const kinds = await palette();
      assert.ok(kinds.includes('Лаборатория'), `нового вида нет в палитре: ${JSON.stringify(kinds)}`);
      assert.equal(await activeKind(), 'Лаборатория', 'созданный вид сразу не выбран');
    });

    await step('щелчок кистью «Туалет» ставит точку с названием, связью и видом места', async () => {
      await e.press('Узел (N)');
      await e.key('3', { code: 'Digit3' });
      assert.equal(await activeKind(), 'Туалет');

      const before = await e.nodeIds();
      const editsBefore = await edits();
      const empty = await e.emptyMapPoint();
      await e.click(empty.x, empty.y);

      const added = (await e.nodeIds()).filter((id) => !before.includes(id));
      assert.equal(added.length, 1, 'точка не поставлена');
      assert.equal(await edits(), editsBefore + 1, 'один щелчок — одна правка в истории');
      assert.equal(await e.propertiesNodeId(), added[0], 'поставленная точка не выбрана');
      assert.match(await e.panelSection('Названия'), /Туалет/, 'вид не дал названия');
      assert.match(await e.panelSection('Связи'), /Связи \(1\)/, 'точка не прицепилась к ближайшей');
      assert.equal(
        await page.eval(`document.querySelector('[aria-label="Вид места"] button[aria-pressed="true"]')?.textContent.trim()`),
        'Туалет',
        'вид места для навигатора не поставлен'
      );

      // Одна отмена убирает всё, что сделал один щелчок.
      await e.key('z', { modifiers: MOD.ctrl });
      assert.deepEqual(await e.nodeIds(), before, 'отмена оставила половину работы');
      assert.equal(await edits(), editsBefore, 'одна отмена должна убрать весь щелчок');
    });

    await step('кисть «Помещение» просит только номер: начало названия уже подставлено', async () => {
      await e.key('2', { code: 'Digit2' });
      const before = await e.nodeIds();
      const empty = await e.emptyMapPoint(90);
      await e.click(empty.x, empty.y);

      assert.equal(await page.eval(`document.activeElement?.getAttribute('aria-label')`), 'Новое название');
      assert.equal(await page.eval(`document.activeElement?.value`), 'А-1', 'начало названия не подставлено');
      await e.type('07');
      await e.key('Enter');
      assert.match(await e.panelSection('Названия'), /А-107/);

      await page.eval('document.activeElement?.blur()');
      await e.key('z', { modifiers: MOD.ctrl });
      await e.key('z', { modifiers: MOD.ctrl });
      assert.deepEqual(await e.nodeIds(), before);
    });

    await step('номер, набранный после щелчка кистью, не теряется от щелчка по следующей двери', async () => {
      // Разметчик дописывает номер и сразу щёлкает по следующей двери, без
      // Enter. Прежде набранное пропадало вместе с карточкой первой точки.
      await e.key('2', { code: 'Digit2' });
      const before = await e.nodeIds();
      const first = await e.emptyMapPoint(90);
      await e.click(first.x, first.y);
      await e.type('07');
      const second = await e.emptyMapPoint(40);
      await e.click(second.x, second.y);

      const added = (await e.nodeIds()).filter((id) => !before.includes(id));
      assert.equal(added.length, 2, 'вторая дверь не поставлена');
      await page.eval('document.activeElement?.blur()');

      // Карточка второй двери: нетронутое начало «А-1» названием не стало.
      assert.equal(await e.propertiesNodeId(), added[1]);
      assert.match(await e.panelSection('Названия'), /Названия \(0\)/, 'нетронутое «А-1» стало названием');

      // Первая дверь получила набранный номер: поиск его находит.
      await e.key('f', { modifiers: MOD.ctrl });
      await e.type('А-107');
      await page.sleep(200);
      const found = await page.eval(`[...document.querySelectorAll('[role="option"]')].map((o) => o.textContent.trim())`);
      assert.match(found[0] ?? '', /^А-107/, `номер потерялся, найдено: ${JSON.stringify(found.slice(0, 3))}`);
      await e.key('Escape', { keyCode: 27 });

      for (let i = 0; i < 3; i++) await e.key('z', { modifiers: MOD.ctrl });
      assert.deepEqual(await e.nodeIds(), before, 'отмена не убрала обе двери и название');
      await e.key('Escape', { keyCode: 27 });
    });

    await step('кисть «Лестница» ставит точки на всех этажах и связывает их переходами', async () => {
      await e.key('6', { code: 'Digit6' });
      assert.equal(await activeKind(), 'Лестница');

      // Что было на соседнем этаже до щелчка: с ним и сравним стопку.
      await e.key('PageUp');
      const upstairsBefore = await e.nodeIds();
      await e.key('PageDown');

      const before = await e.nodeIds();
      const editsBefore = await edits();
      const empty = await e.emptyMapPoint(120);
      await e.click(empty.x, empty.y);
      assert.equal(await edits(), editsBefore + 1, 'стопка — одна правка в истории');

      const added = (await e.nodeIds()).filter((id) => !before.includes(id));
      assert.equal(added.length, 1, 'на открытом этаже должна появиться одна точка');
      const keys = await e.transitionKeys();
      assert.ok(
        keys.some((key) => key.includes(added[0])),
        `переход от новой лестницы не создан: ${JSON.stringify(keys)}`
      );

      await e.key('PageUp');
      assert.match(await e.place(), /Этаж 2/);
      const newUpstairs = (await e.nodeIds()).filter((id) => !upstairsBefore.includes(id));
      assert.equal(newUpstairs.length, 1, 'на втором этаже лестницы нет');
      await shot('editor-kinds-stack');

      // Одна отмена убирает всю стопку вместе с переходами.
      await e.key('z', { modifiers: MOD.ctrl });
      assert.deepEqual(await e.nodeIds(), upstairsBefore, 'отмена оставила точки стопки на других этажах');
      await e.key('PageDown');
      assert.deepEqual(await e.nodeIds(), before);
      assert.equal(await edits(), editsBefore, 'одна отмена должна убрать всю стопку');
    });

    await step('кисть «Коридор» ведёт линию: каждая точка связана с предыдущей', async () => {
      await e.key('1', { code: 'Digit1' });
      assert.equal(await activeKind(), 'Коридор');

      const before = await e.nodeIds();
      const start = await e.emptyMapPoint(150);
      const step = 60;
      await e.click(start.x, start.y);
      await e.click(start.x + step, start.y);

      // Третья точка ставится вплотную к чужой точке плана: линия обязана
      // продолжиться от предыдущей точки, а не прилипнуть к соседней.
      const neighbour = await e.nodePoint('a1_corridor_3');
      await e.click(neighbour.x + 18, neighbour.y + 18);

      const added = (await e.nodeIds()).filter((id) => !before.includes(id));
      assert.equal(added.length, 3, 'поставлены не все точки линии');

      const links = await page.eval(`[...document.querySelectorAll('path[data-edge]')].map((p) => p.dataset.edge)`);
      const between = (a, b) => links.some((key) => key.includes(a) && key.includes(b));
      assert.ok(between(added[0], added[1]), 'вторая точка не связана с первой');
      assert.ok(between(added[1], added[2]), 'третья точка не продолжила линию');
      assert.ok(!between(added[2], 'a1_corridor_3'), 'третья точка прилипла к чужой точке вместо линии');

      // Пока линия ведётся, строка над картой так и говорит.
      assert.match(await e.toolbar(), /Ведём линию/, 'редактор не показывает, что линия ведётся');

      // Enter заканчивает линию: следующая точка начинает новую.
      await e.key('Enter', { keyCode: 13 });
      assert.doesNotMatch(await e.toolbar(), /Ведём линию/, 'Enter не закончил линию');
      await e.click(start.x + 3 * step, start.y - 60);
      const afterEnter = (await e.nodeIds()).filter((id) => !before.includes(id) && !added.includes(id));
      assert.equal(afterEnter.length, 1);

      await shot('editor-kinds-chain');
      for (let i = 0; i < 4; i++) await e.key('z', { modifiers: MOD.ctrl });
      assert.deepEqual(await e.nodeIds(), before, 'отмена не убрала линию по точке за раз');
    });

    await step('новая точка встаёт в один ряд с соседней, Alt ставит как есть', async () => {
      await e.key('Escape', { keyCode: 27 });
      const anchor = await e.nodePoint('a1_room101');
      await e.click(anchor.x, anchor.y);
      const anchorX = Number(await e.panelValue('Координата X'));

      // Коридор: у него нет шаблона названия, поле ввода не перехватит фокус.
      await e.key('1', { code: 'Digit1' });
      await e.click(anchor.x + 6, anchor.y + 90);
      assert.equal(
        Number(await e.panelValue('Координата X')),
        anchorX,
        'точка не выровнялась по соседней, хотя целились почти в один ряд'
      );

      await e.key('z', { modifiers: MOD.ctrl });
      await e.key('Escape', { keyCode: 27 });
      await e.click(anchor.x + 6, anchor.y + 90, { modifiers: MOD.alt });
      assert.notEqual(
        Number(await e.panelValue('Координата X')),
        anchorX,
        'Alt должен ставить точку ровно туда, куда щёлкнули'
      );
      await e.key('z', { modifiers: MOD.ctrl });
      await e.key('Escape', { keyCode: 27 });
    });

    await step('Shift+щелчок связывает новую точку с предыдущей — точка внутри кабинета', async () => {
      await e.key('3', { code: 'Digit3' });
      const before = await e.nodeIds();
      const door = await e.emptyMapPoint(150);
      await e.click(door.x, door.y);
      const doorId = (await e.nodeIds()).filter((id) => !before.includes(id))[0];

      // Вторая точка ставится вплотную к чужой точке плана: Shift обязан
      // связать её с дверью, а не с тем, что ближе.
      const neighbour = await e.nodePoint('a1_corridor_3');
      await e.click(neighbour.x + 18, neighbour.y + 18, { modifiers: MOD.shift });
      const inside = (await e.nodeIds()).filter((id) => !before.includes(id) && id !== doorId)[0];
      assert.ok(inside, 'вторая точка не поставлена');

      const links = await page.eval(`[...document.querySelectorAll('path[data-edge]')].map((p) => p.dataset.edge)`);
      assert.ok(
        links.some((key) => key.includes(inside) && key.includes(doorId)),
        'вторая точка связана не с предыдущей поставленной'
      );
      assert.ok(
        !links.some((key) => key.includes(inside) && key.includes('a1_corridor_3')),
        'вторая точка прилипла к ближайшей точке вместо предыдущей'
      );

      await e.key('z', { modifiers: MOD.ctrl });
      await e.key('z', { modifiers: MOD.ctrl });
      assert.deepEqual(await e.nodeIds(), before);
    });

    await step('калька: соседний этаж виден бледно и не ловит щелчки', async () => {
      const ghosts = () => page.eval(`document.querySelectorAll('.editor-ghost-node').length`);
      assert.equal(await ghosts(), 0, 'калька включена без спроса');

      // На первом этаже соседний снизу — не существует, поэтому берём этаж выше.
      await e.toggleFilter('Соседний этаж бледно');
      await page.sleep(400);
      assert.ok((await ghosts()) > 0, 'калька не появилась');

      // Перетаскивание точки своего этажа не перерисовывает кальку: точки
      // соседнего этажа при этом не меняются.
      await e.press('Выбор (V)');
      await page.eval(`(() => {
        window.__touched = new Set();
        window.__obs?.disconnect();
        window.__obs = new MutationObserver((records) => {
          for (const r of records) if (r.type === 'attributes') window.__touched.add(r.target);
        });
        window.__obs.observe(document.querySelector('.leaflet-overlay-pane'), {
          subtree: true,
          attributes: true,
          attributeFilter: ['d', 'points'],
        });
      })()`);
      const room = await e.nodePoint('a1_room101');
      await e.drag(room.x, room.y, room.x + 30, room.y + 18);
      const touched = await page.eval(`(() => {
        const ghosts = [...window.__touched].filter((el) => el.classList.contains('editor-ghost-node') || el.classList.contains('editor-ghost-edge')).length;
        const all = window.__touched.size;
        window.__obs.disconnect();
        return { all, ghosts };
      })()`);
      assert.ok(touched.all > 0, 'перетаскивание ничего не перерисовало — замер не сработал');
      assert.equal(touched.ghosts, 0, `перетаскивание перерисовало кальку: ${touched.ghosts} путей`);
      await e.key('z', { modifiers: MOD.ctrl });


      // Щелчок прямо по бледной точке соседнего этажа попадает в свой этаж:
      // калька ничего не ловит мышью.
      const onGhost = await page.eval(`(() => {
        for (const ghost of document.querySelectorAll('.editor-ghost-node')) {
          const r = ghost.getBoundingClientRect();
          const x = r.x + r.width / 2;
          const y = r.y + r.height / 2;
          // Под бледной точкой не должно быть ни своей точки, ни кнопки:
          // иначе щелчок достанется им, а не карте.
          const stack = document.elementsFromPoint(x, y);
          if (stack.some((el) => el.closest('[data-node-id], [data-edge], button, [role="menu"], .leaflet-control'))) continue;
          return { x, y };
        }
        return null;
      })()`);
      assert.ok(onGhost, 'не нашёл свободной бледной точки для щелчка');

      const before = await e.nodeIds();
      await e.key('1', { code: 'Digit1' });
      await e.click(onGhost.x, onGhost.y);
      const added = (await e.nodeIds()).filter((id) => !before.includes(id));
      assert.equal(added.length, 1, 'щелчок сквозь кальку не поставил точку на своём этаже');
      await e.key('z', { modifiers: MOD.ctrl });
      await e.key('Escape', { keyCode: 27 });

      await shot('editor-kinds-ghost');
      await e.toggleFilter('Соседний этаж бледно');
      await page.sleep(300);
      assert.equal(await ghosts(), 0, 'калька осталась после выключения');
    });

    await step('отмена возвращает каталог видов как было', async () => {
      await e.key('z', { modifiers: MOD.ctrl });
      const kinds = await palette();
      assert.ok(!kinds.includes('Лаборатория'), `отмена не убрала вид: ${JSON.stringify(kinds)}`);
      assert.match(await e.notice(), /Отменено/);
      assert.match(await e.status(), /Сохранено/, 'после отмены правок быть не должно');
    });
  },
};
