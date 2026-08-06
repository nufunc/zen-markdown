import { X, ChevronDown, ChevronRight, List, Calendar, Hash, Type, CheckSquare, AlertCircle } from 'lucide-react';

// Frontmatter Properties: 태그 칩 파스텔 팔레트 — 문자열 해시로 색을 고정 배정 (Obsidian/Notion 감성)
const TAG_COLORS_LIGHT = [
  { bg: '#dbeafe', fg: '#1e40af' },
  { bg: '#dcfce7', fg: '#166534' },
  { bg: '#f3e8ff', fg: '#6b21a8' },
  { bg: '#fce7f3', fg: '#9d174d' },
  { bg: '#ffedd5', fg: '#9a3412' },
  { bg: '#ccfbf1', fg: '#115e59' },
  { bg: '#fef9c3', fg: '#854d0e' },
  { bg: '#f1f5f9', fg: '#475569' },
];
const TAG_COLORS_DARK = [
  { bg: 'rgba(59,130,246,0.18)', fg: '#93c5fd' },
  { bg: 'rgba(34,197,94,0.16)', fg: '#86efac' },
  { bg: 'rgba(168,85,247,0.16)', fg: '#d8b4fe' },
  { bg: 'rgba(236,72,153,0.16)', fg: '#f9a8d4' },
  { bg: 'rgba(249,115,22,0.16)', fg: '#fdba74' },
  { bg: 'rgba(20,184,166,0.16)', fg: '#5eead4' },
  { bg: 'rgba(234,179,8,0.16)', fg: '#fde047' },
  { bg: 'rgba(148,163,184,0.16)', fg: '#cbd5e1' },
];
const tagColorIndex = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % TAG_COLORS_LIGHT.length;
};
// YAML 파서는 2024-01-01 같은 값을 Date 인스턴스로 돌려줌
const isDateLike = (v: any): boolean =>
  v instanceof Date || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));
const toDateInputValue = (v: any): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

export interface FrontmatterPanelProps {
  parsedFrontmatter: string;
  fmData: Record<string, any> | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  isDark: boolean;
  textColor: string;
  accentColor: string;
  onChange: (key: string, value: any) => void;
}

