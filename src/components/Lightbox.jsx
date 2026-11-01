import { useEffect } from 'react';

// items: [{ url, type: 'image'|'video' }, ...] — link-type items should be
// filtered out by the caller before passing them in, since there's nothing
// to enlarge about a URL (those just open in a new tab instead).
export default function Lightbox({ items, index, onClose, onNavigate }) {
  const active = index !== null && items[index];

  useEffect(() => {
    if (!active) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNavigate((index + 1) % items.length);
      if (e.key === 'ArrowLeft') onNavigate((index - 1 + items.length) % items.length);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, index, items.length, onClose, onNavigate]);

  if (!active) return null;
  const item = items[index];

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} title="Close (Esc)">×</button>
      {items.length > 1 && (
        <>
          <button
            className="lightbox-nav prev"
            onClick={(e) => { e.stopPropagation(); onNavigate((index - 1 + items.length) % items.length); }}
            title="Previous (←)"
          >‹</button>
          <button
            className="lightbox-nav next"
            onClick={(e) => { e.stopPropagation(); onNavigate((index + 1) % items.length); }}
            title="Next (→)"
          >›</button>
        </>
      )}
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        {item.type === 'video' ? <video src={item.url} controls autoPlay /> : <img src={item.url} alt="" />}
      </div>
      {items.length > 1 && <div className="lightbox-counter">{index + 1} / {items.length}</div>}
    </div>
  );
}
