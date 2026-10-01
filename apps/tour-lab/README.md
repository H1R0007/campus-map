# Экскурсия 360° — прототип

Исследование, а не функция навигатора (запись 90 в `DECISIONS.md`): снимки 360°
в точках графа, стрелки на полу к соседним снимкам, «показать этот поворот» у
шага маршрута. Не развёртывается.

## Запуск

```bash
pnpm install
pnpm --filter @campus-map/tour-lab samples   # открытые снимки Poly Haven (CC0), ~115 МБ, один раз
pnpm --filter @campus-map/tour-lab dev       # http://localhost:3002
```

Без `samples` всё работает на заглушках-компасах: вместо снимка — сфера с
углами от его середины. По ней видно, верно ли стоят стрелки.

Адрес принимает `?at=<узел>` — открыть снимок точки, `?from=&to=` — маршрут.

Снимки — **не наш вуз**: стрелки ведут по графу тестового кампуса, а не к
дверям на фото. Направления снимков в `data/panoramas.json` подобраны так,
чтобы коридоры на фото по возможности совпали с коридорами плана.

## Где что

| Что | Где |
| --- | --- |
| Формат `panoramas.json`, разбор, стрелки, виды вдоль маршрута | `packages/core/src/panoramas/` |
| Описание панорам тестового кампуса | `data/panoramas.json` |
| Снимки | вне git: `.local/panoramas` или `CAMPUS_PANORAMAS_DIR`; у развёрнутой экскурсии — `CAMPUS_PANORAMA_BASE` |
| Просмотр (Photo Sphere Viewer + Virtual Tour) | `src/components/PanoramaView.tsx` |
| Подписи, шаги маршрута, углы | `src/tour/` |
| Загрузка открытых снимков | `scripts/fetch-sample-panoramas.mjs` |

## Проверки

```bash
pnpm --filter @campus-map/tour-lab test           # подписи и шаги на тестовом кампусе
pnpm --filter @campus-map/tour-lab build
pnpm --filter @campus-map/tour-lab check:browser  # сценарии в браузере; -- --samples на настоящих снимках, -- --mode dev без сборки
```

Сценарии в браузере не входят в `pnpm check:browser` и CI: панорамы рисует
WebGL, а прототип не развёртывается.
