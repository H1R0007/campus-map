import { strict as assert } from 'node:assert';
import { LOW_CONTRAST } from '../contrast.mjs';
import { viewerHelpers } from '../viewer.mjs';

const STORAGE_KEY = 'campus-map:onboarding-done';
const DIALOG = `document.querySelector('[role="dialog"][aria-label="Знакомство с навигатором"], [role="dialog"][aria-label="Getting started"]')`;

/**
 * Навигатор: знакомство при первом запуске (запись 25).
 *
 * Остальные сценарии открывают навигатор с отметкой «знакомство пройдено»
 * (`viewerHelpers.open`); этот — без неё.
 */
export default {
  app: 'viewer',
  name: 'навигатор: знакомство при первом запуске',

  async run({ page, base, step, shot }) {
    const v = viewerHelpers(page, base);
    await page.viewport(390, 844, 2);

    const fresh = async (pathAndQuery) => {
      await v.open('/', { onboarding: true });
      await page.eval(`localStorage.removeItem('${STORAGE_KEY}')`);
      await v.open(pathAndQuery, { onboarding: true });
    };
    const dialogOpen = () => page.eval(`!!${DIALOG}`);
    const title = () => page.eval(`${DIALOG}?.querySelector('h2')?.textContent ?? ''`);

    await step('первое открытие: три экрана, фокус на «Далее», отметка после конца', async () => {
      await fresh('/');
      assert.equal(await dialogOpen(), true);
      assert.equal(await title(), 'Найдите нужное место');
      assert.equal(await page.eval('document.activeElement?.textContent?.trim()'), 'Далее');
      const failures = await page.eval(LOW_CONTRAST);
      assert.deepEqual(failures, [], `контраст: ${JSON.stringify(failures)}`);
      await shot('viewer-onboarding-1');

      await v.click('Далее', DIALOG);
      assert.equal(await title(), 'QR-код у входа — это «вы здесь»');
      await v.click('Далее', DIALOG);
      assert.equal(await title(), 'Идите по шагам');
      await v.click('Начать пользоваться', DIALOG);

      assert.equal(await dialogOpen(), false);
      assert.equal(await page.eval(`localStorage.getItem('${STORAGE_KEY}')`), '1');
      assert.ok(['BUTTON', 'H2'].includes(await page.eval('document.activeElement?.tagName')), 'фокус не потерян');

      await v.open('/', { onboarding: true });
      assert.equal(await dialogOpen(), false, 'второй раз не показывается');
    });

    await step('по ссылке у входа знакомства нет, и отметка не ставится', async () => {
      await fresh('/?at=a1_entrance');
      assert.equal(await dialogOpen(), false);
      assert.equal(await page.eval(`localStorage.getItem('${STORAGE_KEY}')`), null);
    });

    await step('«Пропустить» и Escape закрывают сразу', async () => {
      await fresh('/');
      await v.click('Пропустить', DIALOG);
      assert.equal(await dialogOpen(), false);
      assert.equal(await page.eval(`localStorage.getItem('${STORAGE_KEY}')`), '1');

      await fresh('/');
      await page.key('Escape');
      assert.equal(await dialogOpen(), false);
    });

    await step('язык переключается прямо в знакомстве', async () => {
      await fresh('/');
      await v.click('English', DIALOG);
      assert.equal(await title(), 'Find the place you need');
      await v.click('Русский', DIALOG);
    });

    await step('тёмная тема: контраст знакомства', async () => {
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
      await fresh('/');
      const failures = await page.eval(LOW_CONTRAST);
      assert.deepEqual(failures, [], `контраст: ${JSON.stringify(failures)}`);
      await shot('viewer-onboarding-dark');
    });
  },
};
