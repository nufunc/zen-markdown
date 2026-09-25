// 찾기와 바꾸기 위젯(VS Code 모양). 상태와 동작은 useSearchReplace가 맡고, 이 컴포넌트는 그리기만 한다.
import { ChevronDown, ChevronUp, ChevronRight, X, Replace, ReplaceAll } from 'lucide-react';
import type { useSearchReplace } from './useSearchReplace';

const CaseSensitiveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M3.2 12h1.24l.5-1.5h2.52l.5 1.5h1.24L6.75 4h-1.1L3.2 12zm2.08-2.5L6.2 6.33l.92 3.17H5.28zM12.8 12h-1.17l-.14-.52c-.37.38-.85.57-1.44.57-.6 0-1.07-.17-1.42-.51-.34-.34-.51-.81-.51-1.39 0-.64.22-1.12.67-1.43.45-.32 1.09-.48 1.93-.48h.77V7.8c0-.3-.08-.53-.25-.68-.17-.15-.43-.22-.78-.22-.32 0-.58.07-.79.2-.21.14-.33.34-.36.62H8.35c.03-.54.25-.96.67-1.25.41-.29 1-.44 1.75-.44.7 0 1.22.15 1.57.45.34.3.52.74.52 1.33V12zm-1.16-2.92h-.69c-.53 0-.92.09-1.18.26-.26.17-.38.44-.38.8 0 .32.09.56.28.71.18.15.43.23.76.23.36 0 .65-.11.87-.33.22-.22.34-.52.34-.91v-.76z"/>
  </svg>
);

const WholeWordIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M1 3h1.2v10H1V3zm12.8 0h1.2v10h-1.2V3zM4.5 11.5c-.7 0-1.3-.3-1.7-.8-.4-.5-.6-1.1-.6-1.9 0-.8.2-1.4.6-1.9.4-.5 1-.8 1.7-.8.5 0 .9.2 1.3.5V4h1.1v7.5H5.8v-.6c-.4.4-.8.6-1.3.6zm.5-1c.4 0 .7-.1 1-.4.2-.3.3-.6.3-1.1 0-.5-.1-.8-.3-1.1-.2-.3-.5-.4-1-.4-.4 0-.7.1-1 .4-.2.3-.3.6-.3 1.1 0 .5.1.8.3 1.1.2.3.5.4 1 .4zm4.7.9H8.6V6.6h1.1v.7c.4-.5.9-.7 1.6-.7.7 0 1.3.3 1.7.8.4.5.6 1.1.6 1.9 0 .8-.2 1.4-.6 1.9-.4.5-1 .8-1.7.8-.7 0-1.2-.2-1.6-.7v.1zm1.4-1c.4 0 .7-.1 1-.4.2-.3.3-.6.3-1.1 0-.5-.1-.8-.3-1.1-.2-.3-.5-.4-1-.4-.4 0-.7.1-1 .4-.2.3-.3.6-.3 1.1 0 .5.1.8.3 1.1.2.3.5.4 1 .4z"/>
  </svg>
);

const RegexIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M3.2 12.5a1.4 1.4 0 1 1-2.8 0 1.4 1.4 0 0 1 2.8 0zm7.8-4.2l2.3-1.3-.6-1-2.3 1.3V4.7H9.2v2.6L6.9 6l-.6 1 2.3 1.3-2.3 1.3.6 1 2.3-1.3v2.6h1.2V9.3l2.3 1.3.6-1-2.3-1.3z"/>
  </svg>
);

