import { strict as assert } from 'node:assert';
import path from 'node:path';
import { MOD, editorHelpers } from '../editor.mjs';
import { repoRoot } from '../../lib/vite-server.mjs';

/**
 * Редактор: мастерская листов помогает сама (запись 82).
 *
 * Поля обрезаются без рамки листа, заголовка и штампа — их надписи узнаны
 * по тексту PDF. Область одного листа переносится на остальные листы файла,
 * кроме проверенных; «Область как у листа» берёт её с другого. «Найти
 * контуры на всех листах» обводит непроверенные листы разом.
 */

const fixtures = path.join(repoRoot, 'tooling/browser/fixtures/plans');

export default {
  app: 'editor',
  name: 'редактор: мастерская листов помогает сама',
  isolatedData: true,

  async run({ page, base, step, shot }) {
    await page.viewport(1600, 950, 1);
    const e = editorHelpers(page, base);
    const crop = async () => (await page.eval(`document.querySelector('.editor-crop__box')?.dataset.crop ?? ''`)).split(',').map(Number);
    const hasOutline = () => page.eval(`!!document.querySelector('.editor-outline')`);
    const choose = async (sheet) => {
      await page.eval(`[...document.querySelectorAll('.editor-import__item')].find((b) => b.querySelector('.editor-import__name').textContent === 'korpus-A-plany.pdf, лист ${sheet}').click()`);
      await page.waitFor(`!!document.querySelector('.editor-crop__image-canvas')`, 30_000);
      await page.sleep(300);
    };
    const pressInDialog = async (prefix) => {
      const ok = await page.eval(`(() => {
        const b = [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(prefix)}) && !b.disabled);
        if (!b) return false;
        b.click();
        return true;
      })()`);
      assert.ok(ok, `в мастерской нет кнопки «${prefix}…»`);
      await page.sleep(300);
    };
    const at = async (fx, fy) => {
      const r = await page.eval(`(() => { const b = document.querySelector('.editor-crop__image').getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; })()`);
      return { x: r.l + r.w * fx, y: r.t + r.h * fy };
    };

    await step('поля обрезаны без рамки листа, заголовка и штампа', async () => {
      await e.open();
      await e.mode('Планы и корпуса');
      await e.press('Загрузить планы…');
      const { root } = await page.send('DOM.getDocument', { depth: 1 });
      const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[data-import-files]' });
      await page.send('DOM.setFileInputFiles', { nodeId, files: [path.join(fixtures, 'korpus-A-plany.pdf')] });
      await page.waitFor(`document.querySelectorAll('.editor-import__item').length === 4`, 30_000);
      await page.waitFor(`[...document.querySelectorAll('.editor-import__thumb')].every((t) => t.querySelector('img'))`, 30_000);
      await page.sleep(500);
      await choose(1);
      // A4 альбомный, 842 × 595: рамка у края, заголовок выше y 70, штамп ниже y 480.
      const [x, y, w, h] = await crop();
      assert.ok(x > 30 && y > 70 && y + h < 480 && x + w < 760, `поля: ${[x, y, w, h]}`);
      assert.match(await page.eval(`document.querySelector('.editor-import__piece').textContent`), /Поля обрезаны сами/);
      await shot('editor-help-trim');
    });

    let area;
    await step('«Эта же область» — на непроверенные листы файла; проверенный не меняется', async () => {
      // Лист 3 проверен человеком: его область не трогать.
      await choose(3);
      const third = await crop();
      await page.eval(`document.querySelector('.editor-workshop__canvas').focus()`);
      await e.key('Enter', { text: '\r' });

      await choose(1);
      await e.key('r', { code: 'KeyR' });
      const from = await at(0.1, 0.2);
      const to = await at(0.8, 0.6);
      await e.drag(from.x, from.y, to.x, to.y);
      area = await crop();
      await pressInDialog('Эта же область — ещё 1 листу файла');
      assert.match(await page.eval(`document.querySelector('.editor-workshop__share').textContent`), /перенесены на 1 лист/);
      await shot('editor-help-share');

      await choose(2);
      assert.deepEqual(await crop(), area, 'область не перенеслась на лист 2');
      await choose(3);
      assert.deepEqual(await crop(), third, 'проверенный лист 3 изменился');

      // Перенос — правка того листа: Ctrl+Z на нём её отменяет.
      await choose(2);
      await e.key('z', { code: 'KeyZ', modifiers: MOD.ctrl });
      assert.notDeepEqual(await crop(), area, 'Ctrl+Z на листе 2 не отменил перенос');
      await e.key('y', { code: 'KeyY', modifiers: MOD.ctrl });
    });

    await step('«Область как у листа» берёт область с выбранного листа', async () => {
      await choose(3);
      const option = await page.eval(`[...document.querySelectorAll('[aria-label="Область как у листа"] option')].find((o) => o.textContent.startsWith('korpus-A-plany.pdf, лист 1'))?.value`);
      assert.ok(option, 'в списке нет листа 1');
      await page.eval(`(() => {
        const select = document.querySelector('[aria-label="Область как у листа"]');
        select.value = ${JSON.stringify(option)};
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await page.sleep(300);
      assert.deepEqual(await crop(), area, 'область не взялась с листа 1');
      assert.match(await page.eval(`document.querySelector('.editor-workshop__share').textContent`), /Область взята с листа «korpus-A-plany\.pdf, лист 1/);
    });

    await step('«Найти контуры на всех листах» — у непроверенных листов', async () => {
      await pressInDialog('Найти контуры на всех листах');
      await page.waitFor(`/Контур найден на/.test(document.querySelector('.editor-workshop__batch-note')?.textContent ?? '')`, 60_000);
      // Листы 1 и 2: лист 3 проверен, лист 4 — не план.
      assert.match(await page.eval(`document.querySelector('.editor-workshop__batch-note').textContent`), /Контур найден на 2 листах/);
      await choose(1);
      assert.ok(await hasOutline(), 'у листа 1 нет контура');
      await choose(2);
      assert.ok(await hasOutline(), 'у листа 2 нет контура');
      await choose(3);
      assert.ok(!(await hasOutline()), 'проверенный лист 3 получил контур');
      await shot('editor-help-batch');
    });
  },
};
