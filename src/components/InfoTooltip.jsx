import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Hover or keyboard focus shows it on desktop; tapping the "i" pins it open on
// touch devices (no hover there). The bubble only exists in layout while it is
// showing — a hidden-but-positioned bubble near the right edge used to stretch
// the page sideways and cause a horizontal scrollbar — and when it opens it is
// nudged back inside the screen if it would run off either edge.
export default function InfoTooltip({ text, align = 'left' }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [shift, setShift] = useState(0);
  const ref = useRef(null);
  const bubbleRef = useRef(null);
  const visible = hover || pinned;

  useEffect(() => {
    if (!pinned) return undefined;
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setPinned(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [pinned]);

  // Keep the bubble fully on screen.
  useLayoutEffect(() => {
    if (!visible) { setShift(0); return; }
    const el = bubbleRef.current;
    if (!el) return;
    const edge = 8;
    const r = el.getBoundingClientRect();
    const base = { left: r.left - shift, right: r.right - shift };
    const vw = document.documentElement.clientWidth;
    let dx = 0;
    if (base.right > vw - edge) dx = vw - edge - base.right;
    if (base.left + dx < edge) dx = edge - base.left;
    if (Math.round(dx) !== Math.round(shift)) setShift(dx);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span
      className="info-tooltip" ref={ref}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)} onBlur={() => setHover(false)}
    >
      <button
        type="button"
        className="info-tooltip-btn"
        aria-label="More info"
        aria-expanded={visible}
        onClick={(e) => { e.stopPropagation(); setPinned((o) => !o); }}
      >
        i
      </button>
      <div
        ref={bubbleRef} role="tooltip"
        className={`info-tooltip-bubble align-${align}${visible ? ' is-open' : ''}`}
        style={shift ? { marginLeft: shift } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {text}
      </div>
    </span>
  );
}
