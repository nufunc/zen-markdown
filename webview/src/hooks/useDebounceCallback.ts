import { useEffect, useRef, useMemo } from 'react';

export interface DebouncedFunction<T extends (...args: any[]) => void> {
  (...args: Parameters<T>): void;
  cancel: () => void;
  /** 대기 중인 호출을 즉시 실행한다. 대기 중인 것이 없으면 아무 일도 하지 않는다. */
  flush: () => void;
  /** 대기 중인 호출이 있는가 */
  isPending: () => boolean;
}

export function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): DebouncedFunction<T> {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  // 마지막 호출 인자 — flush가 대기 중인 호출을 그대로 재현하는 데 쓴다
  const argsRef = useRef<Parameters<T> | null>(null);

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
      argsRef.current = args;
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        argsRef.current = null;
        callbackRef.current(...args);
      }, delay);
    };

    fn.cancel = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      argsRef.current = null;
    };

    fn.flush = () => {
      if (!timeoutRef.current) return;
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      const args = argsRef.current;
      argsRef.current = null;
      if (args) callbackRef.current(...args);
    };

    fn.isPending = () => timeoutRef.current !== null;

    return fn as DebouncedFunction<T>;
  }, [delay]);

  return debouncedFunction;
}
