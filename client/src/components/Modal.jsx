import useEscapeKey from '../hooks/useEscapeKey.js';

const CENTERED_SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

const SHEET_SIZES = {
  sm: 'md:max-w-sm',
  md: 'md:max-w-md',
  lg: 'md:max-w-lg',
  xl: 'md:max-w-xl',
};

export default function Modal({
  onClose,
  children,
  size = 'md',
  variant = 'centered',
  panelClassName = '',
}) {
  useEscapeKey(onClose);

  if (variant === 'mobileSheet') {
    const sizeCls = SHEET_SIZES[size] || SHEET_SIZES.md;
    return (
      <div
        className="fixed inset-0 z-30 flex bg-black/60 md:items-center md:justify-center md:p-4"
        onClick={onClose}
      >
        <div
          className={`flex h-full w-full flex-col bg-surface-800 md:h-auto md:max-h-[80vh] md:rounded-lg md:border md:border-surface-600/60 md:shadow-xl ${sizeCls} ${panelClassName}`}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    );
  }

  const sizeCls = CENTERED_SIZES[size] || CENTERED_SIZES.md;
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className={`w-full rounded-lg border border-surface-600/60 bg-surface-800 shadow-xl ${sizeCls} ${panelClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
