import { useCallback, useEffect, useState } from 'react';
import { api, fileToUploadPayload } from '../api';
import { compressImage } from '../utils/image';

// Scoped to one specific account — a funded/payout certificate belongs to
// the account it was earned on.
export function useCertificates(accountId) {
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      setCertificates(await api.get(`/api/certificates?account=${accountId}`));
    } catch (e) {
      console.error('Failed to load certificates:', e);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  async function addCertificate({ type, firm, amount, date, file }) {
    const filePayload = file ? await fileToUploadPayload(await compressImage(file)) : null;
    await api.post(`/api/certificates?account=${accountId}`, { type, firm, amount, date, file: filePayload });
    await load();
  }

  async function removeCertificate(certId) {
    await api.del(`/api/certificates?account=${accountId}&id=${certId}`);
    await load();
  }

  return { certificates, loading, addCertificate, removeCertificate };
}