// Properties: Notion식 — 박스 없이 문서 상단에 스며들고, 값은 hover 시에만 편집 UI가 드러남
// (hover-reveal/포커스 링 CSS는 editorStyles.ts의 .fm-* 규칙에 정의)
export function FrontmatterPanel({
  parsedFrontmatter,
  fmData,
  collapsed,
  onToggleCollapsed,
  isDark,
  textColor,
  _accentColor,
  onChange,
}: FrontmatterPanelProps) {
  const isTitleMissing = !fmData || !fmData.title;

  const fmHeader = (count?: number) => (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: collapsed ? 0 : '10px'
      }}
    >
      <div
        onClick={onToggleCollapsed}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none',
          fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: textColor, opacity: 0.7
        }}
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        <span>Properties</span>
        {typeof count === 'number' && (
          <span style={{
            fontSize: '10px',
            fontWeight: 500,
            padding: '1px 6px',
            borderRadius: '10px',
            background: 'rgba(125,125,125,0.15)',
            color: textColor
          }}>
            {count}
          </span>
        )}
      </div>
      {isTitleMissing && (
        <span 
          style={{ 
            display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', 
            color: '#d97706', backgroundColor: isDark ? 'rgba(217, 119, 6, 0.18)' : '#fef3c7',
            border: '1px solid rgba(217, 119, 6, 0.3)', borderRadius: '12px', padding: '2px 8px', fontWeight: 500
          }}
          data-tooltip="Title property is recommended for manual publishing"
        >
          <AlertCircle size={11} />
          Title Missing
        </span>
      )}
    </div>
  );

  const panelStyle: React.CSSProperties = {
    marginBottom: '20px',
    paddingBottom: '12px',
    borderBottom: '1px solid color-mix(in srgb, var(--text-color) 14%, transparent)'
  };

  if (!fmData) {
    return (
      <div style={panelStyle}>
        {fmHeader()}
        {!collapsed && (
          <pre style={{ fontSize: '11px', opacity: 0.65, whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'ui-monospace, Consolas, monospace' }}>
            {parsedFrontmatter}
          </pre>
        )}
      </div>
    );
  }

  const entries = Object.entries(fmData);

  return (
    <div style={panelStyle}>
      {fmHeader(entries.length)}
      {!collapsed && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {entries.map(([key, value]) => {
          const isArray = Array.isArray(value);
          const isBool = typeof value === 'boolean';
          const isNum = typeof value === 'number';
          const isDate = !isArray && isDateLike(value);
          const KeyIcon = isArray ? List : isDate ? Calendar : isBool ? CheckSquare : isNum ? Hash : Type;

          return (
            <div key={key} className="fm-row" style={{
              display: 'flex',
              fontSize: '12px',
              alignItems: 'center',
              minHeight: '30px',
              gap: '12px',
              padding: '2px 8px',
              borderRadius: '6px',
              transition: 'background-color 0.15s ease'
            }}>
              <span style={{ width: '130px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500, opacity: 0.65, color: textColor }}>
                <KeyIcon size={13} style={{ opacity: 0.75, flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key}</span>
              </span>
              {isArray ? (
                <div className="fm-value" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '3px 6px', minHeight: '22px', alignItems: 'center', flex: 1 }}>
                  {value.map((tag: any, i: number) => {
                    const c = (isDark ? TAG_COLORS_DARK : TAG_COLORS_LIGHT)[tagColorIndex(String(tag))];
                    return (
                      <span key={i} className="fm-chip" style={{
                        backgroundColor: c.bg,
                        color: c.fg,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        {String(tag)}
                        <button
                          className="fm-chip-x"
                          style={{ background: 'none', border: 'none', color: 'inherit', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.7 }}
                          onClick={() => {
                            const newArr = [...value];
                            newArr.splice(i, 1);
                            onChange(key, newArr);
                          }}
                          data-tooltip="Remove"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    );
                  })}
                  <input
                    type="text"
                    placeholder="Add..."
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: textColor,
                      outline: 'none',
                      flex: 1,
                      minWidth: '60px',
                      fontSize: '11px',
                      padding: 0,
                      margin: 0
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                        onChange(key, [...value, e.currentTarget.value.trim()]);
                        e.currentTarget.value = '';
                      } else if (e.key === 'Backspace' && !e.currentTarget.value && value.length > 0) {
                        const newArr = [...value];
                        newArr.pop();
                        onChange(key, newArr);
                      }
                    }}
                    onBlur={(e) => {
                      if (e.currentTarget.value.trim()) {
                        onChange(key, [...value, e.currentTarget.value.trim()]);
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                </div>
              ) : isBool ? (
                <div className="fm-value" style={{ flex: 1, padding: '2px 6px', display: 'flex', alignItems: 'center' }}>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={(e) => onChange(key, e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              ) : isDate ? (
                <div className="fm-value" style={{ flex: 1 }}>
                  <input
                    className="fm-input"
                    type="date"
                    value={toDateInputValue(value)}
                    onChange={(e) => onChange(key, e.target.value)}
                    style={{ colorScheme: isDark ? 'dark' : 'light', color: textColor }}
                  />
                </div>
              ) : isNum ? (
                <div className="fm-value" style={{ flex: 1 }}>
                  <input
                    className="fm-input"
                    type="number"
                    value={value}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value);
                      onChange(key, isNaN(n) ? e.target.value : n);
                    }}
                    style={{ color: textColor }}
                  />
                </div>
              ) : (
                <div className="fm-value" style={{ flex: 1 }}>
                  <input
                    className="fm-input"
                    type="text"
                    value={String(value ?? '')}
                    onChange={(e) => onChange(key, e.target.value)}
                    style={{ color: textColor }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
