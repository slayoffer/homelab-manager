import { useState, useCallback, useEffect, useRef } from 'react';
import { useApi } from './useApi';

const DEFAULT_PATTERNS = [
  { pattern: 'ERROR|FATAL', is_regex: 1, notify: 1, enabled: 1 },
  { pattern: 'segfault', is_regex: 0, notify: 1, enabled: 1 },
  { pattern: 'OOM', is_regex: 0, notify: 1, enabled: 1 },
  { pattern: 'crash', is_regex: 0, notify: 0, enabled: 1 },
];

export function useLogAlerts() {
  const { get, post, del } = useApi();
  const [patterns, setPatterns] = useState([]);
  const [alertCount, setAlertCount] = useState(0);
  const alertCountRef = useRef(0);
  const loadedRef = useRef(false);

  // Load patterns from server
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    get('/workspaces/wow/alert-patterns').then(async (data) => {
      if (Array.isArray(data)) {
        if (data.length === 0) {
          // Seed defaults
          for (const p of DEFAULT_PATTERNS) {
            await post('/workspaces/wow/alert-patterns', p);
          }
          const seeded = await get('/workspaces/wow/alert-patterns');
          if (Array.isArray(seeded)) setPatterns(seeded);
        } else {
          setPatterns(data);
        }
      }
    });
  }, [get, post]);

  const checkEntry = useCallback((entry) => {
    for (const p of patterns) {
      if (!p.enabled) continue;
      try {
        const match = p.is_regex
          ? new RegExp(p.pattern, 'i').test(entry.raw || entry.text)
          : (entry.raw || entry.text).toLowerCase().includes(p.pattern.toLowerCase());
        if (match) {
          alertCountRef.current++;
          setAlertCount(alertCountRef.current);
          if (p.notify && document.hidden && Notification.permission === 'granted') {
            new Notification('Log Alert', {
              body: (entry.raw || entry.text).slice(0, 120),
              tag: 'log-alert',
            });
          }
          return true;
        }
      } catch {
        // invalid regex
      }
    }
    return false;
  }, [patterns]);

  const addPattern = useCallback(async (pattern, isRegex = false, notify = false) => {
    const result = await post('/workspaces/wow/alert-patterns', {
      pattern, isRegex: isRegex ? 1 : 0, notify: notify ? 1 : 0,
    });
    if (result?.id) {
      setPatterns(prev => [...prev, { id: result.id, pattern, is_regex: isRegex ? 1 : 0, notify: notify ? 1 : 0, enabled: 1 }]);
    }
  }, [post]);

  const removePattern = useCallback(async (id) => {
    await del(`/workspaces/wow/alert-patterns/${id}`);
    setPatterns(prev => prev.filter(p => p.id !== id));
  }, [del]);

  const togglePattern = useCallback(async (id) => {
    const pattern = patterns.find(p => p.id === id);
    if (!pattern) return;
    const newEnabled = pattern.enabled ? 0 : 1;
    await fetch(`/api/workspaces/wow/alert-patterns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: newEnabled }),
    });
    setPatterns(prev => prev.map(p => p.id === id ? { ...p, enabled: newEnabled } : p));
  }, [patterns]);

  const resetAlertCount = useCallback(() => {
    setAlertCount(0);
    alertCountRef.current = 0;
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window) {
      await Notification.requestPermission();
    }
  }, []);

  return {
    patterns, alertCount, checkEntry,
    addPattern, removePattern, togglePattern,
    resetAlertCount, requestNotificationPermission,
  };
}
