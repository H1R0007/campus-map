import { strict as assert } from 'node:assert';
import path from 'node:path';
import { MOD, editorHelpers } from '../editor.mjs';
import { repoRoot } from '../../lib/vite-server.mjs';

/**
 * Редактор: мастерская листов во весь экран (запись 80).
 *
 * Лист приближают колесом под курсором и двигают, как карту; ручки при этом
 * не растут, а приближенная часть дорисовывается крупно. На линии контура
 * «+» ставит угол, Delete убирает выбранный, стрелки двигают; Ctrl+Z
 * отменяет правку листа. Enter — лист готов, дальше следующий; Escape
 * сначала снимает выбор угла, а сделанное не бросает без вопроса.
 */

const fixtures = path.join(repoRoot, 'tooling/browser/fixtures/plans');

export default {
  app: 'editor',
  name: 'редактор: мастерская листов',
  isolatedData: true,

  async run({ page, base, step, shot }) {
    await page.viewport(1600, 950, 1);
    const e = editorHelpers(page, base);
    const rect = (selector, index = 0) =>
      page.eval(`(() => {
        const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
    const crop = async () => (await page.eval(`document.querySelector('.editor-crop__box')?.dataset.crop ?? ''`)).split(',').map(Number);
    const outline = async () =>
      (await page.eval(`document.querySelector('.editor-outline')?.dataset.outline ?? ''`))
        .split(' ')
        .filter(Boolean)
        .map((corner) => corner.split('~')[0].split(',').map(Number));
    const percent = async () => Number((await page.eval(`document.querySelector('.editor-workshop__percent').textContent`)).replace(/\D/g, ''));
    const current = () => page.eval(`document.querySelector('.editor-import__item[aria-current="true"] .editor-import__name')?.textContent ?? ''`);
    const choose = async (name) => {
      await page.eval(`[...document.querySelectorAll('.editor-import__item')].find((b) => b.querySelector('.editor-import__name').textContent === ${JSON.stringify(name)}).click()`);
      await page.waitFor(`!!document.querySelector('.editor-crop__image-canvas')`, 30_000);
      await page.sleep(300);
    };
    const pressInDialog = async (label) => {
      const ok = await page.eval(`(() => {
        const b = [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)}) && !b.disabled);
        if (!b) return false;
        b.click();
        return true;
      })()`);
      assert.ok(ok, `в мастерской нет кнопки «${label}»`);
      await page.sleep(300);
    };
    const wheel = async (x, y, deltaY) => {
      await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
      await page.sleep(150);
    };
    const ctrl = (letter, shift = false) => e.key(letter, { code: `Key${letter.toUpperCase()}`, modifiers: MOD.ctrl | (shift ? MOD.shift : 0) });

    await step('мастерская во весь экран: листы, лист, свойства', async () => {
      await e.open();
      await e.mode('Планы и корпуса');
      await e.press('Загрузить планы…');
      const { root } = await page.send('DOM.getDocument', { depth: 1 });
      const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[data-import-files]' });
      await page.send('DOM.setFileInputFiles', { nodeId, files: ['korpus-A-plany.pdf', 'korpus-B-etazh-2.png'].map((name) => path.join(fixtures, name)) });
      await page.waitFor(`document.querySelectorAll('.editor-import__item').length === 5`, 30_000);
      await page.waitFor(`[...document.querySelectorAll('.editor-import__thumb')].every((t) => t.querySelector('img'))`, 30_000);
      const workshop = await rect('.editor-workshop');
      assert.deepEqual([workshop.left, workshop.top, workshop.width, workshop.height], [0, 0, 1600, 950], 'мастерская не во весь экран');
      // Фокус — на листе: клавиши мастерской работают сразу.
      assert.ok(await page.eval(`document.activeElement?.classList.contains('editor-workshop__canvas')`), 'фокус не на листе');
      assert.match(await page.eval(`document.querySelector('.editor-workshop__progress').textContent`), /Проверено 0 из 4/);
    });

    await step('колесо приближает под курсором, ручки не растут, лист дорисован крупно', async () => {
      await choose('korpus-A-plany.pdf, лист 1');
      assert.equal(await percent(), 100);
      const handle = await rect('.editor-crop__handle--se');
      const image = await rect('.editor-crop__image');
      // Точка листа под курсором — в долях листа.
      const at = { x: image.left + image.width * 0.3, y: image.top + image.height * 0.4 };
      await wheel(at.x, at.y, -500);
      await wheel(at.x, at.y, -500);
      const zoomed = await rect('.editor-crop__image');
      assert.ok(zoomed.width > image.width * 4, `лист не приблизился: ${image.width} → ${zoomed.width}`);
      assert.ok(Math.abs((at.x - zoomed.left) / zoomed.width - 0.3) < 0.002, 'точка ушла из-под курсора по горизонтали');
      assert.ok(Math.abs((at.y - zoomed.top) / zoomed.height - 0.4) < 0.002, 'точка ушла из-под курсора по вертикали');
      assert.ok((await percent()) > 400, `масштаб ${await percent()} %`);
      const handleAfter = await rect('.editor-crop__handle--se');
      assert.ok(handleAfter === null || Math.abs(handleAfter.width - handle.width) < 0.5, 'ручка выросла вместе с листом');
      assert.ok(handle.width <= 12, `ручка рамки ${handle.width} px — крупная`);

      // Видимая часть — дорисована в крупности экрана, а не растянута.
      await page.waitFor(`!!document.querySelector('.editor-workshop__detail-canvas')`, 10_000);
      const sharp = await page.eval(`(() => {
        const c = document.querySelector('.editor-workshop__detail-canvas');
        return c.width / c.getBoundingClientRect().width;
      })()`);
      assert.ok(sharp > 0.95, `видимая часть растянута: ${sharp}`);
      await shot('editor-workshop-zoomed');

      // 0 — весь лист.
      await e.key('0', { code: 'Digit0', keyCode: 48 });
      assert.equal(await percent(), 100);
    });

    await step('пустое место двигает лист; рамку отменяет Ctrl+Z и возвращает Ctrl+Y', async () => {
      const before = await rect('.editor-crop__image');
      const canvas = await rect('.editor-workshop__canvas');
      // Поле вокруг листа — пустое место: тянут — лист едет.
      await e.drag(canvas.left + 12, canvas.top + 12, canvas.left + 92, canvas.top + 52);
      const moved = await rect('.editor-crop__image');
      assert.ok(Math.abs(moved.left - before.left - 80) < 1 && Math.abs(moved.top - before.top - 40) < 1, 'лист не поехал за мышью');
      await e.key('0', { code: 'Digit0', keyCode: 48 });

      const start = await crop();
      const east = await rect('.editor-crop__handle--e');
      await e.drag(east.x, east.y, east.x - 80, east.y);
      const narrowed = await crop();
      assert.ok(narrowed[2] < start[2] - 30, `рамка не сузилась: ${start} → ${narrowed}`);
      await ctrl('z');
      assert.deepEqual(await crop(), start, 'Ctrl+Z не вернул рамку');
      await ctrl('y');
      assert.deepEqual(await crop(), narrowed, 'Ctrl+Y не повторил');
      await ctrl('z');
      assert.deepEqual(await crop(), start);
    });

    await step('контур: «+» на линии ставит угол, стрелки двигают, Delete убирает, Ctrl+Z возвращает', async () => {
      await pressInDialog('Контур');
      assert.equal((await outline()).length, 4);
      const [a, b] = [await rect('.editor-outline__corner', 0), await rect('.editor-outline__corner', 1)];
      // Наведённая линия показывает «+» — не у угла и не у середины.
      const at = { x: a.x + (b.x - a.x) * 0.3, y: a.y + (b.y - a.y) * 0.3 + 3 };
      await e.mouse('mouseMoved', at.x, at.y);
      await page.sleep(150);
      assert.ok(await page.eval(`!!document.querySelector('.editor-outline__add')`), 'нет «+» на линии');
      await e.click(at.x, at.y);
      const added = await outline();
      assert.equal(added.length, 5, 'щелчок по «+» не поставил угол');
      assert.equal(await page.eval(`document.querySelectorAll('.editor-outline__corner[aria-pressed="true"]').length`), 1, 'новый угол не выбран');
      const corner = added[1];
      const [ax, bx] = [added[0][0], added[2][0]];
      assert.ok(Math.abs((corner[0] - ax) / (bx - ax) - 0.3) < 0.05, `угол не там, где щёлкнули: ${added.join(' ')}`);
      assert.ok(await page.eval(`document.querySelector('.editor-outline__corner[aria-pressed="true"]').getBoundingClientRect().width`) <= 12, 'угол — крупная ручка');

      await e.key('ArrowDown', { modifiers: MOD.shift });
      const lowered = await outline();
      assert.ok(lowered[1][1] > corner[1] + 3, `стрелка не сдвинула угол: ${corner} → ${lowered[1]}`);
      await shot('editor-workshop-corner');
      await e.key('Delete');
      assert.equal((await outline()).length, 4, 'Delete не убрал выбранный угол');

      await ctrl('z');
      assert.deepEqual(await outline(), lowered, 'Ctrl+Z не вернул угол');
      await ctrl('z');
      assert.deepEqual(await outline(), added, 'Ctrl+Z не вернул угол на место');
      await ctrl('z');
      assert.equal((await outline()).length, 4, 'Ctrl+Z не убрал поставленный угол');

      // Escape сначала снимает выбор угла — мастерская остаётся.
      await e.click(at.x, at.y);
      await e.key('Escape', { keyCode: 27 });
      assert.equal(await page.eval(`document.querySelectorAll('.editor-outline__corner[aria-pressed="true"]').length`), 0, 'Escape не снял выбор');
      assert.ok(await page.eval(`!!document.querySelector('.editor-workshop') && !document.querySelector('[role="alertdialog"]')`), 'Escape закрыл мастерскую');
    });

    await step('Enter — лист готов, дальше следующий; PageDown и PageUp — соседние', async () => {
      await page.eval(`document.querySelector('.editor-workshop__canvas').focus()`);
      await e.key('Enter', { text: '\r' });
      assert.equal(await current(), 'korpus-A-plany.pdf, лист 2');
      assert.ok(
        await page.eval(`[...document.querySelectorAll('.editor-import__item')][0].classList.contains('editor-import__item--done')`),
        'лист 1 не отмечен проверенным'
      );
      assert.match(await page.eval(`document.querySelector('.editor-workshop__progress').textContent`), /Проверено 1 из 4/);

      // Номер этажа и Enter — лист готов прямо из поля.
      await page.eval(`document.querySelector('[aria-label="Номер этажа"]').focus()`);
      await e.key('Enter', { text: '\r' });
      assert.equal(await current(), 'korpus-A-plany.pdf, лист 3');

      await e.key('PageDown');
      assert.equal(await current(), 'korpus-A-plany.pdf, лист 4');
      await e.key('PageUp');
      await e.key('PageUp');
      assert.equal(await current(), 'korpus-A-plany.pdf, лист 2');
      await shot('editor-workshop-progress');
    });

    await step('клавиши карты молчат, пока мастерская открыта, даже без фокуса', async () => {
      await page.eval(`document.activeElement?.blur()`);
      await e.key('F1', { keyCode: 112 });
      assert.ok(
        !(await page.eval(`[...document.querySelectorAll('[role="dialog"]')].some((d) => /Как работать/.test(d.getAttribute('aria-label') ?? d.textContent))`)),
        'клавиша карты сработала за мастерской: открылась справка'
      );
    });

    await step('Escape не бросает сделанное без вопроса', async () => {
      await e.key('Escape', { keyCode: 27 });
      assert.match(await page.eval(`document.querySelector('[role="alertdialog"]')?.textContent ?? ''`), /Закрыть мастерскую\?/);
      await e.key('Escape', { keyCode: 27 });
      assert.ok(await page.eval(`!document.querySelector('[role="alertdialog"]') && !!document.querySelector('.editor-workshop')`), 'Escape на вопросе закрыл мастерскую');
      await e.key('Escape', { keyCode: 27 });
      await pressInDialog('Закрыть без добавления');
      await page.waitFor(`!document.querySelector('.editor-workshop')`, 10_000);
    });
  },
};
