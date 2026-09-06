import { useState, useRef, useEffect } from 'react';
import { searchPluginKey } from './searchPlugin';
import { vscode } from './vscode';

// 치환 시 원래 자리의 인라인 서식(굵게, 링크 등)을 이어받는다.
// 매치의 첫 문자 위치에서 마크를 읽는다. from 위치를 쓰면 앞 문자가 무서식일 때
// 빈 배열이 돌아와 굵게와 링크가 통째로 사라진다.
const marksAtMatch = (state: any, from: number) => {
  try {
    return state.doc.resolve(Math.min(from + 1, state.doc.content.size)).marks();
  } catch {
    return [];
  }
};

// 치환 텍스트가 비어 있으면 schema.text('')가 예외를 던지므로 삭제로 분기한다.
const replaceRange = (tr: any, state: any, from: number, to: number, text: string) =>
  text.length === 0
    ? tr.delete(from, to)
    : tr.replaceWith(from, to, state.schema.text(text, marksAtMatch(state, from)));

/**
 * 검색·치환 위젯의 상태와 동작을 모은다.
 *
 * App.tsx에서 떼어낸 이유: 매치 계산, 하이라이트 디스패치, 치환 트랜잭션이
 * 서로 같은 가정(매치 배열의 from/to) 위에 서 있는데 본문 사방에 흩어져 있었다.
 * 한 곳에 두어야 매처를 고칠 때 치환도 같이 보게 된다.
 *
 * @param editor BlockNote 에디터 인스턴스
 * @param onDocumentChanged 치환으로 문서가 바뀐 뒤 호출된다 (직렬화 트리거)
 */
