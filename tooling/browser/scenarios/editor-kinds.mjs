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

    await step('отмена возвращает каталог видов как было', async () => {
      await e.key('z', { modifiers: MOD.ctrl });
      const kinds = await palette();
      assert.ok(!kinds.includes('Лаборатория'), `отмена не убрала вид: ${JSON.stringify(kinds)}`);
      assert.match(await e.notice(), /Отменено/);
      assert.match(await e.status(), /Сохранено/, 'после отмены правок быть не должно');
    });
  },
};
