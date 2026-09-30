import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MOD, editorHelpers } from '../editor.mjs';
import { repoRoot } from '../../lib/vite-server.mjs';

/**
 * Редактор: контур здания вместо прямоугольной обрезки (запись 73).
 *
 * «Найти контур здания» обводит чертёж на листе PDF — без заголовка и
 * штампа. Ручка ребра выгибает его дугой, двойной щелчок добавляет угол.
 * Готовый план за контуром прозрачен, а контур записан в исходник плана, и
 * «Изменить обрезку…» возвращает его.
 */

const fixtures = path.join(repoRoot, 'tooling/browser/fixtures/plans');

export default {
  app: 'editor',
  name: 'редактор: контур здания на листе',
  isolatedData: true,

  async run({ page, base, step, shot, dataDir }) {
    await page.viewport(1600, 950, 1);
    const e = editorHelpers(page, base);
    const outline = () => page.eval(`document.querySelector('.editor-outline')?.dataset.outline ?? ''`);
    const pressInDialog = async (label) => {
      const ok = await page.eval(`(() => {
        const b = [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)}) && !b.disabled);
        if (!b) return false;
        b.click();
        return true;
      })()`);
      assert.ok(ok, `в окне нет кнопки «${label}»`);
      await page.sleep(300);
    };
    const center = (selector, index = 0) =>
      page.eval(`(() => {
        const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`);

    await step('«Найти контур здания» обводит чертёж без заголовка и штампа', async () => {
      await e.open();
      await e.openFloor('Корпус А', 1);
      await e.mode('Планы и корпуса');
      await e.key('Escape', { keyCode: 27 });
      await e.press('Заменить план…');
      const { root } = await page.send('DOM.getDocument', { depth: 1 });
      const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[data-import-files]' });
      await page.send('DOM.setFileInputFiles', { nodeId, files: [path.join(fixtures, 'korpus-A-plany.pdf')] });
      await page.waitFor(`document.querySelectorAll('.editor-import__item').length >= 4`, 30_000);
      // Лист 1 — «Корпус А. План 1 этажа»: план заменит нынешний.
      await page.eval(`[...document.querySelectorAll('.editor-import__item')].find((b) => b.textContent.includes('лист 1')).click()`);
      await page.sleep(300);
      await page.waitFor(`!!document.querySelector('.editor-crop__image')`, 30_000);
      const crop = await page.eval(`document.querySelector('.editor-crop__box')?.dataset.crop`);

      await pressInDialog('Найти контур здания');
      await page.waitFor(`!!document.querySelector('.editor-outline')`, 20_000);
      const corners = (await outline()).split(' ');
      assert.ok(corners.length >= 4 && corners.length <= 12, `контур: ${corners.length} углов — ${await outline()}`);
      assert.equal(await page.eval(`document.querySelector('.editor-import__shape [role="radio"][aria-checked="true"]')?.textContent.trim()`), 'Контур');
      // Заголовок «Корпус А. План 1 этажа» и штамп — за контуром: контур ниже и уже прежней рамки.
      const [, cropY, cropW, cropH] = crop.split(',').map(Number);
      const ys = corners.map((c) => Number(c.split(',')[1]));
      const xs = corners.map((c) => Number(c.split(',')[0]));
      assert.ok(Math.min(...ys) > cropY + cropH * 0.05, `заголовок попал в контур: ${await outline()}`);
      assert.ok(Math.max(...xs) - Math.min(...xs) < cropW * 0.95, `штамп попал в контур: ${await outline()}`);
      await shot('editor-outline-found');
    });

    await step('ручка ребра выгибает дугу, двойной щелчок — новый угол', async () => {
      const before = (await outline()).split(' ').length;
      const edge = await center('.editor-outline__edge', 0);
      await e.drag(edge.x, edge.y, edge.x, edge.y - 40, { steps: 8 });
      assert.match(await outline(), /~-?\d/, 'ребро не выгнулось дугой');
      const other = await center('.editor-outline__edge', 1);
      await e.dblclick(other.x, other.y);
      await page.sleep(200);
      assert.equal((await outline()).split(' ').length, before + 1, 'двойной щелчок не добавил угол');
      assert.match(await page.eval(`document.querySelector('.editor-import__piece').textContent`), /силуэтом здания.*PNG/s);
      await shot('editor-outline-arc');
    });

    await step('готовый план за контуром прозрачен, контур — в исходнике', async () => {
      await page.eval(`[...document.querySelectorAll('[role="dialog"] button')].at(-1).click()`);
      await page.waitFor(`!document.querySelector('.editor-dialog--import')`, 30_000);
      // Совмещение точек с новыми планами листов 1–3 предлагается само — оставить как есть.
      for (let i = 0; i < 4; i++) {
        const left = await page.eval(`(() => {
          const b = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Оставить как есть');
          b?.click();
          return !!b;
        })()`);
        if (!left) break;
        await page.sleep(300);
      }
      await e.key('s', { modifiers: MOD.ctrl });
      await page.sleep(500);
      if (await page.eval(`!!document.querySelector('[role="dialog"]')?.textContent.includes('Проверка перед сохранением')`)) {
        await pressInDialog('Сохранить всё равно');
      }
      await page.waitFor(`document.querySelector('.editor-notice')?.textContent.includes('Сохранено')`, 30_000);

      const meta = JSON.parse(readFileSync(path.join(dataDir, 'buildings/building_a/meta.json'), 'utf8'));
      const floor = meta.floors.find((item) => item.floor === 1);
      assert.equal(floor.planFormat, 'png');
      assert.ok(floor.source.outline?.length >= 5, 'контура нет в исходнике');
      assert.ok(floor.source.outline.some((p) => p.bulge), 'дуги нет в исходнике');

      // Угол картинки плана — за контуром: прозрачный.
      const png = readFileSync(path.join(dataDir, 'buildings/building_a/floors/1/map.png')).toString('base64');
      const alpha = await page.eval(`new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0);
          resolve([g.getImageData(1, 1, 1, 1).data[3], g.getImageData(Math.floor(img.width / 2), Math.floor(img.height / 2), 1, 1).data[3]]);
        };
        img.src = 'data:image/png;base64,${png}';
      })`);
      assert.equal(alpha[0], 0, 'угол плана не прозрачный');
      assert.equal(alpha[1], 255, 'середина плана прозрачная');
    });

    await step('«Изменить обрезку…» открывает лист с тем же контуром', async () => {
      await e.mode('Планы и корпуса');
      await page.eval(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Этаж 1точек'))?.click()`);
      await page.sleep(300);
      await e.press('Изменить обрезку…');
      await page.waitFor(`!!document.querySelector('.editor-outline')`, 30_000);
      assert.match(await outline(), /~-?\d/, 'контур вернулся без дуги');
      await shot('editor-outline-redo');
      await e.key('Escape', { keyCode: 27 });
    });
  },
};
