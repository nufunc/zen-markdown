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
//  4. 전송하지 않은 로컬 편집이 있으면 외부 변경을 자동으로 채택하지 않고 사용자에게 묻는다.
import { useRef, useEffect, useState } from 'react';
import { useDebouncedCallback } from './hooks/useDebounceCallback';
import { vscode } from './vscode';

/** 자기 편집 echo 판별용 정규화. 호스트(zenMdEditorProvider.ts)와 같은 규칙이어야 한다.
 *  빈 줄 개수와 줄 끝 공백은 마크다운에서 의미가 있으므로(문단 구분, 하드브레이크) 접지 않는다.
 *  접으면 진짜 외부 편집을 자기 echo로 오판해 버린다. */
export const normalizeMd = (str: string) => str.replace(/\r\n/g, '\n').trim();

/** 보류한 외부 변경을 로컬 편집이 잦아든 뒤 채택하기까지의 대기 시간 */
const PENDING_EXTERNAL_DELAY = 1500;

export interface DocumentSyncDeps {
  /** 현재 에디터 내용을 디스크에 쓸 전체 텍스트로 만든다. 만들 수 없으면 null.
   *  final이면 저장 직전이므로 비용이 커도 결과를 끝까지 검증한다. */
  buildDocumentText: (final: boolean) => Promise<string | null>;
  /** 마지막으로 보낸 텍스트가 아직 검증되지 않아 저장 직전에 다시 만들어야 하는가 */
  needsFinalSerialize?: () => boolean;
  /** 외부 변경을 채택할 때 호출된다 (에디터를 그 내용으로 다시 그린다) */
  applyExternalText: (text: string) => void;
  /** 읽기 전용 문서인가 */
  isReadOnly: () => boolean;
  /** 호스트로 텍스트를 보낸 뒤 호출된다(머리 막대 단어 수) */
  onSent?: (text: string) => void;
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

  /** 마지막 입력 이후 아직 호스트로 보내지 못한 편집이 있는가.
   *  디바운스 대기 여부로는 판정할 수 없다. 보류 중에는 디바운스가 만료돼도 canSend()에 막혀
   *  전송 없이 끝나므로, 편집 시 켜고 실제로 보냈을 때만 끄는 플래그로 둔다. */
  const unsentRef = useRef(false);
  /** 전송하지 않은 로컬 편집과 보류한 외부 변경이 부딪쳐 사용자의 선택을 기다리는 중인가 */
  const [conflict, setConflict] = useState(false);

  const canSend = () => pendingExternalRef.current === null && !depsRef.current.isReadOnly();

  const send = (text: string) => {
    lastSentTextRef.current = text;
    unsentRef.current = false;
    vscode.postMessage({ type: 'change', text });
    depsRef.current.onSent?.(text);
  };

  // 매 키입력마다 전체 문서를 교체하지 않도록 300ms 디바운스
  const postChangeDebounced = useDebouncedCallback((text: string) => {
    if (!canSend()) return;
    send(text);
  }, 300);

  const serializeAndSend = async (final = false) => {
    if (!canSend()) return;
    try {
      const fullText = await depsRef.current.buildDocumentText(final);
      if (fullText === null) return;
      lastInitializedTextRef.current = fullText;
      send(fullText);
    } catch (err) {
      console.error('Failed to serialize document', err);
      vscode.postMessage({ type: 'diag', ev: 'serialize_failed' });
    }
  };

  const serializeDebounced = useDebouncedCallback(() => serializeAndSend(false), 600);

  // 호출 시점에 편집을 표시하는 래퍼. cancel·flush·isPending은 원래 디바운스 것을 그대로 쓴다.
  const postChange = Object.assign((text: string) => {
    unsentRef.current = true;
    postChangeDebounced(text);
  }, postChangeDebounced);
  const debouncedSerialize = Object.assign(() => {
    unsentRef.current = true;
    serializeDebounced();
  }, serializeDebounced);

  const hasUnsentEdits = () => unsentRef.current;

  /** 대기 중인 편집을 즉시 배출한다. 저장 직전과 탭 전환에서 부른다. */
  const flush = async () => {
    if (postChange.isPending()) postChange.flush();
    if (debouncedSerialize.isPending() || depsRef.current.needsFinalSerialize?.()) {
      debouncedSerialize.cancel();
      await serializeAndSend(true);
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

  /** 보류한 외부 변경을 에디터에 반영한다. 대기 중인 로컬 직렬화는 외부 변경 이전 문서 기준이라 버린다. */
  const adoptExternal = (incoming: string) => {
    pendingExternalRef.current = null;
    serializeDebounced.cancel();
    postChangeDebounced.cancel();
    unsentRef.current = false;
    depsRef.current.applyExternalText(incoming);
  };

  /** focusout과 타이머가 부르는 자동 채택. 전송하지 않은 로컬 편집이 있으면 채택하지 않고 충돌로 넘긴다.
   *  웹뷰가 문서 전체를 치환하는 구조라 두 편집을 병합할 수 없다. */
  const consumeExternal = () => {
    clearPendingTimer();
    const incoming = pendingExternalRef.current;
    if (incoming === null) return;
    if (normalizeMd(incoming) === normalizeMd(lastSentTextRef.current)) {
      pendingExternalRef.current = null;
      setConflict(false);
      return;
    }
    if (unsentRef.current) {
      // 보류 상태를 유지하므로 canSend()가 계속 전송을 막는다
      setConflict(true);
      return;
    }
    adoptExternal(incoming);
    vscode.postMessage({ type: 'notify', message: 'This file changed outside the editor. The editor reloaded it.' });
  };

  /** 충돌 막대에서 고른 보기를 적용한다 */
  const resolveConflict = async (choice: 'external' | 'mine') => {
    clearPendingTimer();
    const incoming = pendingExternalRef.current;
    setConflict(false);
    vscode.postMessage({ type: 'diag', ev: 'external_conflict', choice });
    if (incoming === null) return;
    if (choice === 'external') {
      adoptExternal(incoming);
      return;
    }
    pendingExternalRef.current = null;
    serializeDebounced.cancel();
    postChangeDebounced.cancel();
    await serializeAndSend();
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
    hasUnsentEdits,
    conflict,
    resolveConflict,
  };
}
