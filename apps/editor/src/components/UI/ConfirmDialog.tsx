import React from 'react';

type Props = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
};

export const ConfirmDialog: React.FC<Props> = ({ title, open, onClose, children, footer }) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl mx-4 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--editor-panel)',
          border: '1px solid var(--editor-border)',
        }}
      >
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--editor-border)' }}>
          <div className="text-white font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg"
            style={{ color: 'var(--editor-text-muted)' }}
            aria-label="Закрыть"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5">{children}</div>

        <div className="px-5 py-4 flex justify-end gap-2" style={{ borderTop: '1px solid var(--editor-border)' }}>
          {footer}
        </div>
      </div>
    </div>
  );
};