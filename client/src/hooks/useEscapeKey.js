import { useEffect } from 'react';

export default function useEscapeKey(handler) {
  useEffect(() => {
    const listener = (e) => {
      if (e.key === 'Escape') handler();
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [handler]);
}
