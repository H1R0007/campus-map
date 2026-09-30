import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MOD, editorHelpers } from '../editor.mjs';
import { repoRoot } from '../../lib/vite-server.mjs';

/**
 * Редактор: совмещение точек с новым планом (запись 49).
 *
 * План этажа с точками заменяют картинкой другого масштаба — редактор сам
 * предлагает совместить. Две пары «точка — её место» двигают все точки этажа,
 * одна отмена возвращает. «Изменить обрезку…» с другой рамкой того же листа
 * пересчитывает точки сам, без пар.
 */

const fixtures = path.join(repoRoot, 'tooling/browser/fixtures/plans');

export default {
  app: 'editor',
  name: 'редактор: совмещение точек с планом',
  isolatedData: true,

  async run({ page, base, step, shot, dataDir }) {
    await page.viewport(1600, 950, 1);
    const e = editorHelpers(page, base);

    /** Точка плана под экраном — по строке состояния. */
    const planAt = async (x, y) => {
      await e.mouse('mouseMoved', x, y);
      await page.sleep(120);
      const text = await page.eval(`document.querySelector('.editor-statusbar__coords').textContent`);
      const match = /x (-?\d+) · y (-?\d+)/.exec(text);
      assert.ok(match, `нет координат под курсором: ${text}`);
      return { x: Number(match[1]), y: Number(match[2]) };
    };
    /** Координаты точки — из карточки. */
    // Координаты — в свойствах точки, а они в «Разметке» (запись 60).
    const nodeXY = async (id) => {
      await e.mode('Разметка');
      const point = await e.nodePoint(id, { allowCovered: true });
      await e.click(point.x, point.y);
      await page.eval(`document.querySelector('[aria-label="Свойства точки"] details')?.setAttribute('open', '')`);
      await page.sleep(200);
      const xy = { x: Number(await e.panelValue('Координата X')), y: Number(await e.panelValue('Координата Y')) };
      await e.key('Escape');
      return xy;
    };
    const barText = () => page.eval(`document.querySelector('[aria-label="Совмещение точек с планом"]')?.textContent ?? ''`);

    let before;
    await step('замена плана этажа с точками сама предлагает совмещение', async () => {
      await e.open();
      await e.openFloor('Корпус Б', 2);
      const ids = await e.nodeIds();
      // Пары — из двух самых удалённых точек этажа, как советует подсказка;
      // третья, без пары, проверит, что подобие двигает всех.
      const screen = [];
      for (const id of ids) screen.push({ id, ...(await e.nodePoint(id, { allowCovered: true })) });
      let far = [screen[0], screen[1]];
      for (const a of screen) {
        for (const b of screen) {
          if (Math.hypot(a.x - b.x, a.y - b.y) > Math.hypot(far[0].x - far[1].x, far[0].y - far[1].y)) far = [a, b];
        }
      }
      const third = screen.find((p) => p.id !== far[0].id && p.id !== far[1].id && Math.hypot(p.x - far[0].x, p.y - far[0].y) > 20 && Math.hypot(p.x - far[1].x, p.y - far[1].y) > 20);
      before = {
        ids,
        first: far[0].id,
        second: far[1].id,
        third: third.id,
        hall: await nodeXY(far[0].id),
        other: await nodeXY(far[1].id),
        thirdAt: await nodeXY(third.id),
      };

      await e.mode('Планы и корпуса');
      await e.press('Заменить план…');
      const { root } = await page.send('DOM.getDocument', { depth: 1 });
      const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[data-import-files]' });
      await page.send('DOM.setFileInputFiles', { nodeId, files: [path.join(fixtures, 'korpus-B-etazh-2.png')] });
      await page.waitFor(`!!document.querySelector('.editor-import__thumb img')`, 30_000);
      assert.match(await page.eval(`document.querySelector('.editor-import__piece').textContent`), /Точки этажа сохранят прежние координаты/);
      await page.eval(`[...document.querySelectorAll('[role="dialog"] button')].at(-1).click()`);
      await page.waitFor(`!document.querySelector('.editor-dialog--import')`, 30_000);

      assert.match(await barText(), /Новый план — Корпус Б, этаж 2/);
      assert.match(await barText(), /Щёлкните точку, которая стоит не на своём месте/);
      await shot('editor-align-start');
    });

    let expected;
    await step('две пары показывают, куда встанут все точки', async () => {
      const { first, second, third } = before;
      // Места — внутри карты, под полосой совмещения и подальше друг от друга.
      const r = await e.rect('.leaflet-container');
      const targets = [
        { x: r.left + r.width * 0.3, y: r.top + r.height * 0.7 },
        { x: r.left + r.width * 0.75, y: r.top + r.height * 0.75 },
      ];
      const planTargets = [];
      for (const [index, id] of [first, second].entries()) {
        planTargets.push(await planAt(targets[index].x, targets[index].y));
        const point = await e.nodePoint(id, { allowCovered: true });
        await e.click(point.x, point.y);
        assert.match(await barText(), /Теперь щёлкните место на плане/);
        await e.click(targets[index].x, targets[index].y);
      }

      // Подобие по двум парам — числом: (q2 − q1) / (p2 − p1) как комплексное.
      const [p1, p2] = [before.hall, before.other];
      const [q1, q2] = planTargets;
      const dp = { x: p2.x - p1.x, y: p2.y - p1.y };
      const dq = { x: q2.x - q1.x, y: q2.y - q1.y };
      const norm = dp.x * dp.x + dp.y * dp.y;
      const a = (dq.x * dp.x + dq.y * dp.y) / norm;
      const b = (dq.y * dp.x - dq.x * dp.y) / norm;
      const map = (p) => ({ x: q1.x + a * (p.x - p1.x) - b * (p.y - p1.y), y: q1.y + b * (p.x - p1.x) + a * (p.y - p1.y) });
      expected = { id: third, at: map(before.thirdAt) };

      // Выбранная точка встаёт и поверх другой: старые точки лежат на новом
      // плане где попало и не должны перехватывать щелчок.
      const onOther = await e.nodePoint(first, { allowCovered: true });
      const thirdPoint = await e.nodePoint(third, { allowCovered: true });
      await e.click(thirdPoint.x, thirdPoint.y);
      await e.click(onOther.x, onOther.y);
      assert.equal(await page.eval(`document.querySelectorAll('.editor-operation__pairs li').length`), 3, 'щелчок по другой точке не поставил выбранную');
      await page.eval(`[...document.querySelectorAll('.editor-operation__pairs li')].at(-1).querySelector('button').click()`);
      await page.sleep(200);

      const ghosts = await page.eval(`document.querySelectorAll('path[stroke-dasharray="2 3"]').length`);
      assert.equal(ghosts, before.ids.length, `не у каждой точки видно, куда она встанет: ${await barText()}`);
      assert.match(await barText(), /Масштаб ×\d+,\d{3}, поворот -?\d+,\d°/);
      await shot('editor-align-pairs');
    });

    await step('«Применить» двигает все точки этажа, отмена возвращает', async () => {
      await page.eval(`[...document.querySelectorAll('[aria-label="Совмещение точек с планом"] button')].find((b) => b.textContent.trim() === 'Готово').click()`);
      await page.sleep(400);
      assert.equal(await barText(), '', 'совмещение не закрылось');
      const moved = await nodeXY(expected.id);
      // Третья точка, которой пар не давали, встала по тому же подобию.
      assert.ok(
        Math.abs(moved.x - expected.at.x) < 3 && Math.abs(moved.y - expected.at.y) < 3,
        `точка ${expected.id} не там: ${JSON.stringify(moved)} вместо ${JSON.stringify(expected.at)}`
      );

      await e.key('z', { modifiers: MOD.ctrl });
      assert.match(await e.notice(), /Отменено: Точки совмещены с планом: Корпус Б, этаж 2/);
      assert.deepEqual(await nodeXY(before.first), before.hall);
      await e.key('y', { modifiers: MOD.ctrl });
    });

    await step('«Изменить обрезку…» с другой рамкой — точки пересчитываются сами', async () => {
      await e.key('s', { modifiers: MOD.ctrl });
      await page.waitFor(`document.querySelector('.editor-notice')?.textContent.includes('Сохранено в data/')`, 30_000);
      const source = JSON.parse(readFileSync(path.join(dataDir, 'buildings/building_b/meta.json'), 'utf8')).floors.find((floor) => floor.floor === 2).source;
      assert.ok(source.crop, 'план сделан с обрезкой полей');
      const beforeRedo = await nodeXY(before.first);

      await e.mode('Планы и корпуса');
      await e.press('Изменить обрезку…');
      await page.waitFor(`!!document.querySelector('.editor-import__piece')`, 30_000);
      assert.match(await page.eval(`document.querySelector('.editor-import__piece').textContent`), /Точки этажа пересчитаются вместе с планом/);
      // Лист открылся с той рамкой, с которой план сделан.
      await page.waitFor(`!!document.querySelector('.editor-crop__box')`, 10_000);
      const shown = (await page.eval(`document.querySelector('.editor-crop__box').dataset.crop`)).split(',').map(Number);
      assert.deepEqual(shown, [source.crop.x, source.crop.y, source.crop.width, source.crop.height].map(Math.round));
      await page.eval(`[...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === 'Весь лист').click()`);
      await page.sleep(300);
      await page.eval(`[...document.querySelectorAll('[role="dialog"] button')].at(-1).click()`);
      await page.waitFor(`!document.querySelector('.editor-dialog--import')`, 30_000);

      assert.equal(await barText(), '', 'совмещение не нужно — точки пересчитаны');
      const after = await nodeXY(before.first);
      // Картинка та же, без обрезки: точка сдвинулась на отрезанные поля.
      assert.ok(Math.abs(after.x - (beforeRedo.x + source.crop.x)) < 1.5, `x ${after.x} вместо ${beforeRedo.x + source.crop.x}`);
      assert.ok(Math.abs(after.y - (beforeRedo.y + source.crop.y)) < 1.5, `y ${after.y} вместо ${beforeRedo.y + source.crop.y}`);
    });
  },
};
