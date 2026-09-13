import React from 'react';
import { messagesFor } from '../../i18n';
import { useSettingsStore } from '../../stores/settingsStore';

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Последний рубеж: ошибка отрисовки не оставляет человека с белым экраном.
 *
 * Класс, потому что перехватывать ошибки отрисовки умеют только классовые
 * компоненты. Хуков в классе нет, поэтому язык берётся из стора напрямую —
 * на момент ошибки он уже выбран.
 *
 * Здесь перезагрузка страницы уместна, в отличие от ошибки загрузки данных в
 * `App`: состояние React после ошибки отрисовки недостоверно, а маршрут
 * переживает перезагрузку — его концы записаны в адресе (`useRouteLink`).
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[campus-map] ошибка отрисовки', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.error === null) return this.props.children;

    const messages = messagesFor(useSettingsStore.getState().language);

    return (
      <div role="alert" className="h-full w-full flex items-center justify-center bg-gray-100 p-6">
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-semibold text-gray-800 mb-2">{messages.app.crashed}</h1>
          <p className="text-sm text-gray-600 mb-4">{messages.app.crashedHint}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            {messages.app.reload}
          </button>
        </div>
      </div>
    );
  }
}
