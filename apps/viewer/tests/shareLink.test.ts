import { describe, expect, it, vi } from 'vitest';
import { shareLink } from '../src/utils/shareLink';

/**
 * «Поделиться маршрутом»: каким способом отдать ссылку и что показать.
 */

const LINK = 'https://example.test/map/?from=a1_entrance&to=a3_room305';
const TITLE = 'Маршрут';

const resolved = () => Promise.resolve();
const rejectedWith = (name: string) => () => Promise.reject(new DOMException(name, name));

describe('shareLink', () => {
  it('системное окно передало ссылку — копировать незачем', async () => {
    const writeText = vi.fn(resolved);

    await expect(shareLink(LINK, TITLE, { share: resolved, writeText })).resolves.toBe('shared');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('закрытое человеком окно — не повод копировать без спроса', async () => {
    const writeText = vi.fn(resolved);

    await expect(shareLink(LINK, TITLE, { share: rejectedWith('AbortError'), writeText })).resolves.toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('без системного окна или при его отказе ссылка копируется', async () => {
    const writeText = vi.fn(resolved);

    await expect(shareLink(LINK, TITLE, { share: rejectedWith('NotAllowedError'), writeText })).resolves.toBe('copied');
    await expect(shareLink(LINK, TITLE, { writeText })).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(LINK);
  });

  it('без буфера обмена или при его отказе — ручное копирование', async () => {
    // Сайт по HTTP: ни системного окна, ни буфера обмена.
    await expect(shareLink(LINK, TITLE, {})).resolves.toBe('manual');
    await expect(shareLink(LINK, TITLE, { writeText: rejectedWith('NotAllowedError') })).resolves.toBe('manual');
  });
});
