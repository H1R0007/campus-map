import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { MOD, editorHelpers } from '../editor.mjs';
import { repoRoot } from '../../lib/vite-server.mjs';

/**
 * Редактор: планы из файлов (запись 48).
 *
 * В окно кладутся образцы «как могут прислать»: PDF на четыре листа (один —
 * экспликация), картинки с полями, архив, чертёж DXF, скан TIFF и чертёж DWG,
 * который редактор не читает. Догадки видны в списке, повторы и пропуски
 * решаются в окне, а итог — одной правкой, которую сохранение уносит на диск
 * вместе с исходниками.
 */

const fixtures = path.join(repoRoot, 'tooling/browser/fixtures/plans');

/** Скан TIFF собирается здесь: без сжатия он весит мегабайты, в репозитории ему не место. */
function makeTiff(dir) {
  const require = createRequire(path.join(repoRoot, 'apps/editor/package.json'));
  const UTIF = require('utif2');
  const width = 300;
  const height = 200;
  const rgba = new Uint8Array(width * height * 4).fill(255);
  const ink = (x, y) => rgba.set([30, 30, 30, 255], (y * width + x) * 4);
  for (let x = 40; x < 260; x += 1) {
    ink(x, 40);
    ink(x, 160);
    ink(x, 100);
  }
  for (let y = 40; y <= 160; y += 1) {
    ink(40, y);
    ink(259, y);
  }
  const file = path.join(dir, 'skan-korpus-B-1.tif');
  writeFileSync(file, Buffer.from(UTIF.encodeImage(rgba, width, height)));
  return file;
}