export function FindReplaceWidget({ search, onClose }: { search: ReturnType<typeof useSearchReplace>; onClose: () => void }) {
  const {
    isReplaceOpen, setIsReplaceOpen,
    searchQuery, setSearchQuery,
    replaceQuery, setReplaceQuery,
    matchCase, setMatchCase,
    wholeWord, setWholeWord,
    isRegex, setIsRegex,
    regexError, matchCount,
    activeIndex, setActiveIndex,
    searchInputRef, replaceInputRef,
    handleFindNext, handleFindPrev, handleReplace, handleReplaceAll,
  } = search;
  return (
    <div className="vscode-find-widget" role="search" aria-label="Find and Replace">
      {/* Find Row */}
      <div className="find-widget-row">
        <button 
          type="button"
          className="find-toggle-btn"
          onClick={() => setIsReplaceOpen(prev => !prev)}
          title={isReplaceOpen ? "Toggle Replace" : "Toggle Replace (Ctrl+H)"}
          aria-expanded={isReplaceOpen}
        >
          {isReplaceOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className={`find-input-box-wrapper ${regexError ? 'has-error' : ''}`} title={regexError || undefined}>
          <input 
            ref={searchInputRef}
            id="search-input"
            className="find-native-input"
            placeholder="Find" 
            value={searchQuery} 
            onChange={e => {
              setSearchQuery(e.target.value);
              setActiveIndex(0);
            }} 
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) handleFindPrev();
                else handleFindNext();
              } else if (e.key === 'Escape') {
                onClose();
              } else if (e.altKey && e.key.toLowerCase() === 'c') {
                e.preventDefault();
                setMatchCase(prev => !prev);
              } else if (e.altKey && e.key.toLowerCase() === 'w') {
                e.preventDefault();
                setWholeWord(prev => !prev);
              } else if (e.altKey && e.key.toLowerCase() === 'r') {
                e.preventDefault();
                setIsRegex(prev => !prev);
              }
            }} 
            autoFocus
          />
          <div className="find-inline-options">
            <button 
              type="button"
              onMouseDown={e => e.preventDefault()} 
              onClick={() => setMatchCase(prev => !prev)}
              className={`find-option-btn ${matchCase ? 'active' : ''}`}
              title="Match Case (Alt+C)"
              aria-label="Match Case"
              aria-pressed={matchCase}
            >
              <CaseSensitiveIcon />
            </button>
            <button 
              type="button"
              onMouseDown={e => e.preventDefault()} 
              onClick={() => setWholeWord(prev => !prev)}
              className={`find-option-btn ${wholeWord ? 'active' : ''}`}
              title="Match Whole Word (Alt+W)"
              aria-label="Match Whole Word"
              aria-pressed={wholeWord}
            >
              <WholeWordIcon />
            </button>
            <button 
              type="button"
              onMouseDown={e => e.preventDefault()} 
              onClick={() => setIsRegex(prev => !prev)}
              className={`find-option-btn ${isRegex ? 'active' : ''}`}
              title="Use Regular Expression (Alt+R)"
              aria-label="Use Regular Expression"
              aria-pressed={isRegex}
            >
              <RegexIcon />
            </button>
          </div>
        </div>

        <div className={`find-count-label ${searchQuery && matchCount === 0 ? 'no-results' : ''}`}>
          {searchQuery ? (matchCount > 0 ? `${activeIndex + 1} of ${matchCount}` : 'No results') : ''}
        </div>

        <button 
          type="button"
          className="find-action-btn"
          onMouseDown={e => e.preventDefault()} 
          onClick={handleFindPrev} 
          disabled={!searchQuery || matchCount === 0}
          title="Previous Match (Shift+Enter)"
        >
          <ChevronUp size={14} />
        </button>
        <button 
          type="button"
          className="find-action-btn"
          onMouseDown={e => e.preventDefault()} 
          onClick={handleFindNext} 
          disabled={!searchQuery || matchCount === 0}
          title="Next Match (Enter)"
        >
          <ChevronDown size={14} />
        </button>
        <button 
          type="button"
          className="find-action-btn"
          onClick={() => {
            onClose();
          }} 
          title="Close (Escape)"
        >
          <X size={14} />
        </button>
      </div>

      {/* Replace Row */}
      {isReplaceOpen && (
        <div className="find-widget-row">
          <div className="find-toggle-placeholder" />
          <div className="find-input-box-wrapper">
            <input 
              ref={replaceInputRef}
              id="replace-input"
              className="find-native-input"
              placeholder="Replace" 
              value={replaceQuery} 
              onChange={e => setReplaceQuery(e.target.value)} 
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.ctrlKey && e.altKey) {
                    handleReplaceAll();
                  } else {
                    handleReplace();
                  }
                } else if (e.key === 'Escape') {
                  onClose();
                } else if (e.altKey && e.key.toLowerCase() === 'c') {
                  e.preventDefault();
                  setMatchCase(prev => !prev);
                } else if (e.altKey && e.key.toLowerCase() === 'w') {
                  e.preventDefault();
                  setWholeWord(prev => !prev);
                } else if (e.altKey && e.key.toLowerCase() === 'r') {
                  e.preventDefault();
                  setIsRegex(prev => !prev);
                }
              }} 
            />
          </div>

          <div className="find-count-placeholder" />

          <button 
            type="button"
            className="find-action-btn"
            onMouseDown={e => e.preventDefault()} 
            onClick={handleReplace} 
            disabled={!searchQuery || matchCount === 0}
            title="Replace (Enter)"
          >
            <Replace size={14} />
          </button>
          <button 
            type="button"
            className="find-action-btn"
            onMouseDown={e => e.preventDefault()} 
            onClick={handleReplaceAll} 
            disabled={!searchQuery || matchCount === 0}
            title="Replace All (Ctrl+Alt+Enter)"
          >
            <ReplaceAll size={14} />
          </button>
          <div className="find-action-placeholder" />
        </div>
      )}
    </div>
  );
}
