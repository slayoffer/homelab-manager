import { useState, useCallback } from 'react';

const BASE = '/api';

export function useApi() {
  const [loading, setLoading] = useState({});

  const request = useCallback(async (method, path, body) => {
    const key = `${method}:${path}`;
    setLoading(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      return data;
    } catch (err) {
      return { error: err.message };
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  }, []);

  const get = useCallback((path) => request('GET', path), [request]);
  const post = useCallback((path, body) => request('POST', path, body), [request]);
  const del = useCallback((path) => request('DELETE', path), [request]);

  const isLoading = useCallback((method, path) => !!loading[`${method}:${path}`], [loading]);

  return { get, post, del, isLoading, loading };
}
