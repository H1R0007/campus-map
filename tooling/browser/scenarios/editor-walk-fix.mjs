import { strict as assert } from 'node:assert';
import path from 'node:path';
import { MOD, editorHelpers } from '../editor.mjs';
import { repoRoot } from '../../lib/vite-server.mjs';

/**
 * Разбор «поправить готовую карту» (этап 5 фазы 12).
 *
 * Карта уже работает, и в неё вносят правки: переименовать помещение,
 * заменить план этажа новым и перенести на него точки, найти и исправить то,
 * что правка нечаянно сломала, сохранить. Каждый шаг снимается (`--shots`).
 */

const fixtures = path.join(repoRoot, 'tooling/browser/fixtures/plans');

export default {
  app: 'editor',
  name: 'редактор: разбор «поправить готовое»',
  isolatedData: true,

  async run({ page, base, step, shot }) {
    await page.viewport(1600, 950, 1);
    const e = editorHelpers(page, base);

    const readyState = (id) => page.eval(`document.querySelector('[data-ready="${id}"]')?.dataset.state`);
    const statusReady = () => page.eval(`document.querySelector('.editor-statusbar__ready')?.textContent.trim() ?? ''`);
    const rowButton = async (id, label) => {
      const ok = await page.eval(`(() => {
        const b = [...document.querySelectorAll('[data-ready="${id}"] button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)});
        if (!b) return false;
        b.click();
        return true;
      })()`);
      assert.ok(ok, `в строке ${id} нет кнопки «${label}»`);
      await page.sleep(400);
    };
    const alignBar = () => page.eval(`document.querySelector('[aria-label="Совмещение точек с планом"]')?.textContent ?? ''`);

    await step('открыть: «Готовность» показывает, что карта рабочая', async () => {
      await e.open();
      await e.mode('Проверка');
      await page.sleep(400);
      await shot('walk-fix-01-open');
      console.log('    [разбор] готовность при открытии:', await statusReady());
    });

    await step('переименовать: поиск, название в свойствах, «Применить»', async () => {
      await e.key('f', { modifiers: MOD.ctrl });
      await e.type('а-102');
      await page.sleep(300);
      await shot('walk-fix-02-search');
      await e.key('Enter', { keyCode: 13 });
      await page.sleep(400);
      assert.equal(await e.propertiesNodeId(), 'a1_room102', 'найденная точка не выбрана');
      await page.eval(`document.querySelector('input[aria-label="Новое название"]').focus()`);
      await e.type('Лаборатория робототехники');
      await e.key('Enter', { text: '\r' });
      await page.sleep(200);
      assert.match(await e.panelSection('Названия'), /Лаборатория робототехники/);
      await shot('walk-fix-03-renamed');
      await e.press('Применить');
      await e.key('Escape', { keyCode: 27 });
    });

    await step('случайная точка без связей: «Готовность» ловит, «Показать» ведёт к ней', async () => {
      const free = await e.emptyMapPoint();
      await e.click(free.x, free.y, { button: 'right' });
      await e.menuPick('Поставить точку здесь');
      await e.key('Escape', { keyCode: 27 });
      await e.mode('Проверка');
      await page.waitFor(`document.querySelector('[data-ready="onePlanNetwork"]')?.dataset.state === 'todo'`, 5_000);
      await page.eval(`document.querySelector('[data-ready="onePlanNetwork"]').scrollIntoView({ block: 'center' })`);
      await shot('walk-fix-04-broken');
      console.log('    [разбор] сломано:', (await page.eval(`document.querySelector('[data-ready="onePlanNetwork"]').textContent`)).replace(/\s+/g, ' '));
      await rowButton('onePlanNetwork', 'Показать');
      assert.equal(await e.selectedCount(), 1, '«Показать» не выбрал точку');
      // Точка выбрана — её свойства в «Разметке»: связать с ближайшей.
      await e.mode('Разметка');
      await e.press('Выбрать из ближайших…');
      await shot('walk-fix-05-nearest');
      // Ближайшая по расстоянию — первая в списке; связь — правка карточки.
      await page.eval(`document.querySelector('[aria-label="Ближайшие несвязанные точки"] button').click()`);
      await page.sleep(300);
      await e.press('Применить');
      await e.key('Escape', { keyCode: 27 });
      await e.mode('Проверка');
      await page.waitFor(`document.querySelector('[data-ready="onePlanNetwork"]')?.dataset.state === 'done'`, 5_000);
      console.log('    [разбор] после исправления:', await statusReady());
    });

    await step('новый план этажа: «Заменить план…», пары «точка — её место»', async () => {
      await e.mode('Планы и корпуса');
      await e.openFloor('Корпус Б', 2);
      await e.key('Escape', { keyCode: 27 });
      await e.press('Заменить план…');
      const { root } = await page.send('DOM.getDocument', { depth: 1 });
      const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[data-import-files]' });
      await page.send('DOM.setFileInputFiles', { nodeId, files: [path.join(fixtures, 'korpus-B-etazh-2.png')] });
      await page.waitFor(`!!document.querySelector('.editor-import__thumb img')`, 30_000);
      await page.sleep(400);
      await shot('walk-fix-06-replace');
      await page.eval(`[...document.querySelectorAll('[role="dialog"] button')].at(-1).click()`);
      await page.waitFor(`!document.querySelector('.editor-dialog--import')`, 30_000);
      assert.match(await alignBar(), /Щёлкните точку, которая стоит не на своём месте/);

      // Две самые удалённые точки — и места для них на новом плане.
      const ids = await e.nodeIds();
      const points = [];
      for (const id of ids) points.push({ id, ...(await e.nodePoint(id, { allowCovered: true })) });
      let far = [points[0], points[1]];
      for (const a of points) {
        for (const b of points) if (Math.hypot(a.x - b.x, a.y - b.y) > Math.hypot(far[0].x - far[1].x, far[0].y - far[1].y)) far = [a, b];
      }
      const r = await e.rect('.leaflet-container');
      const targets = [
        { x: r.left + r.width * 0.3, y: r.top + r.height * 0.65 },
        { x: r.left + r.width * 0.72, y: r.top + r.height * 0.7 },
      ];
      for (const [index, point] of far.entries()) {
        await e.click(point.x, point.y);
        await e.click(targets[index].x, targets[index].y);
      }
      await page.sleep(300);
      await shot('walk-fix-07-align');
      console.log('    [разбор] совмещение:', (await alignBar()).replace(/\s+/g, ' ').slice(0, 240));
      await page.eval(`[...document.querySelectorAll('[aria-label="Совмещение точек с планом"] button')].find((b) => b.textContent.trim() === 'Готово').click()`);
      await page.sleep(400);
      assert.equal(await alignBar(), '', 'совмещение не закрылось');
    });

    await step('сохранить: проверка перед сохранением и итог', async () => {
      await e.key('s', { modifiers: MOD.ctrl });
      await page.sleep(600);
      const dialog = await page.eval(`document.querySelector('[role="dialog"]')?.textContent ?? ''`);
      if (dialog.includes('Проверка перед сохранением')) {
        console.log('    [разбор] перед сохранением:', dialog.replace(/\s+/g, ' ').slice(0, 300));
        await shot('walk-fix-08-save-check');
        await page.eval(`[...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === 'Сохранить всё равно').click()`);
      }
      await page.waitFor(`document.querySelector('.editor-notice')?.textContent.includes('Сохранено')`, 20_000);
      await e.mode('Проверка');
      await page.sleep(400);
      await shot('walk-fix-09-done');
      console.log('    [разбор] итог:', await statusReady(), '· сохранено:', await readyState('saved'));
      const rows = await page.eval(`[...document.querySelectorAll('.editor-ready__item')].filter((item) => item.dataset.state !== 'done').map((item) =>
        item.dataset.ready + ' — ' + (item.querySelector('.editor-ready__status')?.textContent ?? '') + ' · ' + [...item.querySelectorAll('.editor-ready__problems li')].map((li) => li.textContent).join('; '))`);
      for (const row of rows) console.log('      ·', row);
    });
  },
};
