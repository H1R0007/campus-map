import { strict as assert } from 'node:assert';
import { PANEL, viewerHelpers } from '../viewer.mjs';

/**
 * Навигатор: ориентиры и фото точек (записи 85, 86).
 *
 * Написан под тестовый `data/`: от ворот к «А-305» путь сворачивает у парковки
 * направо и у кофейного автомата налево; от главного входа корпуса А у того же
 * автомата — направо. Фото есть у входа во двор корпуса А, у автомата и у
 * двери «А-305». Картинки нарисованы генератором тестового кампуса.
 *
 * Проверки не зависят от ширины шрифта: CI идёт на Linux, где буквы шире.
 * Поэтому «текст не ломается» проверяется сравнением высоты заголовка шага с
 * фото и без него, а не числом строк.
 */

/** Выбор «фото на шаге свёрнуто» живёт в браузере: сценарии идут в одном профиле. */
const STEP_PHOTO_KEY = 'campus-map:step-photo';

const stepPhoto = (page) =>
  page.eval(`(() => {
    const box = document.querySelector('[data-step-photo]');
    const title = ${PANEL}.querySelector('h2');
    if (!box) return null;
    const img = box.querySelector('img');
    return {
      form: box.dataset.stepPhoto,
      height: box.getBoundingClientRect().height,
      bottom: box.getBoundingClientRect().bottom,
      titleTop: title.getBoundingClientRect().top,
      titleHeight: title.getBoundingClientRect().height,
      loaded: !!img && img.complete && img.naturalWidth > 0,
    };
  })()`);

/** Стрелка у значка текущего шага: какую нарисовал навигатор. */
const turnIcon = (page) => page.eval(`${PANEL}.querySelector('[data-turn-icon]')?.dataset.turnIcon ?? null`);

const hasNext = (page) =>
  page.eval(`[...${PANEL}.querySelectorAll('button')].some((b) => ['Далее', 'Next'].includes(b.textContent.trim()))`);

