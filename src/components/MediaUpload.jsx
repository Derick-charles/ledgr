import { useRef, useState } from 'react';
import { clickable } from '../utils/a11y.js';
import { api, fileToUploadPayload, MAX_UPLOAD_BYTES } from '../api';
import { compressImage } from '../utils/image';
import Lightbox from './Lightbox';
import { useOffline } from '../hooks/useOffline';

export default function MediaUpload({ entry, saveEntry }) {
  const offline = useOffline();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(0); // number of files currently uploading
  const [linkText, setLinkText] = useState('');
  const [linkError, setLinkError] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const inputRef = useRef(null);

  const mediaUrls = entry.mediaUrls || [];
  // Links open in a new tab on click instead of enlarging — nothing to view bigger about a URL.
  const viewableItems = mediaUrls.filter((m) => m.type !== 'link');

  function handleFiles(fileList) {
    [...fileList].forEach(async (original) => {
      if (!original.type.startsWith('image/') && !original.type.startsWith('video/')) return;
      setUploading((n) => n + 1);
      try {
        // Screenshots are shrunk first, so only genuinely huge files (or long
        // video clips, which can't be compressed here) hit the limit.
        const file = await compressImage(original);
        if (file.size > MAX_UPLOAD_BYTES) {
          alert(`${original.name} is still over 4.5MB — that's the per-file limit on Netlify Functions. Pick a shorter clip or a smaller image.`);
          return;
        }
        const payload = await fileToUploadPayload(file);
        const { id, url } = await api.post('/api/media', payload);
        const next = [...(entry.mediaUrls || []), { url, id, type: file.type.startsWith('video/') ? 'video' : 'image' }];
        await saveEntry({ mediaUrls: next });
      } catch (e) {
        console.error('Upload failed:', e);
        alert(`Could not upload ${file.name}: ${e.message}`);
      } finally {
        setUploading((n) => n - 1);
      }
    });
  }

  async function removeMedia(item) {
    // "link-…" ids never had a Blobs upload backing them — nothing to delete server-side.
    if (!item.id?.startsWith('link-')) {
      try { await api.del(`/api/media?id=${item.id}`); } catch (e) { console.warn('Could not delete media:', e); }
    }
    await saveEntry({ mediaUrls: mediaUrls.filter((m) => m.id !== item.id) });
  }

  function hostnameOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  }

  function handleAddLink() {
    const trimmed = linkText.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) {
      setLinkError('Link needs to start with http:// or https://');
      return;
    }
    const next = [...mediaUrls, { url: trimmed, id: `link-${Date.now()}`, type: 'link' }];
    saveEntry({ mediaUrls: next });
    setLinkText('');
    setLinkError('');
  }

  return (
    <>
      <span className="field-label">Reference Media</span>
      {!offline && <>
      <div
        className={`media-dropzone${dragOver ? ' dragover' : ''}`}
        {...clickable(() => inputRef.current.click())}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 18a4 4 0 0 1-1-7.9A5 5 0 0 1 16 8a4.5 4.5 0 0 1 1 8.9" />
          <polyline points="9 15 12 12 15 15" /><line x1="12" y1="12" x2="12" y2="21" />
        </svg>
        <div className="dz-text">Drop chart screenshots or clips here, or <span className="dz-browse">browse</span></div>
        <div className="dz-sub">
          {uploading > 0 ? `Uploading ${uploading} file${uploading !== 1 ? 's' : ''}…` : 'PNG, JPG, MP4, MOV — up to 4.5MB each'}
        </div>
        <input ref={inputRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
      </div>

      <div className="checklist-add-row" style={{ marginTop: 10, marginBottom: mediaUrls.length ? 10 : 0 }}>
        <input
          type="text" placeholder="…or paste a link instead (TradingView replay, YouTube, etc.)" value={linkText}
          onChange={(e) => { setLinkText(e.target.value); setLinkError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAddLink(); }}
        />
        <button type="button" className="btn btn-ghost" onClick={handleAddLink}>Add link</button>
      </div>
      {linkError && <div style={{ color: 'var(--negative)', fontSize: 11.5, marginTop: -4, marginBottom: 10 }}>{linkError}</div>}
      </>}

      {mediaUrls.length > 0 && (
        <div className="media-grid">
          {mediaUrls.map((item) => (
            <div className={`media-thumb${item.type === 'link' ? ' link-thumb' : ''}`} key={item.id}>
              {item.type === 'link' ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  <span className="link-host">{hostnameOf(item.url)}</span>
                </a>
              ) : (
                <button
                  type="button" className="media-thumb-open"
                  onClick={() => setLightboxIndex(viewableItems.findIndex((m) => m.id === item.id))}
                  title="Click to enlarge"
                >
                  {item.type === 'video' ? (
                    <><video src={item.url} muted playsInline /><span className="vid-badge">▶ VIDEO</span></>
                  ) : (
                    <img src={item.url} alt="" />
                  )}
                </button>
              )}
              {!offline && <button className="remove-btn" onClick={(e) => { e.stopPropagation(); removeMedia(item); }} title="Remove">×</button>}
            </div>
          ))}
        </div>
      )}

      <Lightbox items={viewableItems} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} />
    </>
  );
}
