// Makes a non-<button> element (a chip, a calendar cell, a drop zone…) work
// from the keyboard and with screen readers: focusable, announced as a
// button, and activated by Enter or Space as well as a click.
//   <div {...clickable(() => doThing())}>…</div>
//   <div {...clickable(fn, { pressed: isSelected })}>…</div>   // toggle chips
//   <div {...clickable(fn, { label: 'Open 12 Oct' })}>…</div>
export function clickable(handler, { pressed, label } = {}) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: handler,
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return; // ignore keys typed in nested inputs
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler(e);
      }
    },
    ...(pressed === undefined ? {} : { 'aria-pressed': !!pressed }),
    ...(label ? { 'aria-label': label } : {}),
  };
}
