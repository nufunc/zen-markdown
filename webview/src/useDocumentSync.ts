// 웹뷰와 VS Code 문서 사이의 동기화 계층.
//
// App.tsx에서 떼어낸 이유: 이 로직이 본문 여섯 자리에 흩어져 있어서 같은 판별 규칙이
// 복제됐고(한쪽만 고치면 어긋난다), 대기 중인 로컬 직렬화와 보류한 외부 변경이
// 서로를 덮어쓰는 경합이 어디서 나는지 코드에서 보이지 않았다.
//
// 이 훅이 지키는 규칙 셋:
//  1. 보류한 외부 변경이 있는 동안에는 로컬 텍스트를 호스트로 보내지 않는다.
//     낡은 전체 텍스트가 외부 변경을 덮어쓰기 때문이다.
//  2. 읽기 전용 문서에는 어떤 경로로도 쓰지 않는다.
//  3. 대기 중인 편집은 저장·탭 전환·언마운트 시점에 반드시 배출한다(flush).
import { useRef, useEffect } from 'react';
import { useDebouncedCallback } from './hooks/useDebounceCallback';
import { vscode } from './vscode';

/** 자기 편집 echo 판별용 정규화. 호스트(zenMdEditorProvider.ts)와 같은 규칙이어야 한다.
 *  빈 줄 개수와 줄 끝 공백은 마크다운에서 의미가 있으므로(문단 구분, 하드브레이크) 접지 않는다.
 *  접으면 진짜 외부 편집을 자기 echo로 오판해 버린다. */
export const normalizeMd = (str: string) => str.replace(/\r\n/g, '\n').trim();

/** 보류한 외부 변경을 로컬 편집이 잦아든 뒤 채택하기까지의 대기 시간 */
const PENDING_EXTERNAL_DELAY = 1500;

export interface DocumentSyncDeps {
  /** 현재 에디터 내용을 디스크에 쓸 전체 텍스트로 만든다. 만들 수 없으면 null. */
  buildDocumentText: () => Promise<string | null>;
  /** 외부 변경을 채택할 때 호출된다 (에디터를 그 내용으로 다시 그린다) */
  applyExternalText: (text: string) => void;
  /** 읽기 전용 문서인가 */
  isReadOnly: () => boolean;
}

export function useDocumentSync(deps: DocumentSyncDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  /** 호스트로 마지막에 보낸 전체 텍스트 — external_update가 자기 편집의 반사인지 판별용 */
  const lastSentTextRef = useRef<string>('');
  /** 에디터에 마지막으로 반영한 텍스트 — 같은 내용의 이중 파싱 방지 */
  const lastInitializedTextRef = useRef<string | null>(null);

  const pendingExternalRef = useRef<string | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canSend = () => pendingExternalRef.current === null && !depsRef.current.isReadOnly();

  // 매 키입력마다 전체 문서를 교체하지 않도록 300ms 디바운스
  const postChange = useDebouncedCallback((text: string) => {
    if (!canSend()) return;
    lastSentTextRef.current = text;
    vscode.postMessage({ type: 'change', text });
  }, 300);

  const serializeAndSend = async () => {
    if (!canSend()) return;
    try {
      const fullText = await depsRef.current.buildDocumentText();
      if (fullText === null) return;
      lastSentTextRef.current = fullText;
      lastInitializedTextRef.current = fullText;
      vscode.postMessage({ type: 'change', text: fullText });
    } catch (err) {
      console.error('Failed to serialize document', err);
    }
  };

  const debouncedSerialize = useDebouncedCallback(serializeAndSend, 600);

  /** 대기 중인 편집을 즉시 배출한다. 저장 직전과 탭 전환에서 부른다. */
  const flush = async () => {
    if (postChange.isPending()) postChange.flush();
    if (debouncedSerialize.isPending()) {
      debouncedSerialize.cancel();
      await serializeAndSend();
    }
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const clearPendingTimer = () => {
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  };

  /** 보류한 외부 변경을 채택한다. 마지막 전송 이후의 로컬 편집은 버려진다.
   *  웹뷰가 문서 전체를 치환하는 구조라 두 편집을 병합할 수 없으므로 사용자에게 알린다. */
  const consumeExternal = () => {
    clearPendingTimer();
    const incoming = pendingExternalRef.current;
    if (incoming === null) return;
    pendingExternalRef.current = null;
    if (normalizeMd(incoming) === normalizeMd(lastSentTextRef.current)) return;
    // 대기 중인 로컬 직렬화는 외부 변경 이전 문서 기준이라 stale이다
    debouncedSerialize.cancel();
    postChange.cancel();
    depsRef.current.applyExternalText(incoming);
    vscode.postMessage({ type: 'notify', message: 'This file changed outside the editor. The editor reloaded it.' });
  };
  const consumeExternalRef = useRef(consumeExternal);
  consumeExternalRef.current = consumeExternal;

  /** 외부 변경을 붙들어 둔다. 편집이 잦아들면 focusout을 기다리지 않고 채택한다. */
  const holdExternal = (text: string) => {
    pendingExternalRef.current = text;
    clearPendingTimer();
    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      consumeExternalRef.current();
    }, PENDING_EXTERNAL_DELAY);
  };

  /** 아직 편집 중임을 알린다 — 보류분의 채택을 미룬다 */
  const deferPending = () => {
    if (pendingExternalRef.current === null || !pendingTimerRef.current) return;
    clearPendingTimer();
    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      consumeExternalRef.current();
    }, PENDING_EXTERNAL_DELAY);
  };

  const isHolding = () => pendingExternalRef.current !== null;

  // 포커스가 에디터 밖으로 나가면 보류분을 채택한다
  useEffect(() => {
    const onFocusOut = (e: FocusEvent) => {
      const target = e.relatedTarget as Element | null;
      if (!target?.closest?.('.bn-editor, .ProseMirror, .bn-container')) {
        consumeExternalRef.current();
      }
    };
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusout', onFocusOut);
      clearPendingTimer();
    };
  }, []);

  // 탭이 숨겨지거나 창을 벗어나거나 언마운트될 때 대기 중인 편집을 배출한다.
  // 디바운스 만료 전에 탭이 닫히면 그 편집이 유실되기 때문이다.
  useEffect(() => {
    const flushNow = () => { void flushRef.current(); };
    document.addEventListener('visibilitychange', flushNow);
    window.addEventListener('pagehide', flushNow);
    return () => {
      document.removeEventListener('visibilitychange', flushNow);
      window.removeEventListener('pagehide', flushNow);
      flushNow();
    };
  }, []);

  return {
    lastSentTextRef,
    lastInitializedTextRef,
    postChange,
    debouncedSerialize,
    flush: () => flushRef.current(),
    holdExternal,
    consumeExternal: () => consumeExternalRef.current(),
    deferPending,
    isHolding,
  };
}
