import { beforeEach, describe, expect, it } from 'vitest';
import { useUpdateStore } from '../src/stores/updateStore';

/** Обновление по согласию (запись 27). */

function fakeWorker() {
  const messages: unknown[] = [];
  const worker = { postMessage: (message: unknown) => messages.push(message) } as unknown as ServiceWorker;
  return { worker, messages };
}

beforeEach(() => useUpdateStore.setState({ waiting: null, dismissed: false, applying: false }));

describe('обновление по согласию', () => {
  it('новая версия ждёт, пока её не примут', () => {
    const { worker, messages } = fakeWorker();
    useUpdateStore.getState().offer(worker);

    expect(useUpdateStore.getState()).toMatchObject({ waiting: worker, dismissed: false, applying: false });
    expect(messages).toEqual([]);
  });

  it('«Обновить» просит новую версию заступить и ждёт перезагрузки', () => {
    const { worker, messages } = fakeWorker();
    useUpdateStore.getState().offer(worker);
    useUpdateStore.getState().apply();

    expect(messages).toEqual([{ type: 'SKIP_WAITING' }]);
    expect(useUpdateStore.getState().applying).toBe(true);
  });

  it('«Обновить позже» прячет, а следующая версия предлагается снова', () => {
    const first = fakeWorker();
    const second = fakeWorker();
    useUpdateStore.getState().offer(first.worker);
    useUpdateStore.getState().dismiss();
    expect(useUpdateStore.getState().dismissed).toBe(true);

    useUpdateStore.getState().offer(second.worker);
    expect(useUpdateStore.getState()).toMatchObject({ waiting: second.worker, dismissed: false });
  });

  it('без ждущей версии «Обновить» ничего не делает', () => {
    useUpdateStore.getState().apply();

    expect(useUpdateStore.getState().applying).toBe(false);
  });
});