export function useSearchReplace(editor: any, onDocumentChanged: () => void) {
  const [showSearchReplace, setShowSearchReplace] = useState(false);
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [regexError, setRegexError] = useState<string | null>(null);
  const [matchCount, setMatchCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // 에디터 검색 하이라이트 & 카운트 실시간 동기화
  useEffect(() => {
    if (!editor) return;
    const tiptap = (editor as any)._tiptapEditor;
    if (!tiptap) return;
    const state = tiptap.editorState || tiptap.state;
    const view = tiptap.editorView || tiptap.view;
    if (!state || !view) return;

    if (!showSearchReplace || !searchQuery) {
      try {
        const tr = state.tr.setMeta(searchPluginKey, { query: '', matchCase: false, wholeWord: false, isRegex: false, activeIndex: 0 });
        view.dispatch(tr);
      } catch {}
      setMatchCount(0);
      setActiveIndex(0);
      setRegexError(null);
      return;
    }

    try {
      const currentState = tiptap.editorState || tiptap.state;
      const currentView = tiptap.editorView || tiptap.view;
      const tr = currentState.tr.setMeta(searchPluginKey, {
        query: searchQuery,
        matchCase,
        wholeWord,
        isRegex,
        activeIndex,
      });
      currentView.dispatch(tr);
      const searchState = searchPluginKey.getState(currentView.state || currentState);
      if (searchState) {
        setRegexError(searchState.regexError);
        const len = searchState.matches.length;
        setMatchCount(len);
        if (len > 0 && searchState.matches[activeIndex]) {
          try {
            const activeEl = document.querySelector('.search-highlight-active');
            if (activeEl) {
              activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
          } catch {}
        }
      } else {
        setMatchCount(0);
        setRegexError(null);
      }
    } catch (err) {
      console.error('Error updating search highlight:', err);
      vscode.postMessage({ type: 'diag', ev: 'search_highlight_failed' });
    }
  }, [editor, searchQuery, matchCase, wholeWord, isRegex, activeIndex, showSearchReplace]);

  const handleFindNext = () => {
    if (!searchQuery || matchCount === 0) return;
    setActiveIndex(prev => (prev + 1) % matchCount);
  };

  const handleFindPrev = () => {
    if (!searchQuery || matchCount === 0) return;
    setActiveIndex(prev => (prev - 1 + matchCount) % matchCount);
  };

  const handleReplace = () => {
    if (!editor || !searchQuery || matchCount === 0) return;
    const tiptap = (editor as any)?._tiptapEditor;
    if (!tiptap) return;
    const state = tiptap.editorState || tiptap.state;
    const view = tiptap.editorView || tiptap.view;
    if (state && view) {
      const searchState = searchPluginKey.getState(state);
      if (searchState && searchState.matches.length > 0 && searchState.matches[activeIndex]) {
        const curMatch = searchState.matches[activeIndex];
        let replacement = replaceQuery;
        if (isRegex) {
          try {
            const flags = matchCase ? '' : 'i';
            let pattern = searchQuery;
            if (wholeWord) {
              const boundaryLeft = /^\w/.test(pattern) ? '\\b' : '';
              const boundaryRight = /\w$/.test(pattern) ? '\\b' : '';
              pattern = `${boundaryLeft}${pattern}${boundaryRight}`;
            }
            const regex = new RegExp(pattern, flags);
            replacement = curMatch.matchText.replace(regex, replaceQuery);
          } catch {}
        }
        const tr = replaceRange(state.tr, state, curMatch.from, curMatch.to, replacement);
        view.dispatch(tr);
        onDocumentChanged();
        if (activeIndex >= matchCount - 1) {
          setActiveIndex(0);
        }
      }
    }
  };

  const handleReplaceAll = () => {
    if (!editor || !searchQuery) return;
    const tiptap = (editor as any)?._tiptapEditor;
    if (!tiptap) return;
    const state = tiptap.editorState || tiptap.state;
    const view = tiptap.editorView || tiptap.view;
    if (state && view) {
      const searchState = searchPluginKey.getState(state);
      if (searchState && searchState.matches.length > 0) {
        const matches = [...searchState.matches].reverse();
        let tr = state.tr;
        const flags = matchCase ? '' : 'i';
        let regex: RegExp | null = null;
        if (isRegex) {
          try {
            let pattern = searchQuery;
            if (wholeWord) {
              const boundaryLeft = /^\w/.test(pattern) ? '\\b' : '';
              const boundaryRight = /\w$/.test(pattern) ? '\\b' : '';
              pattern = `${boundaryLeft}${pattern}${boundaryRight}`;
            }
            regex = new RegExp(pattern, flags);
          } catch {}
        }

        matches.forEach(m => {
          let replacement = replaceQuery;
          if (regex && m.matchText) {
            try {
              replacement = m.matchText.replace(regex, replaceQuery);
            } catch {}
          }
          tr = replaceRange(tr, state, m.from, m.to, replacement);
        });
        view.dispatch(tr);
        vscode.postMessage({ type: 'notify', message: `Replaced ${matches.length} occurrences.` });
        onDocumentChanged();
      }
    }
  };

  const syncMatchesFromPlugin = () => {
    if (!showSearchReplace || !searchQuery || !editor) return;
    try {
      const tiptap = (editor as any)?._tiptapEditor;
      const searchState = tiptap && searchPluginKey.getState(tiptap.editorState || tiptap.state);
      if (searchState) {
        setMatchCount(searchState.matches.length);
        setActiveIndex(searchState.activeIndex ?? 0);
      }
    } catch { /* noop */ }
  };

  return {
    showSearchReplace, setShowSearchReplace,
    isReplaceOpen, setIsReplaceOpen,
    searchQuery, setSearchQuery,
    replaceQuery, setReplaceQuery,
    matchCase, setMatchCase,
    wholeWord, setWholeWord,
    isRegex, setIsRegex,
    regexError,
    matchCount,
    activeIndex, setActiveIndex,
    searchInputRef, replaceInputRef,
    handleFindNext, handleFindPrev, handleReplace, handleReplaceAll,
    /** 편집 후 위젯의 개수·활성 인덱스를 플러그인 상태와 다시 맞춘다 */
    syncMatchesFromPlugin,
  };
}
