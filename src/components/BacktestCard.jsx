import { clickable } from '../utils/a11y.js';
import { STATUS_META, cardFlags, fmtR, linkSource, monthLabel, youtubeThumb } from '../utils/backtestView';

const PLAY = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><polygon points="7 5 19 12 7 19 7 5" /></svg>
);
const LINK = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

// The picture area of a card: your uploaded image / clip, a YouTube
// thumbnail, or a dark tile with an icon when there's nothing to show.
export function BacktestThumb({ item }) {
  const image = item.media.find((m) => m.type === 'image');
  const clip = item.media.find((m) => m.type === 'video');
  const yt = !image && !clip ? youtubeThumb(item.link) : '';
  const source = linkSource(item.link);
  const chip = item.duration || source;
  return (
    <div className="bt-thumb">
      {image && <img src={image.url} alt="" loading="lazy" />}
      {!image && clip && <video src={`${clip.url}#t=0.1`} preload="metadata" muted playsInline />}
      {yt && <img src={yt} alt="" loading="lazy" />}
      {!image && !clip && !yt && <span className="bt-thumb-icon">{item.link && !item.duration ? LINK : PLAY}</span>}
      {(image || clip || yt) && <span className="bt-thumb-play">{PLAY}</span>}
      {chip && <span className="bt-thumb-chip">{chip}</span>}
    </div>
  );
}

export default function BacktestCard({ item, rules, onOpen }) {
  const meta = STATUS_META[item.status] || STATUS_META.review;
  const flags = cardFlags(item, rules);
  const s = item.stats;
  const sub = [monthLabel(item.month), item.strategy].filter(Boolean).join(' · ');
  return (
    <div className="bt-card" {...clickable(() => onOpen(item.id), { label: `Open ${item.title}` })}>
      <BacktestThumb item={item} />
      <div className="bt-card-body">
        <div className="bt-card-title">{item.title}</div>
        {sub && <div className="bt-card-sub">{sub}</div>}
        <div className="bt-card-stats">
          {s.trades ? `${Math.round(s.winRate)}% · ${fmtR(s.netR)} · ${s.trades} ${s.trades === 1 ? 'entry' : 'entries'}` : 'No entries yet'}
        </div>
        <div className="bt-tags">
          <span className={`bt-tag ${meta.cls}`}>{meta.label}</span>
          {flags.map((f) => <span key={f.label} className={`bt-tag ${f.tone}`}>{f.label}</span>)}
        </div>
      </div>
    </div>
  );
}
