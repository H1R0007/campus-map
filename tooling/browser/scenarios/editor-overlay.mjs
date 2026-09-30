import { strict as assert } from 'node:assert';
import { editorHelpers } from '../editor.mjs';

/**
 * Редактор: наложение планов, булавка и пошаговые панели (записи 62–64).
 *
 * План, который размещают, лежит целиком, эталон — красными линиями поверх;
 * точки на это время убраны. Щелчок по карте ставит булавку, оранжевая ручка
 * доворачивает план вокруг неё. Шторка делит карту, пробел оставляет только
 * эталон. Операция — пошаговой панелью справа.
 */
export default {
  app: 'editor',
  name: 'редактор: наложение и булавка',

  async run({ page, base, step, shot }) {
    await page.viewport(1600, 900, 1);
    const e = editorHelpers(page, base);
    const count = (selector) => page.eval(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
    const currentStep = () => page.eval(`document.querySelector('.editor-steps__item[aria-current="step"] .editor-steps__title')?.textContent.trim() ?? ''`);
    const show = (label) =>
      page.eval(`[...document.querySelectorAll('[aria-label="Как показывать эталон"] button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)}).click()`);
    const footer = (label) =>
      page.eval(`[...document.querySelectorAll('.editor-operation__footer button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)}).click()`);
    const rotation = () => page.eval(`document.querySelector('input[aria-label="Поворот"]')?.value ?? ''`);

    await step('размещение: точки убраны, план целиком, территория — линиями поверх', async () => {
      await e.open();
      assert.ok((await count('path[data-node-id]')) > 0, 'точек нет и до размещения');
      await e.mode('Планы и корпуса');
      await e.press('Изменить размещение: Корпус А');
      await page.waitFor(`!!document.querySelector('img.editor-reference-lines')`, 15_000);
      assert.equal(await count('path[data-node-id]'), 0, 'точки остались на карте во время размещения');
      const opacity = await page.eval(`getComputedStyle(document.querySelector('.editor-placing-plan')).opacity`);
      assert.equal(opacity, '1', 'план размещают полупрозрачным');
      assert.equal(await currentStep(), 'Приблизительно');
      await shot('editor-overlay-lines');
    });

    await step('булавка: щелчок по углу, ручка доворачивает план вокруг неё', async () => {
      const corner = await page.eval(`(() => {
        const r = document.querySelector('.editor-placing-plan').getBoundingClientRect();
        return { x: r.left + 3, y: r.bottom - 3 };
      })()`);
      await e.click(corner.x, corner.y);
      assert.equal(await count('.editor-place-pin'), 1, 'булавка не встала');
      assert.equal(await currentStep(), 'Довернуть');
      assert.equal(await count('.editor-place-handle--move'), 0, 'ручка сдвига осталась при булавке');
      const pinBefore = await e.rect('.editor-place-pin');
      const before = await rotation();

      const turn = await e.rect('.editor-place-handle--turn');
      await e.drag(turn.left + turn.width / 2, turn.top + turn.height / 2, turn.left + turn.width / 2 + 30, turn.top + turn.height / 2 - 70);
      assert.notEqual(await rotation(), before, 'план не повернулся');
      const pinAfter = await e.rect('.editor-place-pin');
      assert.ok(Math.abs(pinAfter.left - pinBefore.left) < 1 && Math.abs(pinAfter.top - pinBefore.top) < 1, 'булавка сдвинулась при довороте');
      await shot('editor-overlay-pin');

      await e.press('Открепить булавку');
      assert.equal(await count('.editor-place-pin'), 0, 'булавка не открепилась');
      assert.equal(await count('.editor-place-handle--move'), 1, 'ручка сдвига не вернулась');
    });

    await step('шторка обрезает план по черте, пробел оставляет только эталон', async () => {
      await show('Шторка');
      await page.sleep(300);
      assert.equal(await count('img.editor-reference-lines'), 0, 'линии остались при шторке');
      assert.equal(await count('.editor-swipe'), 1, 'нет черты шторки');
      const clip = () => page.eval(`document.querySelector('.leaflet-editorPlacing-pane')?.style.clipPath ?? ''`);
      const before = await clip();
      assert.match(before, /polygon/, 'план не обрезан шторкой');
      const divider = await e.rect('.editor-swipe__handle');
      await e.drag(divider.left + divider.width / 2, divider.top + divider.height / 2, divider.left - 120, divider.top + divider.height / 2);
      assert.notEqual(await clip(), before, 'черта шторки не двигается');
      await shot('editor-overlay-swipe');

      await show('Линии');
      await page.waitFor(`!!document.querySelector('img.editor-reference-lines')`, 10_000);
      assert.equal(await clip(), '', 'обрезка осталась после шторки');

      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await page.sleep(300);
      assert.equal(await count('.editor-placing-plan'), 0, 'пробел не спрятал план');
      assert.equal(await count('img.editor-reference-lines'), 0, 'пробел не спрятал линии');
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await page.sleep(300);
      assert.equal(await count('.editor-placing-plan'), 1, 'план не вернулся после пробела');

      await footer('Отмена');
      await page.sleep(300);
      assert.ok((await count('path[data-node-id]')) > 0, 'точки не вернулись после размещения');
    });

    await step('совмещение этажа: по умолчанию контур этажа входа, «Все стены» — другая картинка', async () => {
      await e.openFloor('Корпус А', 2);
      await e.press('Совместить с этажом входа…');
      await page.waitFor(`!!document.querySelector('img.editor-reference-lines')`, 15_000);
      const pressed = () => page.eval(`document.querySelector('[aria-label="Как показывать эталон"] [aria-checked="true"]')?.textContent.trim()`);
      assert.equal(await pressed(), 'Контур');
      const contour = await page.eval(`document.querySelector('img.editor-reference-lines').src`);
      await show('Все стены');
      await page.waitFor(`document.querySelector('img.editor-reference-lines')?.src !== ${JSON.stringify(contour)}`, 15_000);
      await shot('editor-overlay-floor');
      await footer('Отмена');
    });

    await step('замер масштаба — пошагово справа, точки убраны', async () => {
      await e.press('Территория');
      await e.press('Уточнить масштаб…');
      assert.equal(await count('path[data-node-id]'), 0, 'точки на карте во время замера');
      assert.equal(await currentStep(), 'Первое место');
      const map = await e.rect('.leaflet-container');
      await e.click(map.left + 200, map.top + 200);
      assert.equal(await currentStep(), 'Второе место');
      await footer('Отмена');
    });
  },
};
