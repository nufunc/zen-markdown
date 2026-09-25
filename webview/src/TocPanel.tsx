// 왼쪽 목차 패널. 헤딩을 누르면 그 블록으로 스크롤하고, H1~H5 버튼은 그 수준의 첫 헤딩으로 간다.
import { List, X, ChevronDown } from 'lucide-react';

export type TocHeading = { id: string; text: string; level: number };

export function TocPanel({ headings, colors, onClose }: {
  headings: TocHeading[];
  colors: { headerBg: string; dropdownBorder: string };
  onClose: () => void;
}) {
  const { headerBg, dropdownBorder } = colors;
  return (
    <div style={{
      width: '240px',
      flexShrink: 0,
      backgroundColor: headerBg,
      borderRight: `1px solid ${dropdownBorder}`,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontSize: '12px',
      userSelect: 'none'
    }}>
      {/* TOC 패널 상단 헤더 툴바 */}
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${dropdownBorder}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '4px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '12px', opacity: 0.85 }}>
          <List size={14} />
          <span>TOC</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          {[1, 2, 3, 4, 5].map(lvl => (
            <button
              key={lvl}
              onClick={() => {
                const firstHead = headings.find(h => h.level === lvl);
                if (firstHead) {
                  const el = document.querySelector(`[data-id="${firstHead.id}"]`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
              className="tb-btn"
              style={{ padding: '1px 4px', fontSize: '10px', fontWeight: 600 }}
              data-tooltip={`Jump to H${lvl}`}
            >
              H{lvl}
            </button>
          ))}
          <button
            onClick={onClose}
            className="tb-btn"
            style={{ padding: '2px', marginLeft: '2px' }}
            data-tooltip="Close TOC"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* TOC 계층 목록 (Tree View) */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {headings.map(h => (
          <div
            key={h.id}
            style={{
              paddingLeft: `${(h.level - 1) * 12 + 8}px`,
              paddingRight: '8px',
              paddingTop: '4px',
              paddingBottom: '4px',
              borderRadius: '4px',
              cursor: 'pointer',
              opacity: 0.78,
              fontSize: '11.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              transition: 'background-color 0.12s ease, opacity 0.12s ease'
            }}
            onClick={() => {
              const el = document.querySelector(`[data-id="${h.id}"]`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--text-color) 8%, transparent)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.opacity = '0.78';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {h.level === 1 ? (
              <ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.6 }} />
            ) : (
              <span style={{ width: '11px', display: 'inline-block', flexShrink: 0, opacity: 0.4 }}>•</span>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {h.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
