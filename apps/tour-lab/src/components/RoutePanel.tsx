import { useMemo } from 'react';
import { planLabel } from '../tour/describe';
import type { Tour } from '../tour/loadTour';
import type { TourRoute } from '../tour/route';

interface RoutePanelProps {
  tour: Tour;
  from: string;
  to: string;
  route: TourRoute | null;
  activeStep: number | null;
  onChange: (from: string, to: string) => void;
  onShowStep: (index: number) => void;
}

/** Маршрут и «показать этот поворот» у каждого шага. */
export function RoutePanel({ tour, from, to, route, activeStep, onChange, onShowStep }: RoutePanelProps) {
  const places = useMemo(
    () =>
      tour.dataset.aliases
        .filter((entry) => tour.graph.hasNode(entry.id) && (entry.names?.length ?? 0) > 0)
        .map((entry) => {
          const node = tour.graph.getNode(entry.id)!;
          return { id: entry.id, label: `${entry.names![0]} — ${planLabel(tour, node)}` };
        })
        .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
    [tour]
  );

  const minutes = route?.durationSeconds == null ? null : Math.max(1, Math.round(route.durationSeconds / 60));

  return (
    <section className="panel-section" aria-labelledby="route-title">
      <h2 id="route-title">Маршрут со снимками</h2>
      <div className="route-form">
        <label>
          Откуда
          <select value={from} onChange={(event) => onChange(event.target.value, to)} data-testid="route-from">
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Куда
          <select value={to} onChange={(event) => onChange(from, event.target.value)} data-testid="route-to">
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {route === null ? (
        <p className="hint">Между этими точками пути нет.</p>
      ) : (
        <>
          {minutes !== null && <p className="hint">Около {minutes} мин пешком.</p>}
          <ol className="steps">
            {route.steps.map((step, index) => (
              <li key={`${step.range[0]}-${step.range[1]}`} className={index === activeStep ? 'steps__item steps__item--active' : 'steps__item'}>
                <div>
                  <strong>{step.title}</strong>
                  <span className="steps__place">{step.place}</span>
                </div>
                {step.view ? (
                  <button type="button" className="button button--small" onClick={() => onShowStep(index)} data-step={index}>
                    Показать этот поворот
                  </button>
                ) : (
                  <span className="steps__none">снимка нет</span>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
