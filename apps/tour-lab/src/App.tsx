import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CAMPUS_BUILDING_ID, normalizeDegrees, panoramaLinks } from '@campus-map/core';
import type { Panorama } from '@campus-map/core';
import { CalibratePanel } from './components/CalibratePanel';
import { LinkList } from './components/LinkList';
import { MiniPlan } from './components/MiniPlan';
import { PanoramaView } from './components/PanoramaView';
import type { ViewRequest } from './components/PanoramaView';
import { RoutePanel } from './components/RoutePanel';
import { planLabel, spotName } from './tour/describe';
import { panOf, worldBearing } from './tour/frame';
import { loadTour } from './tour/loadTour';
import type { Tour } from './tour/loadTour';
import { planKeyOf, plansWithPanoramas } from './tour/plans';
import { buildTourRoute } from './tour/route';

export function App() {
  const [tour, setTour] = useState<Tour | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    loadTour().then(
      (loaded) => {
        for (const warning of loaded.warnings) console.warn(warning);
        setTour(loaded);
      },
      (cause: unknown) => setFailure(cause instanceof Error ? cause.message : String(cause))
    );
  }, []);

  if (failure) return <Notice title="Данные не загрузились">{failure}</Notice>;
  if (!tour) return <Notice title="Загрузка…" />;
  if (tour.panoramas.size === 0) {
    return (
      <Notice title="Панорам нет">
        В данных нет <code>panoramas.json</code> или в нём ни одного снимка с известной точкой графа.
      </Notice>
    );
  }
  return <TourScreen tour={tour} />;
}

function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="notice">
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </main>
  );
}

/** Направление из данных с правками этого окна. */
function withHeadings(panoramas: ReadonlyMap<string, Panorama>, headings: ReadonlyMap<string, number>) {
  if (headings.size === 0) return panoramas;
  const result = new Map(panoramas);
  for (const [node, heading] of headings) {
    const panorama = result.get(node);
    if (panorama) result.set(node, { ...panorama, heading });
  }
  return result;
}

/** Точка открытия: `?at=` из адреса, иначе первый снимок территории, иначе любой. */
function startNode(tour: Tour): string {
  const requested = new URLSearchParams(window.location.search).get('at');
  if (requested && tour.panoramas.has(requested)) return requested;
  const ids = [...tour.panoramas.keys()];
  return ids.find((id) => tour.graph.getNode(id)?.building === CAMPUS_BUILDING_ID) ?? ids[0];
}

/**
 * Маршрут по умолчанию — `?from=&to=` из адреса, на тестовом кампусе — от
 * площади до деканата: вход, холл, лифт, второй этаж.
 */
function defaultRoute(tour: Tour, start: string): [string, string] {
  const params = new URLSearchParams(window.location.search);
  const known = (id: string | null) => (id !== null && tour.graph.hasNode(id) ? id : null);
  const from = known(params.get('from')) ?? known('campus_square') ?? start;
  const to = known(params.get('to')) ?? known('a2_dean') ?? tour.dataset.aliases.at(-1)?.id ?? start;
  return [from, to];
}