export default {
  app: 'viewer',
  name: 'навигатор: ориентиры и фото',

  async run({ page, base, step, shot }) {
    const v = viewerHelpers(page, base);
    await page.viewport(390, 844, 2);

    /** Проходит шаги маршрута до заголовка `title`; шаги по пути — в списке. */
    const walkTo = async (title, nextLabel = 'Далее') => {
      const seen = [];
      for (let i = 0; i < 12; i += 1) {
        const heading = await v.heading();
        seen.push(heading);
        if (heading === title) return seen;
        if (!(await hasNext(page))) break;
        await v.click(nextLabel);
      }
      throw new Error(`нет шага «${title}»; шаги: ${JSON.stringify(seen)}`);
    };

    await step('карточка места: миниатюра двери вместо значка, нажатие — фото во весь экран', async () => {
      await v.open('/?to=a3_room305');
      await page.waitFor(`(() => { const img = document.querySelector('[data-photo-thumb] img'); return !!img && img.complete && img.naturalWidth > 0; })()`);
      await page.eval(`document.querySelector('[data-photo-thumb]').click()`);
      await page.waitFor(`!!document.querySelector('[data-photo-viewer]')`);
      await page.waitFor(`(() => { const img = document.querySelector('[data-photo-full]'); return !!img && img.complete && img.naturalWidth > 0; })()`);
      const viewer = await page.eval(`(() => {
        const dialog = document.querySelector('[data-photo-viewer]');
        return { label: dialog.getAttribute('aria-label'), text: dialog.innerText, focusInside: dialog.contains(document.activeElement) };
      })()`);
      assert.equal(viewer.label, 'Фото: А-305');
      assert.ok(viewer.text.includes('Корпус А, этаж 3'), `подпись фото: ${viewer.text}`);
      assert.ok(viewer.focusInside, 'фокус внутри просмотра');
      await shot('viewer-photos-full');
    });

    await step('во весь экран: «+» и «−» увеличивают, Escape закрывает и возвращает фокус на миниатюру', async () => {
      const zoom = () => page.eval(`document.querySelector('[data-photo-zoom]').dataset.photoZoom`);
      assert.equal(await zoom(), '1.00');
      await v.click('Увеличить');
      assert.equal(await zoom(), '2.00');
      await v.click('Уменьшить');
      assert.equal(await zoom(), '1.00');
      await page.key('Escape');
      assert.equal(await page.eval(`!!document.querySelector('[data-photo-viewer]')`), false, 'просмотр закрыт');
      assert.equal(await page.eval(`document.activeElement?.hasAttribute('data-photo-thumb') ?? false`), true, 'фокус вернулся на миниатюру');
    });

    await step('во весь экран: жест вниз закрывает', async () => {
      await page.eval(`document.querySelector('[data-photo-thumb]').click()`);
      await page.waitFor(`!!document.querySelector('[data-photo-viewer]')`);
      await page.dragVertical(195, 380, 180);
      assert.equal(await page.eval(`!!document.querySelector('[data-photo-viewer]')`), false, 'просмотр закрыт жестом вниз');
    });

    await step('шаги с ориентиром: поворот и стрелка — по линии маршрута', async () => {
      await page.eval(`localStorage.removeItem(${JSON.stringify(STEP_PHOTO_KEY)})`);
      await v.open('/?from=campus_gate&to=a3_room305');
      await v.click('Начать');
      const seen = await walkTo('У парковки поверните направо');
      assert.equal(await turnIcon(page), 'turnRight');
      await v.click('Далее');
      seen.push(...(await walkTo('У кофейного автомата поверните налево')));
      assert.equal(await turnIcon(page), 'turnLeft');
      assert.ok(seen.indexOf('Войдите в здание') < seen.indexOf('У кофейного автомата поверните налево'), `порядок шагов: ${JSON.stringify(seen)}`);
      // На карте у точки поворота — подпись ориентира: когда камера долетит до шага.
      await page.waitFor(`document.querySelector('.campus-landmark__body')?.textContent === 'Кофейный автомат'`);
    });

    await step('фото на шаге: полосой над текстом', async () => {
      await page.waitFor(`(() => { const img = document.querySelector('[data-step-photo] img'); return !!img && img.complete && img.naturalWidth > 0; })()`);
      const strip = await stepPhoto(page);
      assert.equal(strip.form, 'strip');
      assert.ok(strip.bottom <= strip.titleTop + 1, 'фото над текстом шага');
      assert.ok(strip.height > 120, `полоса крупная: ${strip.height}`);
      await shot('viewer-photos-strip');
    });

    await step('свернуть: тонкая строка, текст шага той же высоты, выбор помнится на следующих шагах', async () => {
      const before = await stepPhoto(page);
      await v.click('Свернуть фото');
      const collapsed = await stepPhoto(page);
      assert.equal(collapsed.form, 'collapsed');
      assert.ok(collapsed.height <= 48, `свёрнутое — строка: ${collapsed.height}`);
      // Текст шага не стал уже: высота заголовка та же, что под полосой.
      assert.equal(collapsed.titleHeight, before.titleHeight);
      assert.equal(await page.eval(`document.activeElement?.getAttribute('aria-expanded')`), 'false', 'фокус — на «Показать фото»');

      await walkTo('Идите к месту назначения');
      assert.equal((await stepPhoto(page))?.form, 'collapsed', 'дверь А-305 — тоже свёрнуто');
      await v.click('Показать фото');
      assert.equal((await stepPhoto(page))?.form, 'strip');
      assert.equal(await page.eval(`localStorage.getItem(${JSON.stringify(STEP_PHOTO_KEY)})`), 'shown');
    });

    await step('тот же автомат с другой стороны — «направо» и другая стрелка', async () => {
      await v.open('/?from=a1_entrance&to=a3_room305');
      await v.click('Начать');
      await walkTo('У кофейного автомата поверните направо');
      assert.equal(await turnIcon(page), 'turnRight');
    });

    await step('невысокий экран: фото строкой с миниатюрой над текстом', async () => {
      await page.viewport(375, 667, 2);
      await page.sleep(400);
      const row = await stepPhoto(page);
      assert.equal(row.form, 'row');
      assert.ok(row.bottom <= row.titleTop + 1, 'миниатюра над текстом шага');
      assert.ok(row.height < 90, `строка невысокая: ${row.height}`);
      await shot('viewer-photos-row');
      await page.viewport(390, 844, 2);
    });

    await step('по-английски: фраза из перевода, действие первым', async () => {
      await v.open('/?from=a1_entrance&to=a3_room305&lang=en');
      await v.click('Start');
      await walkTo('Turn right at the coffee machine', 'Next');
      await page.waitFor(`document.querySelector('.campus-landmark__body')?.textContent === 'Coffee machine'`);
    });
  },
};
