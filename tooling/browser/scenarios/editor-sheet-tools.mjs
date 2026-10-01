import { strict as assert } from 'node:assert';
import path from 'node:path';
import { MOD, editorHelpers } from '../editor.mjs';
import { repoRoot } from '../../lib/vite-server.mjs';

/**
 * Редактор: инструменты мастерской листов (запись 81).
 *
 * Буквы переключают инструменты, Escape возвращает к выбору. Контур по
 * точкам замыкается щелчком по первой точке или Enter; Shift ровняет стену,
 * Backspace убирает последнюю точку. «Вырезать» отрезает угол контура, а
 * прямоугольник внутри объясняет словами. «Прямоугольник» обводит область
 * рамкой. «Здание здесь» находит контур под щелчком — и здания, и штампа.
 * «Рука» двигает лист поверх ручек; правая кнопка — меню у точки.
 */

const fixtures = path.join(repoRoot, 'tooling/browser/fixtures/plans');
/** Лист 1 файла «korpus-A-plany.pdf» — A4 альбомный, в пунктах. */
const PAGE = { width: 842, height: 595 };

export default {
  app: 'editor',
  name: 'редактор: инструменты мастерской листов',
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
    const outline = async () =>
      (await page.eval(`document.querySelector('.editor-outline')?.dataset.outline ?? ''`))
        .split(' ')
        .filter(Boolean)
        .map((corner) => corner.split('~')[0].split(',').map(Number));
    const crop = async () => (await page.eval(`document.querySelector('.editor-crop__box')?.dataset.crop ?? ''`)).split(',').map(Number);
    const tool = () => page.eval(`document.querySelector('.editor-workshop__palette [aria-pressed="true"]')?.getAttribute('aria-label') ?? ''`);
    const hint = () => page.eval(`document.querySelector('.editor-workshop__hint').textContent`);
    const press = (letter) => e.key(letter.toLowerCase(), { code: `Key${letter}` });
    const ctrl = (letter) => e.key(letter, { code: `Key${letter.toUpperCase()}`, modifiers: MOD.ctrl });
    /** Точка экрана по долям листа. */
    const at = async (fx, fy) => {
      const image = await rect('.editor-crop__image');
      return { x: image.left + image.width * fx, y: image.top + image.height * fy };
    };
    const box = (points) => {
      const xs = points.map((p) => p[0]);
      const ys = points.map((p) => p[1]);
      return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
    };

    await step('буквы переключают инструменты, Escape возвращает к выбору', async () => {
      await e.open();
      await e.mode('Планы и корпуса');
      await e.press('Загрузить планы…');
      const { root } = await page.send('DOM.getDocument', { depth: 1 });
      const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[data-import-files]' });
      await page.send('DOM.setFileInputFiles', { nodeId, files: [path.join(fixtures, 'korpus-A-plany.pdf')] });
      await page.waitFor(`document.querySelectorAll('.editor-import__item').length === 4`, 30_000);
      await page.waitFor(`!!document.querySelector('.editor-crop__image-canvas')`, 30_000);
      await page.sleep(500);

      assert.equal(await page.eval(`document.querySelectorAll('.editor-workshop__palette button').length`), 6);
      assert.equal(await tool(), 'Выбор');
      await press('P');
      assert.equal(await tool(), 'Контур по точкам');
      // Ручки рамки спрятаны: щелчок достаётся инструменту.
      assert.equal(await page.eval(`getComputedStyle(document.querySelector('.editor-crop__handle')).display`), 'none');
      assert.match(await hint(), /Щёлкайте по углам здания/);
      await e.key('Escape', { keyCode: 27 });
      assert.equal(await tool(), 'Выбор');
      assert.ok(await page.eval(`!!document.querySelector('.editor-workshop') && !document.querySelector('[role="alertdialog"]')`), 'Escape закрыл мастерскую');
    });

    await step('контур по точкам: щелчки по углам, щелчок по первой — замкнуть; Ctrl+Z убирает', async () => {
      await press('P');
      const corners = [
        [0.2, 0.3],
        [0.6, 0.3],
        [0.6, 0.7],
        [0.2, 0.7],
      ];
      for (const [fx, fy] of corners) {
        const p = await at(fx, fy);
        await e.click(p.x, p.y);
      }
      assert.equal((await page.eval(`document.querySelector('.editor-workshop__sketch')?.dataset.sketch ?? ''`)).split(' ').length, 4, 'точки обводки не встали');
      const first = await at(0.2, 0.3);
      await e.click(first.x + 3, first.y + 2);
      const drawn = await outline();
      assert.equal(drawn.length, 4, `контур: ${drawn.join(' ')}`);
      const b = box(drawn);
      for (const [value, expected] of [
        [b.left, PAGE.width * 0.2],
        [b.right, PAGE.width * 0.6],
        [b.top, PAGE.height * 0.3],
        [b.bottom, PAGE.height * 0.7],
      ]) {
        assert.ok(Math.abs(value - expected) <= 2, `угол не там, где щёлкнули: ${drawn.join(' ')}`);
      }
      assert.equal(await tool(), 'Выбор', 'после замыкания — не к выбору');
      await shot('editor-tools-polygon');
      await ctrl('z');
      assert.ok(!(await page.eval(`!!document.querySelector('.editor-outline')`)), 'Ctrl+Z не убрал обводку');
      await ctrl('y');
      assert.equal((await outline()).length, 4);
    });

    await step('Shift ровняет стену, Backspace убирает последнюю точку, Enter замыкает', async () => {
      await press('P');
      const a = await at(0.25, 0.35);
      await e.click(a.x, a.y);
      // Почти горизонтально — с Shift строго горизонтально.
      const bPoint = await at(0.55, 0.37);
      await e.click(bPoint.x, bPoint.y, { modifiers: MOD.shift });
      const stray = await at(0.4, 0.9);
      await e.click(stray.x, stray.y);
      await e.key('Backspace');
      for (const [fx, fy] of [
        [0.55, 0.65],
        [0.25, 0.65],
      ]) {
        const p = await at(fx, fy);
        await e.click(p.x, p.y);
      }
      await e.key('Enter', { text: '\r' });
      const drawn = await outline();
      assert.equal(drawn.length, 4, `Backspace не убрал точку или Enter не замкнул: ${drawn.join(' ')}`);
      const top = drawn.filter((p) => p[1] < PAGE.height * 0.5);
      assert.equal(top.length, 2);
      assert.ok(Math.abs(top[0][1] - top[1][1]) <= 0.5, `Shift не выровнял стену: ${drawn.join(' ')}`);
      // Enter замкнул обводку, а не отметил лист готовым.
      assert.ok(await page.eval(`[...document.querySelectorAll('.editor-import__item')][0].getAttribute('aria-current') === 'true'`), 'Enter ушёл на «лист готов»');
    });

    await step('«Вырезать» отрезает угол, а вырез внутри объясняет словами', async () => {
      const before = await outline();
      const b = box(before);
      await press('X');
      assert.equal(await tool(), 'Вырезать');
      // От точки за правым верхним углом контура — внутрь.
      const from = await at((b.right + 20) / PAGE.width, (b.top - 20) / PAGE.height);
      const to = await at((b.right - 60) / PAGE.width, (b.top + 40) / PAGE.height);
      await e.drag(from.x, from.y, to.x, to.y);
      const cut = await outline();
      assert.equal(cut.length, 6, `угол не вырезан: ${cut.join(' ')}`);
      assert.match(await hint(), /Вырезано/);
      await shot('editor-tools-cut');

      // Целиком внутри — нельзя, и сказано почему.
      const inside1 = await at((b.left + 30) / PAGE.width, (b.bottom - 60) / PAGE.height);
      const inside2 = await at((b.left + 60) / PAGE.width, (b.bottom - 30) / PAGE.height);
      await e.drag(inside1.x, inside1.y, inside2.x, inside2.y);
      assert.match(await hint(), /внутри плана/);
      assert.equal((await outline()).length, 6);
      assert.equal(await tool(), 'Вырезать', 'вырез не остался инструментом');
      await ctrl('z');
      assert.deepEqual(await outline(), before, 'Ctrl+Z не вернул угол');
    });

    await step('«Прямоугольник» обводит область рамкой', async () => {
      await press('R');
      const from = await at(0.1, 0.1);
      const to = await at(0.5, 0.5);
      await e.drag(from.x, from.y, to.x, to.y);
      assert.ok(!(await page.eval(`!!document.querySelector('.editor-outline')`)), 'контур остался');
      const [x, y, w, h] = await crop();
      assert.ok(Math.abs(x - 84) <= 2 && Math.abs(y - 60) <= 2 && Math.abs(w - 337) <= 3 && Math.abs(h - 238) <= 3, `рамка ${[x, y, w, h]}`);
      assert.equal(await tool(), 'Выбор');
    });

    await step('«Здание здесь»: щелчок по плану — его контур, а не рамка листа', async () => {
      await press('B');
      const building = await at(0.45, 0.35);
      await e.click(building.x, building.y);
      await page.waitFor(`!!document.querySelector('.editor-outline')`, 20_000);
      const found = box(await outline());
      // План — без рамки листа вокруг и без штампа справа внизу.
      assert.ok(found.top > PAGE.height * 0.12 && found.right < PAGE.width * 0.9 && found.bottom < PAGE.height * 0.8, `контур плана ${JSON.stringify(found)}`);
      assert.ok(found.right - found.left > PAGE.width * 0.5, `контур плана мал: ${JSON.stringify(found)}`);
      assert.equal(await tool(), 'Выбор');
      assert.match(await hint(), /Контур найден/);
      await shot('editor-tools-building');
    });

    await step('«Рука» двигает лист и поверх ручек; правая кнопка — меню у угла', async () => {
      const before = await outline();
      await press('H');
      const image = await rect('.editor-crop__image');
      const corner = await rect('.editor-outline__corner', 0);
      assert.equal(corner.width, 0, 'ручки видны при «Руке»');
      const start = await at(0.3, 0.3);
      await e.drag(start.x, start.y, start.x + 60, start.y + 30);
      const moved = await rect('.editor-crop__image');
      assert.ok(Math.abs(moved.left - image.left - 60) < 1 && Math.abs(moved.top - image.top - 30) < 1, 'лист не поехал');
      assert.deepEqual(await outline(), before, '«Рука» сдвинула контур');
      await e.key('0', { code: 'Digit0', keyCode: 48 });

      await press('V');
      const first = await rect('.editor-outline__corner', 0);
      await e.click(first.x, first.y, { button: 'right' });
      const items = await page.eval(`[...document.querySelectorAll('.editor-workshop__menu [role="menuitem"]')].map((b) => b.textContent)`);
      assert.ok(items.some((t) => t.startsWith('Убрать угол')) && items.some((t) => t.startsWith('Найти здание здесь')), `меню: ${items}`);
      await shot('editor-tools-menu');
      await page.eval(`[...document.querySelectorAll('.editor-workshop__menu [role="menuitem"]')].find((b) => b.textContent.startsWith('Убрать угол')).click()`);
      await page.sleep(200);
      assert.equal((await outline()).length, before.length - 1, 'пункт меню не убрал угол');

      // Escape закрывает меню, а не мастерскую.
      const empty = await at(0.95, 0.05);
      await e.click(empty.x, empty.y, { button: 'right' });
      assert.ok(await page.eval(`!!document.querySelector('.editor-workshop__menu')`), 'меню не открылось');
      await e.key('Escape', { keyCode: 27 });
      assert.ok(
        await page.eval(`!document.querySelector('.editor-workshop__menu') && !!document.querySelector('.editor-workshop') && !document.querySelector('[role="alertdialog"]')`),
        'Escape не закрыл меню или закрыл мастерскую'
      );
    });
  },
};
