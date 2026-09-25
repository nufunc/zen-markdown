// 링크 주소 입력창(추가 검토 31). VS Code 웹뷰 sandbox에는 allow-modals가 없어 prompt()가 대화상자 없이 null을 돌려준다.
// 도구 막대의 링크 단추와 Ctrl+K가 연다. Enter로 링크를 걸고 Esc나 바깥 클릭으로 닫는다
import { useEffect, useRef, useState } from 'react';
import type { LinkTarget } from './linkActions';

export function LinkInput({ target, onSubmit, onClose }: { target: LinkTarget; onSubmit: (url: string) => void; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div style={{ position: 'fixed', left: target.x, top: target.y, zIndex: 1100, padding: '4px', background: 'var(--bg-color)', border: '1px solid var(--dropdown-border)', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)' }}>
      <input
        ref={inputRef}
        value={url}
        placeholder="Enter link URL"
        aria-label="Link URL"
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); if (url.trim()) onSubmit(url.trim()); else onClose(); }
          if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        }}
        onBlur={onClose}
        style={{ width: '260px', fontSize: '12px', padding: '4px 6px', background: 'var(--input-bg)', color: 'var(--text-color)', border: '1px solid var(--dropdown-border)', borderRadius: '4px', outline: 'none' }}
      />
    </div>
  );
}