function TourScreen({ tour }: { tour: Tour }) {
  const start = useMemo(() => startNode(tour), [tour]);
  const [headings, setHeadings] = useState<ReadonlyMap<string, number>>(new Map());
  const panoramas = useMemo(() => withHeadings(tour.panoramas, headings), [tour, headings]);

  const [current, setCurrent] = useState(start);
  const [placeholder, setPlaceholder] = useState(false);
  const [viewYaw, setViewYaw] = useState<number | null>(null);
  const [request, setRequest] = useState<ViewRequest | null>(null);
  const seq = useRef(0);
  const show = useCallback((node: string, yaw: number | null, reload = false) => {
    seq.current += 1;
    setRequest({ node, yaw, reload, seq: seq.current });
  }, []);

  const [plan, setPlan] = useState<string | null>(null);
  const [mode, setMode] = useState<'tour' | 'calibrate'>('tour');
  const [calibrateTarget, setCalibrateTarget] = useState<string | null>(null);

  const [[from, to], setEnds] = useState<[string, string]>(() => defaultRoute(tour, start));
  const route = useMemo(
    () => buildTourRoute(tour, panoramas, tour.planRotation, from, to),
    [tour, panoramas, from, to]
  );
  const routeNext = useMemo(
    () => new Map((route?.views ?? []).flatMap((view) => (view.next ? [[view.node, view.next] as const] : []))),
    [route]
  );

  const links = useMemo(
    () => panoramaLinks(tour.graph, panoramas, current, { planRotation: tour.planRotation }),
    [tour, panoramas, current]
  );

  const rotationOf = useCallback(
    (id: string) => {
      const node = tour.graph.getNode(id);
      return node ? (tour.planRotation(node.building, node.floor) ?? 0) : 0;
    },
    [tour]
  );

  // Сменился маршрут — у открытого снимка другая выделенная стрелка.
  const routeKey = JSON.stringify([...routeNext]);
  const firstRouteKey = useRef(routeKey);
  const latestView = useRef({ current, viewYaw });
  latestView.current = { current, viewYaw };
  useEffect(() => {
    if (routeKey === firstRouteKey.current) return;
    firstRouteKey.current = routeKey;
    show(latestView.current.current, latestView.current.viewYaw, true);
  }, [routeKey, show]);

  const viewOnRoute = (node: string) => route?.views.find((view) => view.node === node) ?? null;
  const showView = (node: string) => {
    const view = viewOnRoute(node);
    show(node, view?.bearing == null ? null : worldBearing(view.bearing, rotationOf(node)));
  };

  const onImageClick = (imageDegrees: number) => {
    if (mode !== 'calibrate' || !calibrateTarget) return;
    const link = links.find((entry) => entry.target === calibrateTarget);
    const panorama = panoramas.get(current);
    if (!link || link.bearing === null || !panorama) return;

    // Сосед виден под углом щелчка — значит, середина снимка смотрит на
    // направление соседа минус этот угол.
    const heading = normalizeDegrees(link.bearing - imageDegrees);
    const rotation = rotationOf(current);
    const before = panOf(panorama.heading ?? 0, rotation);
    const after = panOf(heading, rotation);
    setHeadings((previous) => new Map(previous).set(current, heading));
    setCalibrateTarget(null);
    // Снимок не должен прыгнуть: тот же вид, другая поправка.
    show(current, viewYaw === null ? null : normalizeDegrees(viewYaw - before + after), true);
  };

  const resetHeading = () => {
    const panorama = tour.panoramas.get(current);
    const edited = panoramas.get(current);
    if (!panorama || !edited) return;
    const rotation = rotationOf(current);
    const before = panOf(edited.heading ?? 0, rotation);
    const after = panOf(panorama.heading ?? 0, rotation);
    setHeadings((previous) => {
      const next = new Map(previous);
      next.delete(current);
      return next;
    });
    show(current, viewYaw === null ? null : normalizeDegrees(viewYaw - before + after), true);
  };

  const currentNode = tour.graph.getNode(current);
  const plans = plansWithPanoramas(tour, panoramas);
  const shownPlanKey = plan ?? (currentNode ? planKeyOf(currentNode) : planKeyOf(plans[0]));
  const shownPlan = plans.find((entry) => planKeyOf(entry) === shownPlanKey) ?? plans[0];
  // Шаг маршрута, чей снимок открыт: подсветка идёт за человеком, куда бы он ни шагнул.
  const activeStep = route ? route.steps.findIndex((step) => step.view?.node === current) : -1;
  const next = routeNext.get(current) ?? null;
  const previous = [...routeNext].find(([, target]) => target === current)?.[0] ?? null;

  return (
    <div className="app">
      <header className="app__header">
        <h1>Экскурсия 360° — прототип</h1>
        <p>
          Снимки — открытые (CC0, Poly Haven), это не наш вуз: стрелки ведут по графу тестового кампуса, а не к
          дверям на фото.
        </p>
      </header>

      <main className="layout">
        <section className="layout__view" aria-label="Панорама">
          <PanoramaView
            tour={tour}
            panoramas={panoramas}
            start={start}
            request={request}
            routeNext={routeNext}
            onNode={(node, isPlaceholder) => {
              setCurrent(node);
              setPlaceholder(isPlaceholder);
              setPlan(null);
            }}
            onView={setViewYaw}
            onImageClick={onImageClick}
          />
          <div className="view-bar" data-testid="view-bar">
            <div>
              <strong>{spotName(tour, current)}</strong>
              <span>{currentNode ? planLabel(tour, currentNode) : ''}</span>
              {placeholder && <span className="badge">снимка нет — заглушка-компас</span>}
            </div>
            {(previous || next) && (
              <div className="view-bar__route">
                <button type="button" className="button button--small" disabled={!previous} onClick={() => previous && showView(previous)}>
                  ‹ Назад по маршруту
                </button>
                <button type="button" className="button button--small button--accent" disabled={!next} onClick={() => next && showView(next)}>
                  Дальше по маршруту ›
                </button>
              </div>
            )}
          </div>
        </section>

        <aside className="layout__side">
          <section className="panel-section" aria-labelledby="links-title">
            <h2 id="links-title">Куда отсюда</h2>
            <LinkList
              tour={tour}
              current={current}
              links={links}
              viewYaw={viewYaw}
              routeNext={next}
              onGo={(target, yaw) => show(target, yaw)}
            />
          </section>

          <section className="panel-section" aria-labelledby="plan-title">
            <h2 id="plan-title">Где снимки</h2>
            {plans.length > 1 && (
              <div className="tabs" role="tablist" aria-label="План">
                {plans.map((entry) => (
                  <button
                    key={planKeyOf(entry)}
                    type="button"
                    role="tab"
                    aria-selected={planKeyOf(entry) === planKeyOf(shownPlan)}
                    className="tabs__tab"
                    onClick={() => setPlan(planKeyOf(entry))}
                  >
                    {planLabel(tour, entry)}
                  </button>
                ))}
              </div>
            )}
            <MiniPlan
              tour={tour}
              panoramas={panoramas}
              plan={shownPlan}
              current={current}
              viewYaw={viewYaw}
              routePath={route?.path ?? null}
              onSelect={(node) => show(node, null)}
            />
          </section>

          <RoutePanel
            tour={tour}
            from={from}
            to={to}
            route={route}
            activeStep={activeStep < 0 ? null : activeStep}
            onChange={(nextFrom, nextTo) => setEnds([nextFrom, nextTo])}
            onShowStep={(index) => {
              const view = route?.steps[index]?.view;
              if (!view) return;
              show(view.node, view.bearing === null ? null : worldBearing(view.bearing, rotationOf(view.node)));
            }}
          />

          <section className="panel-section">
            <label className="toggle">
              <input
                type="checkbox"
                checked={mode === 'calibrate'}
                onChange={(event) => {
                  setMode(event.target.checked ? 'calibrate' : 'tour');
                  setCalibrateTarget(null);
                }}
                data-testid="calibrate-toggle"
              />
              Настроить направление снимка
            </label>
          </section>
          {mode === 'calibrate' && panoramas.get(current) && (
            <CalibratePanel
              tour={tour}
              panorama={panoramas.get(current)!}
              original={tour.panoramas.get(current)?.heading ?? null}
              links={links}
              target={calibrateTarget}
              onTarget={setCalibrateTarget}
              onReset={resetHeading}
            />
          )}
        </aside>
      </main>
    </div>
  );
}
