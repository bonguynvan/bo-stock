"use client";

import { useEffect, useRef, useState } from "react";

export interface Polling<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Fetch once (and optionally re-fetch every `intervalMs`), keeping the last good
 * value on error. Consolidates the cancelled-flag + interval + loading/error
 * boilerplate the self-fetching panels previously each re-implemented.
 *
 * `fetcher` may be an inline closure — it is read through a ref so its changing
 * identity does not restart the interval (only `intervalMs` does).
 */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs?: number): Polling<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetcherRef
        .current()
        .then((d) => {
          if (!cancelled) {
            setData(d);
            setError(null);
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    load();
    if (!intervalMs) return () => {
      cancelled = true;
    };
    const timer = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return { data, error, loading };
}
