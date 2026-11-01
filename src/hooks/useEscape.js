import { useEffect } from 'react';

// Closes a dialog when Escape is pressed (the keyboard equivalent of
// clicking the dimmed backdrop).
export function useEscape(onClose, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    // An open image viewer handles its own Escape first.
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.lightbox-overlay')) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, active]);
}
