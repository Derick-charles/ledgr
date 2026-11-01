import { useState } from 'react';
import { clickable } from '../utils/a11y.js';
import { fmtMoney } from '../utils/stats';
import { formatShort } from '../utils/dateHelpers';
import CertificateModal from './CertificateModal';
import InfoTooltip from './InfoTooltip';
import { useOffline } from '../hooks/useOffline';

export default function CertificatesWall({ certificates, onAdd, onRemove }) {
  const [modalOpen, setModalOpen] = useState(false);
  const offline = useOffline();

  return (
    <div className="glass panel" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <h2>Certificates <InfoTooltip text="A record of funded accounts and payouts you've earned — proof of outcomes, kept separate from the process-based milestones above." /></h2>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{certificates.length} on the wall</span>
      </div>

      <div className="cert-grid">
        {certificates.map((cert) => (
          <div className="cert-card" key={cert.id}>
            <div className="cert-thumb">
              <span className={`cert-type-badge ${cert.type === 'Payout' ? 'payout' : 'funded'}`}>{cert.type}</span>
              {!offline && <button className="cert-remove" onClick={() => onRemove(cert.id)} title="Remove">×</button>}
              {cert.fileUrl ? (
                cert.fileType === 'image' ? <img src={cert.fileUrl} alt={cert.firm} /> : (
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v4h4" /></svg>
                )
              ) : (
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 2l2.9 6.3 6.9.8-5 4.8 1.3 6.8L12 17.5 5.9 20.7l1.3-6.8-5-4.8 6.9-.8L12 2z" /></svg>
              )}
            </div>
            <div className="cert-body">
              <div className="cert-firm">{cert.firm}</div>
              <div className="cert-amount">{fmtMoney(cert.amount)}</div>
              <div className="cert-date">{formatShort(cert.date)}</div>
            </div>
          </div>
        ))}

        {!offline && <div className="cert-add-card" {...clickable(() => setModalOpen(true))}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          <span style={{ fontSize: 12.5 }}>Add Certificate</span>
        </div>}
      </div>

      <CertificateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={async (cert) => { await onAdd(cert); setModalOpen(false); }}
      />
    </div>
  );
}
