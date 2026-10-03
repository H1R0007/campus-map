import type { Panorama } from '@campus-map/core';
import { placeholderPanorama } from './placeholder';

declare const __PANORAMA_BASE__: string;

/**
 * Где лежат снимки: хранилище развёртывания (`CAMPUS_PANORAMA_BASE`) или
 * `/panoramas/` этого сервера. В данных — только имя файла (запись 90).
 */
export function panoramaUrl(file: string): string {
  const base = __PANORAMA_BASE__ || `${import.meta.env.BASE_URL}panoramas/`;
  return `${base.replace(/\/?$/, '/')}${file.split('/').map(encodeURIComponent).join('/')}`;
}

const available = new Map<string, Promise<boolean>>();

/** Есть ли файл в хранилище — запросом без тела. */
function isAvailable(url: string): Promise<boolean> {
  let result = available.get(url);
  if (!result) {
    result = fetch(url, { method: 'HEAD' }).then(
      (response) => response.ok,
      () => false
    );
    available.set(url, result);
  }
  return result;
}

export interface PanoramaImage {
  url: string;
  /** Снимка нет — показана заглушка-компас. */
  placeholder: boolean;
}

/** Снимок панорамы, а если файла нет — заглушка с её названием. */
export async function panoramaImage(panorama: Panorama, title: string): Promise<PanoramaImage> {
  const url = panoramaUrl(panorama.file);
  if (await isAvailable(url)) return { url, placeholder: false };
  return { url: await placeholderPanorama(title, `снимка нет: ${panorama.file}`), placeholder: true };
}
