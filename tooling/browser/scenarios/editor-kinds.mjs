import { strict as assert } from 'node:assert';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
      // Лестница, лифт и вход — переходы: их ставит инструмент «Переход».
      assert.ok(
        !kinds.some((name) => /Лестница|Лифт|Вход/.test(name)),
        `переходы попали в кисти мест: ${JSON.stringify(kinds)}`
      );
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
      const form = await page.eval(`(() => {
        const dialog = document.querySelector('[role="dialog"]');
        return {
          text: dialog.textContent,
          inputs: [...dialog.querySelectorAll('input:not([type]), input[type="text"]')].map((input) => ({
            label: input.getAttribute('aria-label'),
            width: input.getBoundingClientRect().width,
          })),
        };
      })()`);
      assert.ok(!/перехода|Шаблон названия|\{номер\}/.test(form.text), 'в окне видов остались переходы или шаблон со скобками');
      for (const input of form.inputs) {
        assert.ok(input.width >= 200, `поле «${input.label}» сжато до ${Math.round(input.width)} px`);
      }

      await page.eval(`document.querySelector('[aria-label="Название вида"]').focus()`);
      await e.type('Лаборатория');
      await page.eval(`document.querySelector('[aria-label="Название по-английски"]').focus()`);
      await e.type('Laboratory');

      // Значок — из библиотеки, поиском по-русски.
      await e.press('Выбрать значок…');
      await page.waitFor(`document.querySelectorAll('.editor-icon-picker .editor-icon-choice').length > 50`, 15000);
      await page.eval(`document.querySelector('[aria-label="Найти значок"]').focus()`);
      await e.type('лаборатория');
      const found = await page.eval(
        `[...document.querySelectorAll('.editor-icon-picker .editor-icon-choice')].map((b) => b.getAttribute('aria-label'))`
      );
      assert.ok(found.includes('Лаборатория'), `поиск значков по-русски: ${JSON.stringify(found)}`);
      await page.eval(`document.querySelector('.editor-icon-picker [aria-label="Лаборатория"]').click()`);
      await page.sleep(300);
      assert.equal(await page.eval(`Boolean(document.querySelector('.editor-icon-picker'))`), false, 'выбор значка не закрылся');
      const chosen = () => page.eval(`document.querySelector('.editor-icon-pick .editor-kind-icon')?.style.maskImage ?? ''`);
      assert.match(await chosen(), /data:image\/svg\+xml/, 'значок вида не выбран');

      // Свой значок: SVG очищается от всего, что может выполняться.
      const svgPath = path.join(os.tmpdir(), `campus-custom-icon-${process.pid}.svg`);
      writeFileSync(
        svgPath,
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" onload="alert(1)"><script>alert(2)</script><circle id="custom-mark" cx="12" cy="12" r="9"/></svg>'
      );
      await e.press('Сменить значок…');
      await page.waitFor(`!!document.querySelector('.editor-icon-picker')`);
      const { root } = await page.send('DOM.getDocument', { depth: 0 });
      const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[aria-label="Файл своего значка"]' });
      await page.send('DOM.setFileInputFiles', { nodeId, files: [svgPath] });
      await page.waitFor(`!document.querySelector('.editor-icon-picker')`, 5000);
      const custom = decodeURIComponent(await chosen());
      assert.ok(custom.includes('custom-mark'), 'свой значок не встал');
      assert.ok(!/script|onload|alert/.test(custom), `в своём значке осталось исполняемое: ${custom.slice(0, 200)}`);

      await page.eval(`document.querySelector('[aria-label="Слова для поиска"]').focus()`);
      await e.type('лаба, lab');
      assert.equal(
        await page.eval(`[...document.querySelectorAll('[role="dialog"] label')].find((l) => l.textContent.includes('Место для быстрого поиска'))?.querySelector('input')?.checked`),
        true,
        'новый вид — не место быстрого поиска'
      );
      await e.press('Добавить вид');
      await shot('editor-kinds-new');

      await e.key('Escape', { keyCode: 27 });
      const kinds = await palette();
      assert.ok(kinds.includes('Лаборатория'), `нового вида нет в палитре: ${JSON.stringify(kinds)}`);
      assert.equal(await activeKind(), 'Лаборатория', 'созданный вид сразу не выбран');

      // Всё, что задано в окне, сохранилось у вида: откроем его заново.
      await e.press('Все виды…');
      await e.press('Изменить вид «Лаборатория»');
      const saved = await page.eval(`({
        en: document.querySelector('[aria-label="Название по-английски"]')?.value,
        terms: document.querySelector('[aria-label="Слова для поиска"]')?.value,
      })`);
      assert.deepEqual(saved, { en: 'Laboratory', terms: 'лаба, lab' }, 'английское название или слова поиска не сохранились');
      await e.press('Отмена');
      await e.key('Escape', { keyCode: 27 });

      // «Как у вида»: поставленная точка сразу называется видом.
      const before = await e.nodeIds();
      const empty = await e.emptyMapPoint();
      await e.click(empty.x, empty.y);
      assert.match(await e.panelSection('Названия'), /Лаборатория/, 'точка нового вида осталась без названия');
      await e.key('z', { modifiers: MOD.ctrl });
      assert.deepEqual(await e.nodeIds(), before);
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

    await step('«Переход»: щелчок по пустому месту ставит лестницу на всех этажах, связанных переходами', async () => {
      await e.press('Переход (T)');
      await e.press('Лестница');
      assert.match(await e.toolbar(), /сразу на всех этажах/, 'подсказка не говорит, что делает щелчок по пустому месту');

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

      // Вход ставится только вручную: щелчок по пустому месту объясняет как.
      await e.press('Вход');
      const empty2 = await e.emptyMapPoint(120);
      await e.click(empty2.x, empty2.y);
      assert.deepEqual(await e.nodeIds(), before, 'вход поставлен стопкой, хотя его ставят вручную');
      assert.match(await e.notice(), /вручную/);
      await e.press('Узел (N)');
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

    await step('удаление вида, у которого есть точки, — только после предупреждения', async () => {
      // Владелец: удаление с предупреждением — «это ОЧЕНЬ важно».
      await e.press('Узел (N)');
      await page.eval(`[...document.querySelectorAll('[aria-label="Вид точки"] button')].find((b) => b.textContent.trim() === 'Лаборатория').click()`);
      assert.equal(await activeKind(), 'Лаборатория');
      const before = await e.nodeIds();
      const empty = await e.emptyMapPoint();
      await e.click(empty.x, empty.y);
      const lab = (await e.nodeIds()).find((id) => !before.includes(id));
      assert.ok(lab, 'точка вида не поставлена');
      await page.eval('document.activeElement?.blur()');

      const kindsInDialog = () =>
        page.eval(`[...document.querySelectorAll('[aria-label="Виды точек"] .editor-list__name')].map((n) => n.textContent.trim())`);
      await e.press('Все виды…');
      await e.press('Удалить вид «Лаборатория»');
      const warning = await page.eval(`document.querySelector('.editor-list__confirm')?.textContent ?? ''`);
      assert.match(warning, /У 1 точки вид «Лаборатория»/, `нет предупреждения: ${warning}`);
      assert.ok((await kindsInDialog()).includes('Лаборатория'), 'вид удалён до подтверждения');

      await e.press('Не удалять');
      assert.ok((await kindsInDialog()).includes('Лаборатория'), '«Не удалять» удалило вид');

      await e.press('Удалить вид «Лаборатория»');
      await e.press('Удалить вид');
      assert.ok(!(await kindsInDialog()).includes('Лаборатория'), 'вид не удалён после подтверждения');
      await e.key('Escape', { keyCode: 27 });

      // Место осталось без вида: навигатор его «Лабораторией» больше не найдёт.
      await e.press('Выбор (V)');
      const point = await e.nodePoint(lab);
      await e.click(point.x, point.y);
      assert.equal(
        await page.eval(`document.querySelector('[aria-label="Вид места"] button[aria-pressed="true"]')?.textContent.trim()`),
        'Обычное место',
        'у места остался вид, которого больше нет'
      );

      // Одна отмена возвращает и вид, и его место.
      await e.key('Escape', { keyCode: 27 });
      await e.key('z', { modifiers: MOD.ctrl });
      await e.press('Узел (N)');
      assert.ok((await palette()).includes('Лаборатория'), 'отмена не вернула вид');
      await e.press('Выбор (V)');
      await e.click(point.x, point.y);
      assert.equal(
        await page.eval(`document.querySelector('[aria-label="Вид места"] button[aria-pressed="true"]')?.textContent.trim()`),
        'Лаборатория',
        'отмена не вернула вид места у точки'
      );
      await e.key('Escape', { keyCode: 27 });
      await e.key('z', { modifiers: MOD.ctrl });
      assert.deepEqual(await e.nodeIds(), before);
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
