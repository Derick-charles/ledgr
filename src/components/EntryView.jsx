import { useState } from 'react';
import Lightbox from './Lightbox';
import { useEscape } from '../hooks/useEscape.js';
import { useOffline } from '../hooks/useOffline';
import { fmtR } from '../utils/backtestView';
import { tfList } from '../../netlify/functions/_backtest-utils.js';

const SIDE = { long: 'Long', short: 'Short', missed: 'Missed trade', breakeven: 'Breakeven' };

// Read-only look at one entry, with Edit and Delete.
export default function EntryView({ entry: e, locked, onEdit, onDelete, onClose }) {
  const offline = useOffline();
  useEscape(onClose);
  const [shot, setShot] = useState(null);
  const shots = (e.media || []).filter((m) => m.type !== 'link').map((m) => ({ url: m.url, type: m.type === 'video' ? 'video' : 'image' }));
  const tfs = tfList(e);
  const missed = e.side === 'missed';
  const tone = missed ? '' : e.r > 0 ? 'pos' : e.r < 0 ? 'neg' : '';
  const outcome = missed ? { label: 'Missed', cls: 'review' } : e.side === 'breakeven' || e.r === 0 ? { label: 'Breakeven', cls: 'plain' } : e.r > 0 ? { label: 'Win', cls: 'validated' } : { label: 'Loss', cls: 'rejected' };
  const prices = [['Entry', e.entryPrice], ['Stop', e.stopPrice], ['Exit', e.exitPrice]].filter(([, v]) => v !== null && v !== undefined && v !== '');
  const rows = [
    ['Date', [e.date, e.time].filter(Boolean).join(' · ')],
    ['Direction', SIDE[e.side] || ''],
    ['Timeframes', tfs.join(' › ')],
    ['Setup', e.setup],
    ...(missed ? [] : [['Followed rules', e.followed === false ? 'No — broke a rule' : 'Yes']]),
  ].filter(([, v]) => v);

  return (
    <div className="modal-overlay open" onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="modal-card glass" role="dialog" aria-modal="true" aria-label="Entry details" style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <h3>{e.symbol || 'Trade'}{SIDE[e.side] && e.side !== 'missed' && e.side !== 'breakeven' ? ` · ${SIDE[e.side]}` : ''}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <div className="bt-view-top">
            <b className={`bt-view-r ${tone}`}>{missed ? `(${fmtR(e.r)})` : fmtR(e.r)}</b>
            <span className={`bt-tag ${outcome.cls}`}>{outcome.label}</span>
          </div>
          {missed && <div className="bt-fine">Not taken — left out of the win rate and drawdown. The R shown is what it would have made.</div>}

          <dl className="bt-view-list">
            {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            {prices.length > 0 && <div><dt>Prices</dt><dd>{prices.map(([k, v]) => `${k} ${v}`).join('  ·  ')}</dd></div>}
          </dl>

          {e.notes && <div className="bt-view-notes"><div className="bt-view-label">Notes</div>{e.notes}</div>}
          {e.media && e.media.length > 0 && (
            <div className="bt-view-shots">
              {e.media.map((m, i) => <button key={m.id} type="button" className="bt-shot" onClick={() => setShot(i)} aria-label={`View screenshot ${i + 1} of ${e.media.length}`}><img src={m.url} alt="" loading="lazy" /></button>)}
            </div>
          )}
        </div>
        <div className="modal-actions">
          {!offline && !locked && <button type="button" className="btn btn-ghost glass bt-danger" style={{ marginRight: 'auto' }} onClick={onDelete}>Delete</button>}
          <button type="button" className="btn btn-ghost glass" onClick={onClose}>Close</button>
          {!offline && !locked && <button type="button" className="btn btn-primary" onClick={onEdit}>Edit</button>}
        </div>
      </div>
      <Lightbox items={shots} index={shot} onClose={() => setShot(null)} onNavigate={setShot} />
    </div>
  );
}
