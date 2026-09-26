/**
 * Библиотека значков Tabler Icons — виртуальный модуль
 * `tooling/vite-plugin-tabler-icons.mjs`: [имя, категория, метки через
 * пробел, узлы значка]. Логотипов брендов в ней нет.
 */
declare module 'virtual:tabler-icons' {
  import type { IconNode } from '@campus-map/core';

  const icons: readonly (readonly [string, string, string, readonly IconNode[]])[];
  export default icons;
}