export default {
  app: 'editor',
  name: 'редактор: планы из файлов',
  isolatedData: true,

  async run({ page, base, step, shot, dataDir, sourcesDir }) {
    await page.viewport(1600, 950, 1);
    const e = editorHelpers(page, base);
    const scratch = mkdtempSync(path.join(os.tmpdir(), 'campus-import-'));
    const dwg = path.join(scratch, 'korpus-D.dwg');
    writeFileSync(dwg, 'AC1027 не настоящий чертёж');
    const files = [
      'korpus-A-plany.pdf',
      'korpus-B-etazh-2.png',
      'korpus-A-podval.jpg',
      'genplan.jpg',
      'plany.zip',
      'korpus-V-etazh-1.dxf',
    ].map((name) => path.join(fixtures, name));
    files.push(makeTiff(scratch), dwg);

    const items = () =>
      page.eval(`[...document.querySelectorAll('.editor-import__item')].map((b) => ({
        name: b.querySelector('.editor-import__name').textContent,
        target: b.querySelector('.editor-import__target').textContent,
        problem: b.querySelector('.editor-import__target--problem')?.textContent ?? null,
      }))`);
    const choose = async (name) => {
      const ok = await page.eval(`(() => {
        const item = [...document.querySelectorAll('.editor-import__item')].find((b) => b.querySelector('.editor-import__name').textContent === ${JSON.stringify(name)});
        if (!item) return false;
        item.click();
        return true;
      })()`);
      assert.ok(ok, `нет листа «${name}»`);
      await page.sleep(300);
    };
    const pressInDialog = async (label) => {
      const ok = await page.eval(`(() => {
        const button = [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)} && !b.disabled);
        if (!button) return false;
        button.click();
        return true;
      })()`);
      assert.ok(ok, `в окне нет кнопки «${label}»`);
      await page.sleep(300);
    };
    const detailHint = () => page.eval(`document.querySelector('.editor-import__piece')?.textContent ?? ''`);

    await step('файл, брошенный мышью, открывает окно; подсказка «Отпустите» не остаётся', async () => {
      await e.open();
      /** Перетаскивание файлов мышью — как из проводника. */
      const dragFiles = async (x, y, names) => {
        const data = { items: [], files: names.map((name) => path.join(fixtures, name)), dragOperationsMask: 1 };
        await page.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data });
        await page.send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data });
        await page.sleep(150);
        assert.ok(await page.eval(`!!document.querySelector('.editor-drop')`), 'нет подсказки «Отпустите»');
        await page.send('Input.dispatchDragEvent', { type: 'drop', x, y, data });
        await page.sleep(300);
      };
      const map = await e.rect('.leaflet-container');
      await dragFiles(map.left + map.width / 2, map.top + map.height / 2, ['genplan.jpg']);
      await page.waitFor(`document.querySelectorAll('.editor-import__item').length === 1`, 15_000);
      assert.ok(!(await page.eval(`!!document.querySelector('.editor-drop')`)), 'подсказка осталась после броска на карту');

      // Второй файл — прямо в открытое окно: окно забирает бросок себе.
      const dialog = await e.rect('.editor-dialog--import');
      await dragFiles(dialog.left + dialog.width / 2, dialog.top + dialog.height / 2, ['korpus-V-etazh-1.dxf']);
      await page.waitFor(`document.querySelectorAll('.editor-import__item').length === 2`, 15_000);
      assert.ok(!(await page.eval(`!!document.querySelector('.editor-drop')`)), 'подсказка осталась после броска в окно');
      await e.key('Escape');
      await page.waitFor(`!document.querySelector('.editor-dialog--import')`, 10_000);
    });

    await step('окно открывается пустым и принимает файлы', async () => {
      await e.mode('Планы и корпуса');
      await e.press('Загрузить планы…');
      assert.match(await page.eval(`document.querySelector('[role="dialog"]')?.textContent ?? ''`), /Перетащите сюда планы/);

      const { root } = await page.send('DOM.getDocument', { depth: 1 });
      const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[data-import-files]' });
      await page.send('DOM.setFileInputFiles', { nodeId, files });
      await page.waitFor(`document.querySelectorAll('.editor-import__item').length >= 11 && !document.querySelector('[role="dialog"] [role="status"]')?.textContent.startsWith('Чтение')`, 30_000);
      // Миниатюры и поля — вслед за списком.
      // У каждого листа — миниатюра. Листы PDF не рисовались в браузерах, где
      // нет новейших функций языка, которые зовёт основная сборка pdf.js.
      await page.waitFor(`[...document.querySelectorAll('.editor-import__thumb')].every((t) => t.querySelector('img'))`, 30_000);
    });

    await step('догадки по заголовкам листов, именам файлов и архиву', async () => {
      const list = await items();
      const target = (name) => list.find((item) => item.name === name)?.target;
      const problem = (name) => list.find((item) => item.name === name)?.problem;
      assert.equal(target('korpus-A-plany.pdf, лист 1'), 'Корпус А, этаж 1');
      assert.equal(target('korpus-A-plany.pdf, лист 2'), 'Корпус А, этаж 2');
      assert.equal(target('korpus-A-plany.pdf, лист 3'), 'Корпус А, этаж 3');
      assert.equal(target('korpus-A-plany.pdf, лист 4'), 'Пропустить');
      assert.equal(target('korpus-A-podval.jpg'), 'Корпус А, этаж −1');
      assert.equal(target('genplan.jpg'), 'План территории');
      assert.equal(target('korpus-V-etazh-1.dxf'), 'Корпус В, этаж 1');
      // Архив повторяет два файла — оба повтора видны сразу.
      assert.equal(target('plany.zip › Планы/korpus-B-etazh-2.png'), 'Корпус Б, этаж 2');
      assert.equal(problem('plany.zip › Планы/korpus-B-etazh-2.png'), 'На этот этаж выбран ещё один лист');
      assert.equal(problem('korpus-B-etazh-2.png'), 'На этот этаж выбран ещё один лист');
      assert.equal(problem('korpus-A-plany.pdf, лист 1'), null);
      assert.match(problem('skan-korpus-B-1.tif'), /Укажите номер этажа/);
      assert.match(await page.eval(`document.querySelector('[role="dialog"]').textContent`), /«korpus-D\.dwg»: чертёж DWG редактор не читает/);
      await shot('editor-import-list');
    });

    await step('лист показывает, откуда догадка, и обрезает поля сам', async () => {
      await choose('korpus-A-plany.pdf, лист 2');
      const text = await detailHint();
      assert.match(text, /Этаж 2 — по заголовку листа «Корпус А\. План 2-го этажа»/);
      assert.match(text, /У этажа 2 уже есть план — новый заменит его\. Точки этажа сохранят прежние координаты/);
      assert.match(text, /Поля обрезаны сами/);
      // Масштаб — по надписи в штампе листа.
      assert.equal(await page.eval(`document.querySelector('[aria-label="Масштаб чертежа"]')?.value`), '200');
      assert.match(text, /По надписи на листе «Масштаб 1:200»/);
      assert.match(text, /1 пикс\. = 0,0\d+ м/);
      const crop = (await page.eval(`document.querySelector('.editor-crop__box').dataset.crop`)).split(',').map(Number);
      // Лист A4 альбомный — 842 × 595 пунктов; обрезанное меньше.
      assert.ok(crop[2] < 842 && crop[3] < 595 && crop[2] > 400, `обрезка ${crop}`);
      await shot('editor-import-sheet');
    });

    await step('поворот меняет стороны будущего плана', async () => {
      await choose('korpus-B-etazh-2.png');
      const size = async () => (await detailHint()).match(/Получится: (\w+), (\d+) × (\d+)/).slice(1);
      const [, width, height] = await size();
      await pressInDialog('Повернуть вправо');
      const [, rotatedWidth, rotatedHeight] = await size();
      assert.deepEqual([rotatedWidth, rotatedHeight], [height, width]);
      await pressInDialog('Повернуть влево');
    });

    await step('повторы из архива пропускаются, скану задаётся этаж', async () => {
      await choose('plany.zip › Планы/korpus-B-etazh-2.png');
      await pressInDialog('Не план — пропустить');
      await choose('plany.zip › Планы/korpus-A-podval.jpg');
      await pressInDialog('Не план — пропустить');
      await choose('skan-korpus-B-1.tif');
      await page.eval(`document.querySelector('[aria-label="Номер этажа"]').focus()`);
      await e.type('1');
      await page.sleep(200);

      const status = await page.eval(`document.querySelector('.editor-import__status').textContent`);
      assert.match(status, /Пропущено: 3 листа/);
      const button = await page.eval(`[...document.querySelectorAll('[role="dialog"] button')].at(-1).textContent`);
      assert.equal(button, 'Добавить: 7 планов этажей и план территории');
    });

    await step('всё добавляется одной правкой и открывается первый этаж', async () => {
      await pressInDialog('Добавить: 7 планов этажей и план территории');
      await page.waitFor(`!document.querySelector('.editor-dialog--import')`, 30_000);
      assert.match(await e.notice(), /Добавлено: 7 планов этажей и план территории\. Сохраните/);
      assert.match(await e.place(), /Корпус А, этаж 1/);
      // Подвал встал в дерево корпуса.
      assert.ok(
        await page.eval(`[...document.querySelectorAll('.editor-tree__label')].some((l) => l.textContent.trim() === 'Этаж −1')`),
        'подвала нет в структуре'
      );
      // План этажа — из памяти редактора, до сохранения.
      assert.match(await page.eval(`document.querySelector('.leaflet-image-layer')?.src ?? ''`), /^blob:/);
      await shot('editor-import-done');
    });

    await step('сохранение уносит планы в data/, оригиналы — в data-sources/', async () => {
      await e.key('s', { modifiers: MOD.ctrl });
      await page.waitFor(`document.querySelector('.editor-notice')?.textContent.includes('Сохранено в data/')`, 30_000);

      const meta = JSON.parse(readFileSync(path.join(dataDir, 'buildings/building_a/meta.json'), 'utf8'));
      const basement = meta.floors.find((floor) => floor.floor === -1);
      assert.equal(basement.planFormat, 'jpg');
      assert.equal(basement.source.name, 'korpus-A-podval.jpg');
      assert.ok(existsSync(path.join(dataDir, 'buildings/building_a/floors/-1/map.jpg')), 'нет плана подвала');
      const second = meta.floors.find((floor) => floor.floor === 2);
      assert.equal(second.planFormat, 'png');
      assert.equal(second.source.page, 2);
      assert.ok(second.source.crop, 'обрезка не записана');
      assert.ok(Math.abs(second.source.metersPerUnit - (0.0254 / 72) * 200) < 1e-6, `масштаб чертежа не записан: ${second.source.metersPerUnit}`);
      assert.ok(existsSync(path.join(dataDir, 'buildings/building_a/floors/2/map.png')), 'нет плана второго этажа');
      assert.ok(!existsSync(path.join(dataDir, 'buildings/building_a/floors/2/map.svg')), 'старый план этажа остался');

      const campus = JSON.parse(readFileSync(path.join(dataDir, 'campus/meta.json'), 'utf8'));
      assert.equal(campus.planFormat, 'jpg');
      assert.ok(existsSync(path.join(dataDir, 'campus/map.jpg')), 'нет плана территории');

      const dxfFloor = JSON.parse(readFileSync(path.join(dataDir, 'buildings/building_c/meta.json'), 'utf8')).floors[0];
      assert.equal(dxfFloor.planFormat, 'svg');
      assert.match(readFileSync(path.join(dataDir, 'buildings/building_c/floors/1/map.svg'), 'utf8'), /Корпус В\. План 1 этажа/);

      const sources = readdirSync(sourcesDir).sort();
      assert.ok(sources.some((name) => name.endsWith('.pdf')), `нет оригинала PDF: ${sources}`);
      assert.ok(sources.some((name) => name.endsWith('.dxf')), `нет оригинала DXF: ${sources}`);
      assert.ok(sources.some((name) => name.endsWith('.tif')), `нет оригинала TIFF: ${sources}`);
    });

    await step('отмена убирает весь импорт разом', async () => {
      await e.key('z', { modifiers: MOD.ctrl });
      assert.ok(
        !(await page.eval(`[...document.querySelectorAll('.editor-tree__label')].some((l) => l.textContent.trim() === 'Этаж −1')`)),
        'подвал остался после отмены'
      );
      assert.match(await e.notice(), /Отменено: Загружены планы/);
    });
  },
};
