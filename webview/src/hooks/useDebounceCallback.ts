import { useEffect, useRef, useMemo } from 'react';

export interface DebouncedFunction<T extends (...args: any[]) => void> {
  (...args: Parameters<T>): void;
  cancel: () => void;
}

export function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): DebouncedFunction<T> {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  // 현재 콜백의 최신 상태를 유지
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // 언마운트 시 클린업
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const debouncedFunction = useMemo(() => {
    const fn = (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    };

    fn.cancel = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    return fn as DebouncedFunction<T>;
  }, [delay]);

  return debouncedFunction;
}
