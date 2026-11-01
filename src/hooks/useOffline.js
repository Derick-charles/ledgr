import { useEffect, useState } from 'react';
import { isOffline, subscribeOffline } from '../utils/connection.js';

// true while the app is read-only (no connection, or showing saved data).
export function useOffline() {
  const [offline, setOffline] = useState(isOffline());
  useEffect(() => {
    setOffline(isOffline());
    return subscribeOffline(setOffline);
  }, []);
  return offline;
}
