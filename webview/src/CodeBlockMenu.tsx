import { useEffect, useRef } from 'react';
import { supportedLanguages } from './shikiHighlighter';

// 코드블록 케밥(⋮) 메뉴 — UpNote 스타일: 복사/잘라내기/삭제 + 언어/기본 언어 서브메뉴.
// 시각 스타일은 editorStyles.ts의 .cbm-* 규칙에 정의.

const LANGUAGE_ENTRIES = Object.entries(supportedLanguages).map(([id, v]) => ({ id, name: v.name }));

// 별칭(ps1, yml 등)을 supportedLanguages의 대표 id로 정규화
export function normalizeLanguageId(lang: string): string {
  const lower = (lang || '').toLowerCase();
  for (const [id, v] of Object.entries(supportedLanguages)) {
    if (id === lower || v.aliases?.includes(lower)) return id;
  }
  return lower || 'text';
}

export interface CodeBlockMenuProps {
  x: number;
  y: number;
  currentLanguage: string;
  defaultLanguage: string;
  onSelectLanguage: (id: string) => void;
  onSelectDefault: (id: string) => void;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function LanguageList({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <div className="cbm-sub">
      {LANGUAGE_ENTRIES.map(({ id, name }) => (
        <div key={id} className="cbm-item" onClick={(e) => { e.stopPropagation(); onSelect(id); }}>
          <span className={`cbm-radio${selected === id ? ' selected' : ''}`} />
          <span style={{ flex: 1 }}>{name}</span>
        </div>
      ))}
    </div>
  );
}

export function CodeBlockMenu({
  x, y, currentLanguage, defaultLanguage,
  onSelectLanguage, onSelectDefault, onCopy, onCut, onDelete, onClose,
}: CodeBlockMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const selectedLang = normalizeLanguageId(currentLanguage);
  const selectedDefault = normalizeLanguageId(defaultLanguage);

  // 패널을 케밥 버튼의 오른쪽 끝에 맞춰 왼쪽으로 펼침 (화면 밖 잘림 방지)
  const style: React.CSSProperties = {
    top: Math.min(y, window.innerHeight - 40),
    left: Math.max(8, x - 176),
  };

  return (
    <div ref={panelRef} className="cbm-panel" style={style}>
      <div className="cbm-item" onClick={onCopy}>복사</div>
      <div className="cbm-item" onClick={onCut}>잘라내기</div>
      <div className="cbm-item" onClick={onDelete}>삭제</div>
      <div className="cbm-divider" />
      <div className="cbm-item cbm-has-sub">
        <span style={{ flex: 1 }}>언어</span>
        <span className="cbm-arrow">‹</span>
        <LanguageList selected={selectedLang} onSelect={onSelectLanguage} />
      </div>
      <div className="cbm-item cbm-has-sub">
        <span style={{ flex: 1 }}>기본 코드 언어</span>
        <span className="cbm-arrow">‹</span>
        <LanguageList selected={selectedDefault} onSelect={onSelectDefault} />
      </div>
    </div>
  );
}
