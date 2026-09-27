import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MOD, editorHelpers } from '../editor.mjs';

/**
 * Редактор: корпуса на территории (запись 50).
 *
 * Поставленные корпуса видны на плане территории. «Передвинуть…» кладёт
 * план корпуса поверх территории с ручками; перетаскивание двигает, «Применить»
 * сохраняет привязку в метрах. Новый масштаб территории оставляет корпуса на
 * тех же местах картинки.
 */
export default {
  app: 'editor',
  name: 'редактор: корпуса на территории',
  isolatedData: true,

  async run({ page, base, step, shot, dataDir }) {
    await page.viewport(1600, 950, 1);
    const e = editorHelpers(page, base);
    const meta = (id) => JSON.parse(readFileSync(path.join(dataDir, `buildings/${id}/meta.json`), 'utf8'));
    const campus = () => JSON.parse(readFileSync(path.join(dataDir, 'campus/meta.json'), 'utf8'));
    const barText = (label) => page.eval(`document.querySelector('[aria-label="${label}"]')?.textContent ?? ''`);

    /** Точка плана под экраном — по строке состояния. */
    const planAt = async (x, y) => {
      await e.mouse('mouseMoved', x, y);
      await page.sleep(120);
      const text = await page.eval(`document.querySelector('.editor-statusbar__coords').textContent`);
      const match = /x (-?\d+) · y (-?\d+)/.exec(text);
      assert.ok(match, `нет координат под курсором: ${text}`);
      return { x: Number(match[1]), y: Number(match[2]) };
    };
    const buildingRect = (id) => e.rect(`.campus-placed-plan[data-building="${id}"]`);

    await step('на территории видны поставленные корпуса', async () => {
      await e.open();
      await e.mode('Планы и корпуса');
      await page.waitFor(`document.querySelectorAll('.campus-placed-plan.editor-campus-building').length === 3`, 15_000);
      await shot('editor-place-campus');
    });

    await step('«Передвинуть…» кладёт корпус с ручками поверх территории', async () => {
      await e.press('Изменить размещение…');
      assert.match(await barText('Постановка корпуса'), /Корпус А на территории — план этажа 1/);
      assert.equal(await page.eval(`document.querySelectorAll('.editor-place-handle').length`), 3);
      assert.ok(await page.eval(`!!document.querySelector('.campus-placed-plan.editor-placing-plan')`), 'нет плана, который ставят');
    });

    await step('перетаскивание середины двигает корпус, «Применить» пишет метры', async () => {
      const origin = meta('building_a').placement.originMeters;
      const handle = await e.rect('.editor-place-handle--move');
      const from = { x: handle.left + handle.width / 2, y: handle.top + handle.height / 2 };
      const planFrom = await planAt(from.x + 200, from.y + 100);
      const planTo = await planAt(from.x + 260, from.y + 130);
      await e.drag(from.x, from.y, from.x + 60, from.y + 30, { steps: 12 });
      await shot('editor-place-moved');

      await page.eval(`[...document.querySelectorAll('[aria-label="Постановка корпуса"] button')].find((b) => b.textContent === 'Применить').click()`);
      await page.sleep(300);
      assert.equal(await barText('Постановка корпуса'), '', 'постановка не закрылась');
      await e.key('s', { modifiers: MOD.ctrl });
      await page.waitFor(`document.querySelector('.editor-notice')?.textContent.includes('Сохранено в data/')`, 15_000);

      const mpp = campus().metersPerPixel;
      const moved = meta('building_a').placement.originMeters;
      const expected = { x: origin.x + (planTo.x - planFrom.x) * mpp, y: origin.y + (planTo.y - planFrom.y) * mpp };
      assert.ok(Math.abs(moved.x - expected.x) < 1.5 && Math.abs(moved.y - expected.y) < 1.5, `корпус не там: ${JSON.stringify(moved)} вместо ${JSON.stringify(expected)}`);
    });

    await step('этаж совмещается с этажом входа, калька это учитывает', async () => {
      await e.openFloor('Корпус А', 2);
      await e.key('Escape');
      await e.press('Совместить с этажом входа…');
      assert.match(await barText('Совмещение этажей'), /Корпус А: этаж 2 поверх этажа входа 1/);
      assert.match(await e.place(), /Корпус А \/ Этаж 1/);

      const handle = await e.rect('.editor-place-handle--move');
      const from = { x: handle.left + handle.width / 2, y: handle.top + handle.height / 2 };
      await e.drag(from.x, from.y, from.x + 40, from.y + 20, { steps: 10 });
      await page.eval(`[...document.querySelectorAll('[aria-label="Совмещение этажей"] button')].find((b) => b.textContent === 'Применить').click()`);
      await page.sleep(300);
      assert.equal(await barText('Совмещение этажей'), '', 'совмещение не закрылось');

      await e.key('s', { modifiers: MOD.ctrl });
      await page.waitFor(`document.querySelector('.editor-notice')?.textContent.includes('Сохранено в data/')`, 15_000);
      const floor2 = meta('building_a').floors.find((floor) => floor.floor === 2);
      assert.ok(floor2.placement?.originMeters, 'у этажа нет своей привязки');

      // Калька первого этажа на втором — по привязкам, повёрнутым планом-слоем.
      await e.openFloor('Корпус А', 2);
      // Что показывать на карте — в «Разметке» (запись 60).
      await e.mode('Разметка');
      await e.toggleFilter('Соседний этаж бледно');
      await page.waitFor(`!!document.querySelector('.campus-placed-plan.editor-ghost-plan')`, 10_000);
      await e.toggleFilter('Соседний этаж бледно');
      await e.mode('Планы и корпуса');
      await e.press('Территория');
    });

    await step('новый масштаб территории оставляет корпуса на месте картинки', async () => {
      const before = await buildingRect('building_b');
      await e.press('Уточнить масштаб…');
      const map = await e.rect('.leaflet-container');
      // Выше полосы замера: она внизу карты.
      await e.click(map.left + 150, map.top + 180);
      await e.click(map.left + 450, map.top + 180);
      assert.match(await barText('Масштаб территории'), /Между местами \d+ пикс\. плана/);
      await page.eval(`document.querySelector('[aria-label="Расстояние, м"]').focus()`);
      await e.type('100');
      await e.key('Enter', { text: '\r' });
      await page.sleep(400);

      assert.equal(await barText('Масштаб территории'), '', 'замер не закрылся');
      assert.notEqual(campus().metersPerPixel, undefined);
      const after = await buildingRect('building_b');
      assert.ok(Math.abs(after.left - before.left) < 2 && Math.abs(after.top - before.top) < 2, 'корпус съехал после нового масштаба');
    });
  },
};
