import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { MOD, editorHelpers } from '../editor.mjs';

/**
 * Редактор: корпуса и этажи (запись 47).
 *
 * Корпус и этаж добавляются из «Структуры», свойства правятся в карточке,
 * удаление перечисляет, что уйдёт. Сохранение переносит и удаляет файлы
 * данных, а отмена после сохранения возвращает и план этажа — его байты
 * редактор запомнил до удаления.
 */
export default {
  app: 'editor',
  name: 'редактор: корпуса и этажи',
  isolatedData: true,

  async run({ page, base, step, shot, dataDir }) {
    await page.viewport(1600, 900, 1);
    const e = editorHelpers(page, base);
    const file = (relative) => path.join(dataDir, relative);
    const json = (relative) => JSON.parse(readFileSync(file(relative), 'utf8'));
    const planA2 = readFileSync(file('buildings/building_a/floors/2/map.svg'));
    const planA3 = readFileSync(file('buildings/building_a/floors/3/map.svg'));

    /**
     * Ctrl+S. Пока новый корпус не размещён на территории и без плана,
     * сохранение сначала говорит, что заметят в навигаторе (запись 51).
     */
    const save = async ({ navigator = null } = {}) => {
      await e.key('s', { modifiers: MOD.ctrl });
      if (navigator) {
        await page.waitFor(`document.querySelector('[role="dialog"]')?.textContent.includes('Что заметят в навигаторе')`, 10_000);
        assert.match(await page.eval(`document.querySelector('[role="dialog"]').textContent`), navigator);
        await page.eval(`[...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === 'Сохранить всё равно').click()`);
      }
      await page.waitFor(`document.querySelector('.editor-notice')?.textContent.includes('Сохранено в data/')`, 10_000);
      return e.notice();
    };
    const unplacedG = /Корпус «Корпус Г» не размещён на территории.*У этажа 1 корпуса «Корпус Г» нет плана/;
    const tree = () => page.eval(`[...document.querySelectorAll('nav[aria-label="Структура кампуса"] .editor-tree__label')].map((l) => l.textContent.trim())`);
    const fillAndEnter = async (label, value) => {
      const ok = await page.eval(`(() => {
        const input = document.querySelector('input[aria-label=${JSON.stringify(label)}]');
        if (!input) return false;
        input.focus();
        input.select();
        return true;
      })()`);
      assert.ok(ok, `нет поля «${label}»`);
      await e.type(value);
      await e.key('Enter', { text: '\r' });
    };

    await step('новый корпус — окном: следующая буква, пустой, карта предлагает добавить этаж', async () => {
      await e.open();
      await e.press('Новый корпус');
      const dialog = await page.eval(`document.querySelector('[role="dialog"]')?.textContent ?? ''`);
      assert.match(dialog, /Новый корпус/, 'окно «Новый корпус» не открылось');
      const suggested = await page.eval(`document.querySelector('[role="dialog"] input[aria-label="Название корпуса"]')?.value`);
      assert.equal(suggested, 'Корпус Г', 'не подсказана следующая буква');
      await shot('editor-structure-new-building-dialog');
      await e.press('Создать');

      assert.ok((await tree()).includes('Корпус Г'), 'корпуса нет в структуре');
      const region = await page.eval(`document.querySelector('[aria-label="Корпус без этажей"]')?.textContent ?? ''`);
      assert.match(region, /этажей пока нет/);
      // Карта закрыта: щелчок по ней не поставил бы точку никуда.
      const covered = await page.eval(`(() => {
        const r = document.querySelector('.leaflet-container').getBoundingClientRect();
        return Boolean(document.elementFromPoint(r.x + 30, r.bottom - 30)?.closest('.editor-plan-status--blocking'));
      })()`);
      assert.ok(covered, 'карта корпуса без этажей доступна для щелчков');
      await shot('editor-structure-new-building');
    });

    await step('первый этаж — окном «Новый этаж»; без плана — предложение файла, по желанию — пустое поле', async () => {
      await e.press('Добавить этаж вручную…');
      const dialog = () => page.eval(`document.querySelector('[role="dialog"]')?.textContent ?? ''`);
      assert.match(await dialog(), /Новый этаж · Корпус Г/);
      assert.equal(await page.eval(`document.querySelector('[role="dialog"] input[aria-label="Номер этажа"]')?.value`), '1');
      await shot('editor-structure-new-floor-dialog');
      await page.eval(`[...document.querySelectorAll('[role="dialog"] label')].find((l) => l.textContent.includes('Без плана')).querySelector('input').click()`);
      await e.press('Создать');
      assert.equal(await dialog(), '', 'окно не закрылось');
      assert.match(await e.place(), /Корпус Г/);
      // Посередине карты — куда бросить файл плана; карта под ней закрыта.
      const card = () => page.eval(`document.querySelector('[aria-label="План не добавлен"]')?.textContent ?? ''`);
      assert.match(await card(), /У этажа 1 корпуса «Корпус Г» пока нет плана/);
      assert.match(await card(), /Перетащите файл плана прямо сюда/);
      await shot('editor-structure-no-plan');

      await e.press('Размечать без плана');
      assert.equal(await card(), '', 'карточка не убралась');
      assert.match(await page.eval(`document.querySelector('.editor-plan-status')?.textContent ?? ''`), /У этажа нет плана/);

      await e.key('n');
      const empty = await e.emptyMapPoint();
      await e.click(empty.x, empty.y);
      assert.equal((await e.nodeIds()).length, 1, 'точка на новом этаже не встала');
      await e.key('Escape');
    });

    await step('сохранение создаёт файлы корпуса и вписывает его в список', async () => {
      await save({ navigator: unplacedG });
      const meta = json('buildings/building_g/meta.json');
      assert.equal(meta.name, 'Корпус Г');
      assert.deepEqual(meta.translations, { en: { name: 'Building G' } });
      assert.deepEqual(meta.floors.map((floor) => floor.floor), [1]);
      assert.equal(json('buildings/building_g/floors/1/graph.json').nodes.length, 1);
      assert.ok(json('campus/meta.json').buildings.some((b) => b.id === 'building_g'));
    });

    await step('«Проверка» называет, чего не хватит навигатору, и ведёт к исправлению', async () => {
      await e.press('Проверка');
      const section = () => page.eval(`document.querySelector('[aria-label^="Корпуса, этажи и планы"]')?.textContent ?? ''`);
      assert.match(await section(), /Корпус «Корпус Г» не размещён на территории/);
      assert.match(await section(), /У этажа 1 корпуса «Корпус Г» нет плана/);
      await page.eval(`[...document.querySelectorAll('[aria-label^="Корпуса, этажи и планы"] li')].find((li) => li.textContent.includes('нет плана')).querySelector('button').click()`);
      await page.waitFor(`!!document.querySelector('.editor-dialog--import')`, 10_000);
      await e.key('Escape');
      await page.waitFor(`!document.querySelector('.editor-dialog--import')`, 10_000);
      await e.press('Свойства');
    });

    await step('удаление этажа перечисляет, что уйдёт', async () => {
      await e.openFloor('Корпус А', 2);
      await e.key('Escape');
      await e.press('Удалить этаж…');
      const text = await page.eval(`document.querySelector('[role="dialog"]')?.textContent ?? ''`);
      assert.match(text, /Удалить этаж 2 корпуса «Корпус А»\?/);
      assert.match(text, /\d+ точ(ка|ки|ек), из них \d+ с названиями/);
      assert.match(text, /переход/);
      assert.match(text, /план — файлы удалятся из данных при сохранении/);
      await shot('editor-structure-delete-floor');
      await page.eval(`[...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === 'Удалить этаж').click()`);
      await page.sleep(400);

      assert.ok(!(await tree()).includes('Этаж 2'), 'этаж остался в структуре');
      assert.match(await e.notice(), /Ctrl\+Z вернёт всё/);
    });

    await step('сохранение удаляет граф и план этажа', async () => {
      const notice = await save({ navigator: unplacedG });
      assert.match(notice, /удалено 2 файла/);
      assert.ok(!existsSync(file('buildings/building_a/floors/2/map.svg')), 'план удалённого этажа остался');
      assert.ok(!existsSync(file('buildings/building_a/floors/2/graph.json')), 'граф удалённого этажа остался');
      assert.deepEqual(json('buildings/building_a/meta.json').floors.map((floor) => floor.floor), [1, 3]);
    });

    await step('отмена после сохранения возвращает этаж вместе с планом', async () => {
      await e.key('z', { modifiers: MOD.ctrl });
      assert.ok((await tree()).includes('Этаж 2'), 'этаж не вернулся');
      await save({ navigator: unplacedG });
      assert.ok(readFileSync(file('buildings/building_a/floors/2/map.svg')).equals(planA2), 'план вернулся не тем');
      assert.ok(json('buildings/building_a/floors/2/graph.json').nodes.length > 0, 'точки этажа не вернулись');
    });

    await step('смена номера этажа переносит план и точки', async () => {
      await e.openFloor('Корпус А', 3);
      await e.key('Escape');
      await fillAndEnter('Номер этажа', '4');
      assert.ok((await tree()).includes('Этаж 4'), 'номер не сменился');
      await save({ navigator: unplacedG });
      assert.ok(readFileSync(file('buildings/building_a/floors/4/map.svg')).equals(planA3), 'план не переехал');
      assert.ok(!existsSync(file('buildings/building_a/floors/3')), 'каталог прежнего номера остался');
      assert.ok(json('buildings/building_a/floors/4/graph.json').nodes.length > 0);
    });

    await step('удаление корпуса с точками — только после отметки «понимаю»', async () => {
      await e.press('Корпус Г');
      await e.key('Escape');
      await e.press('Удалить корпус…');
      const disabled = await page.eval(
        `[...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === 'Удалить корпус').disabled`
      );
      assert.equal(disabled, true, 'корпус с точками удаляется без отметки');
      await page.eval(`document.querySelector('[role="dialog"] input[type="checkbox"]').click()`);
      await page.sleep(200);
      await page.eval(`[...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === 'Удалить корпус').click()`);
      await page.sleep(400);
      assert.ok(!(await tree()).includes('Корпус Г'), 'корпус остался');

      await save();
      assert.ok(!existsSync(file('buildings/building_g')), 'файлы корпуса остались');
      assert.ok(!json('campus/meta.json').buildings.some((b) => b.id === 'building_g'));
    });
  },
};
