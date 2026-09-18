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

    await step('отмена возвращает каталог видов как было', async () => {
      await e.key('z', { modifiers: MOD.ctrl });
      const kinds = await palette();
      assert.ok(!kinds.includes('Лаборатория'), `отмена не убрала вид: ${JSON.stringify(kinds)}`);
      assert.match(await e.notice(), /Отменено/);
      assert.match(await e.status(), /Сохранено/, 'после отмены правок быть не должно');
    });
  },
};
