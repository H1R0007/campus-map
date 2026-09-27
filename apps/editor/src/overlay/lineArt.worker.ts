/// <reference lib="webworker" />
import { lineArt } from './lineArt';
import type { LineArtKind, Tint } from './lineArt';

/**
 * Фоновый поток линий плана (запись 62): расчёт по большой картинке занимает
 * десятые доли секунды, и в основном потоке он останавливал бы карту.
 */

interface Request {
  id: number;
  kind: LineArtKind;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  tint: Tint;
  strength: number;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, kind, width, height, buffer, tint, strength } = event.data;
  const result = lineArt(kind, { width, height, data: new Uint8ClampedArray(buffer) }, tint, strength);
  const out = result.data.buffer as ArrayBuffer;
  (self as unknown as Worker).postMessage({ id, buffer: out }, [out]);
};
