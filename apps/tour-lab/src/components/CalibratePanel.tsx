import type { Panorama, PanoramaLink } from '@campus-map/core';
import { linkLabel } from '../tour/describe';
import type { Tour } from '../tour/loadTour';

interface CalibratePanelProps {
  tour: Tour;
  panorama: Panorama;
  /** Направление из данных — до правки в этом окне. */
  original: number | null;
  links: readonly PanoramaLink[];
  target: string | null;
  onTarget: (target: string | null) => void;
  onReset: () => void;
}

/**
 * Настройка направления снимка одним щелчком: выбрать соседнюю точку и
 * щёлкнуть по снимку туда, где она видна. Направление снимка — направление
 * на соседа по плану минус угол щелчка от середины снимка.
 */
export function CalibratePanel({ tour, panorama, original, links, target, onTarget, onReset }: CalibratePanelProps) {
  const usable = links.filter((link) => link.bearing !== null);
  const changed = panorama.heading !== original;
  const line = JSON.stringify({
    node: panorama.node,
    file: panorama.file,
    heading: panorama.heading === null ? null : Math.round(panorama.heading),
  });

  return (
    <section className="panel-section" aria-labelledby="calibrate-title">
      <h2 id="calibrate-title">Направление снимка</h2>
      <p className="hint">
        Сейчас середина снимка смотрит{' '}
        {panorama.heading === null ? 'неизвестно куда — стрелок нет' : `на ${Math.round(panorama.heading)}° от верха плана`}
        . Выберите соседнюю точку и щёлкните по снимку туда, где она видна.
      </p>

      {usable.length === 0 ? (
        <p className="hint">У этого снимка нет соседей с известным направлением.</p>
      ) : (
        <div className="choice" role="radiogroup" aria-label="Соседняя точка">
          {usable.map((link) => (
            <label key={link.target} className="choice__item">
              <input
                type="radio"
                name="calibrate-target"
                checked={target === link.target}
                onChange={() => onTarget(link.target)}
                data-target={link.target}
              />
              {linkLabel(tour, panorama.node, link)}
            </label>
          ))}
        </div>
      )}

      {target && <p className="callout">Теперь щёлкните по снимку туда, где видна эта точка.</p>}

      <p className="hint">Строка для panoramas.json:</p>
      <pre className="code" data-testid="calibrate-line">{line}</pre>
      {changed && (
        <button type="button" className="button button--small" onClick={onReset}>
          Вернуть как в данных
        </button>
      )}
    </section>
  );
}
