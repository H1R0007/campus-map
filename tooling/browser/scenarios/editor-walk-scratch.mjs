import { strict as assert } from 'node:assert';
import path from 'node:path';
import { MOD, editorHelpers } from '../editor.mjs';
import { repoRoot } from '../../lib/vite-server.mjs';

/**
 * Разбор «собрать карту с нуля» (этап 5 фазы 12).
 *
 * Путь человека от пустого кампуса до карты, которую навигатор откроет:
 * загрузить планы, измерить масштаб территории, разместить корпус,
 * расставить точки, вход и лестницу, пройти «Готовность» и сохранить. Каждый
 * шаг снимается (`--shots`) — снимки идут в отчёт разбора, а сценарий
 * держит весь путь рабочим.
 */

const fixtures = path.join(repoRoot, 'tooling/browser/fixtures/plans');

export default {
  app: 'editor',
  name: 'редактор: разбор «с нуля»',
  isolatedData: 'empty',

  async run({ page, base, step, shot }) {
    await page.viewport(1600, 950, 1);
    const e = editorHelpers(page, base);

    /** Строки «Готовности»: название и выполнена ли. */
    const readiness = () =>
      page.eval(`[...document.querySelectorAll('.editor-ready__item')].map((item) => ({
        id: item.dataset.ready,
        title: item.querySelector('.editor-ready__title')?.textContent.trim() ?? '',
        status: item.querySelector('.editor-ready__status')?.textContent.trim() ?? '',
        done: item.dataset.state === 'done',
      }))`);
    const statusReady = () => page.eval(`document.querySelector('.editor-statusbar__ready')?.textContent.trim() ?? ''`);
    const pressInDialog = async (label) => {
      const ok = await page.eval(`(() => {
        const button = [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)}) && !b.disabled);
        if (!button) return false;
        button.click();
        return true;
      })()`);
      assert.ok(ok, `в окне нет кнопки «${label}»`);
      await page.sleep(300);
    };
    const operation = (label) => page.eval(`document.querySelector('[aria-label="${label}"]')?.textContent ?? ''`);
    const pressInOperation = async (label, button) => {
      const ok = await page.eval(`(() => {
        const b = [...document.querySelectorAll('[aria-label="${label}"] button')].find((b) => b.textContent.trim() === ${JSON.stringify(button)});
        if (!b) return false;
        b.click();
        return true;
      })()`);
      assert.ok(ok, `в «${label}» нет кнопки «${button}»`);
      await page.sleep(300);
    };

    await step('пустой кампус: редактор говорит, с чего начать', async () => {
      await page.goto(`${base}/`);
      await page.waitFor(`!!document.querySelector('nav[aria-label="Структура кампуса"]')`, 20_000);
      await page.sleep(800);
      await e.mode('Планы и корпуса');
      await shot('walk-scratch-01-empty');
      console.log('    [разбор] строка состояния:', (await e.status()).replace(/\s+/g, ' '));
      console.log('    [разбор] карта:', (await page.eval(`document.querySelector('.editor-plan-status')?.textContent ?? '—'`)).replace(/\s+/g, ' '));
      console.log('    [разбор] полоса готовности:', (await page.eval(`document.querySelector('.editor-ready-strip')?.textContent ?? '—'`)).replace(/\s+/g, ' '));
    });

    await step('загрузить планы: территория и корпус А одним PDF', async () => {
      await e.press('Загрузить планы…');
      const { root } = await page.send('DOM.getDocument', { depth: 1 });
      const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[data-import-files]' });
      await page.send('DOM.setFileInputFiles', { nodeId, files: ['genplan.jpg', 'korpus-A-plany.pdf'].map((name) => path.join(fixtures, name)) });
      await page.waitFor(`document.querySelectorAll('.editor-import__item').length >= 5`, 30_000);
      await page.waitFor(`[...document.querySelectorAll('.editor-import__thumb')].every((t) => t.querySelector('img'))`, 30_000);
      await page.sleep(500);
      await shot('walk-scratch-02-import');
      const list = await page.eval(`[...document.querySelectorAll('.editor-import__item')].map((b) => b.querySelector('.editor-import__name').textContent + ' → ' + b.querySelector('.editor-import__target').textContent)`);
      console.log('    [разбор] листы:', list.join('; '));
      await pressInDialog('Добавить');
      await page.waitFor(`!document.querySelector('.editor-dialog--import')`, 30_000);
      await page.sleep(800);
      await shot('walk-scratch-03-added');
      console.log('    [разбор] после добавления:', await e.notice());
    });

    await step('масштаб территории: два места и метры', async () => {
      await e.press('Территория');
      await page.sleep(500);
      await e.press('Измерить масштаб…');
      const map = await e.rect('.leaflet-container');
      await e.click(map.left + 200, map.top + map.height - 150);
      await e.click(map.left + map.width - 200, map.top + map.height - 150);
      await shot('walk-scratch-04-scale');
      await page.eval(`document.querySelector('[aria-label="Расстояние, м"]').focus()`);
      await e.type('150');
      await e.key('Enter', { text: '\r' });
      await page.sleep(500);
      assert.equal(await operation('Масштаб территории'), '', 'замер не закрылся');
    });

    await step('корпус А на территории: ручки и булавка', async () => {
      await e.press('Разместить: Корпус А');
      await page.waitFor(`document.querySelectorAll('.editor-place-handle').length > 0`, 10_000);
      await page.sleep(500);
      await shot('walk-scratch-05-place');
      const move = await e.rect('.editor-place-handle--move');
      const from = { x: move.left + move.width / 2, y: move.top + move.height / 2 };
      await e.drag(from.x, from.y, from.x - 120, from.y - 80, { steps: 12 });
      await page.sleep(300);
      const plan = await e.rect('.campus-placed-plan.editor-placing-plan');
      // Булавка — в левом нижнем углу плана: там, где он «совпал».
      await e.click(plan.left + 6, plan.bottom - 6);
      await page.sleep(300);
      await shot('walk-scratch-06-pin');
      console.log('    [разбор] размещение:', (await operation('Размещение корпуса')).replace(/\s+/g, ' ').slice(0, 300));
      await pressInOperation('Размещение корпуса', 'Готово');
      assert.equal(await operation('Размещение корпуса'), '', 'размещение не закрылось');
      await page.sleep(500);
      await shot('walk-scratch-07-placed');
    });

    const logReadiness = async () => {
      console.log('    [разбор] готовность:', await statusReady());
      for (const row of await readiness()) console.log(`      ${row.done ? '✓' : '·'} ${row.id} ${row.title} — ${row.status}`);
    };

    await step('что осталось — «Готовность»', async () => {
      await e.mode('Проверка');
      await page.sleep(500);
      await shot('walk-scratch-08-readiness');
      await logReadiness();
    });

    /** Прямоугольник плана на карте `group`: по долям его сторон ставятся точки. */
    const planBox = async (group = 0) => {
      const box = await page.eval(`(() => {
        const section = document.querySelectorAll('.editor-mapgroup')[${group}];
        const img = [...(section?.querySelectorAll('img.leaflet-image-layer') ?? [])].find((i) => !i.classList.contains('campus-placed-plan'));
        if (!img) return null;
        const r = img.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      })()`);
      assert.ok(box, `на карте ${group + 1} нет плана`);
      return box;
    };
    const at = (box, fx, fy) => ({ x: box.left + box.width * fx, y: box.top + box.height * fy });
    const clickAt = async (box, fx, fy, options) => {
      const p = at(box, fx, fy);
      await e.click(p.x, p.y, options);
      await page.sleep(150);
    };
    /** Коридор на листе образца — полоса на трети высоты, комнаты — над ней. */
    const CORRIDOR = 0.34;
    const ROOMS = 0.2;

    await step('этаж 1: коридор цепочкой и помещения с номером', async () => {
      await e.press('Открыть этаж');
      await page.sleep(500);
      assert.match(await e.place(), /Корпус А, этаж 1/);
      await e.mode('Разметка');
      const box = await planBox();
      await e.key('1', { code: 'Digit1' });
      for (const fx of [0.12, 0.35, 0.6, 0.85]) await clickAt(box, fx, CORRIDOR);
      await e.key('Enter', { keyCode: 13 });
      await e.key('2', { code: 'Digit2' });
      await clickAt(box, 0.2, ROOMS);
      await e.type('01');
      await clickAt(box, 0.45, ROOMS);
      await e.type('02');
      await e.key('Enter', { text: '\r' });
      await page.eval('document.activeElement?.blur()');
      await e.key('Escape', { keyCode: 27 });
      await page.sleep(300);
      await shot('walk-scratch-09-floor1');
      console.log('    [разбор] точки этажа 1:', (await e.nodeIds()).join(', '));
    });

    await step('этажи 2 и 3: коридор цепочкой', async () => {
      for (const floor of [2, 3]) {
        await e.key('PageUp');
        await page.sleep(500);
        assert.match(await e.place(), new RegExp(`этаж ${floor}`));
        const box = await planBox();
        await e.key('1', { code: 'Digit1' });
        for (const fx of [0.12, 0.5, 0.85]) await clickAt(box, fx, CORRIDOR);
        await e.key('Enter', { keyCode: 13 });
      }
      await e.key('Escape', { keyCode: 27 });
      await e.key('PageDown');
      await e.key('PageDown');
      await page.sleep(400);
      assert.match(await e.place(), /этаж 1/);
    });

    await step('лестница: щелчок по пустому месту — на всех этажах, связана с коридором', async () => {
      await e.press('Переход (T)');
      await e.press('Лестница');
      await clickAt(await planBox(), 0.04, CORRIDOR);
      console.log('    [разбор] после лестницы:', await e.notice());
      await shot('walk-scratch-10-stairs');
    });

    await step('вход: точка у двери, справа — территория, щелчок по пустому месту у корпуса', async () => {
      await e.press('Вход');
      await clickAt(await planBox(), 0.85, CORRIDOR);
      await page.waitFor(`document.querySelectorAll('.editor-mapgroup').length === 2`, 10_000);
      await page.sleep(800);
      console.log('    [разбор] начат вход:', await e.notice());
      await shot('walk-scratch-11-entrance-pending');
      const footprint = await page.eval(`(() => {
        const section = document.querySelectorAll('.editor-mapgroup')[1];
        const plan = section.querySelector('.campus-placed-plan');
        if (!plan) return null;
        const r = plan.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.bottom + 14 };
      })()`);
      assert.ok(footprint, 'на соседней карте не видно корпуса');
      await e.click(footprint.x, footprint.y);
      await page.sleep(400);
      const notice = await e.notice();
      console.log('    [разбор] вход:', notice);
      assert.match(notice, /Вход в корпус: .* — новая точка/, 'второй конец входа не поставлен');
      await shot('walk-scratch-12-entrance');
    });

    await step('два маршрута в «Проверке»', async () => {
      await e.mode('Проверка');
      await e.press('Маршрут');
      // Маршрут 1: помещение на этаже 1 — вход на территории.
      await clickAt(await planBox(0), 0.2, ROOMS);
      const territory = await page.eval(`(() => {
        const section = document.querySelectorAll('.editor-mapgroup')[1];
        const node = section.querySelector('path[data-node-id^="campus_"]');
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`);
      assert.ok(territory, 'нет точки входа на территории');
      await e.click(territory.x, territory.y);
      await page.sleep(600);
      await shot('walk-scratch-13-route');
      console.log('    [разбор] маршрут 1:', (await page.eval(`document.querySelector('[aria-labelledby="route-result"]')?.textContent ?? document.body.textContent.match(/Длина[^А-Я]*/)?.[0] ?? ''`)).replace(/\s+/g, ' ').slice(0, 200));
      // Маршрут 2: второе помещение — первое.
      await e.press('Сброс');
      await clickAt(await planBox(0), 0.45, ROOMS);
      await clickAt(await planBox(0), 0.2, ROOMS);
      await page.sleep(400);
      await e.press('Готовность');
      await page.sleep(300);
    });

    await step('сохранить и посмотреть «Готовность»', async () => {
      await e.key('s', { modifiers: MOD.ctrl });
      await page.sleep(600);
      const dialog = await page.eval(`document.querySelector('[role="dialog"]')?.textContent ?? ''`);
      if (dialog.includes('Проверка перед сохранением')) {
        console.log('    [разбор] перед сохранением:', dialog.replace(/\s+/g, ' ').slice(0, 300));
        await pressInDialog('Сохранить всё равно');
      }
      await page.waitFor(`document.querySelector('.editor-notice')?.textContent.includes('Сохранено')`, 20_000);
      await page.sleep(500);
      await shot('walk-scratch-14-done');
      await logReadiness();
    });
  },
};
