// 설정 패널. 값은 App의 config가 들고, 바꾸면 updateConfig가 호스트에 알린다. 호스트가 바로 사용자 설정에 쓰므로 저장 단추는 없다.
import { X, Palette, Type, Maximize2, RefreshCcw, Wand2, FileText, Pilcrow, List } from 'lucide-react';

export type EditorConfig = {
  theme: string;
  fontSize: number;
  autoRefresh: boolean;
  showToc: boolean;
  isReadOnly: boolean;
  defaultCodeLanguage: string;
  spellCheck: boolean;
  contentWidth: string;
  showWordCount: boolean;
  showFormattingToolbar: boolean;
};

type Colors = { bgColor: string; textColor: string; dropdownBg: string; dropdownBorder: string };

export function SettingsPanel({ config, updateConfig, colors, onClose }: {
  config: EditorConfig;
  updateConfig: (key: string, value: any) => void;
  colors: Colors;
  onClose: () => void;
}) {
  const { bgColor, textColor, dropdownBg, dropdownBorder } = colors;
  return (
    <div className="glass-panel" style={{
      position: 'absolute',
      top: '100%',
      right: 0,
      marginTop: '4px',
      backgroundColor: dropdownBg,
      border: `1px solid ${dropdownBorder}`,
      borderRadius: '8px',
      padding: '16px',
      zIndex: 1000,
      minWidth: '350px',
      color: textColor,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Editor Settings</h3>
        <X size={16} cursor="pointer" onClick={onClose} style={{ opacity: 0.7 }} />
      </div>

      <div className="settings-group-title">Appearance</div>
      
      <div className="settings-item">
        <div className="settings-item-label">
          <Palette size={14} opacity={0.7} />
          <span>Theme</span>
        </div>
        <select
          className="settings-select"
          value={config.theme}
          onChange={(e) => updateConfig('theme', e.target.value)}
          style={{ fontSize: '12px', padding: '4px', borderRadius: '4px', background: bgColor, color: textColor, border: `1px solid ${dropdownBorder}` }}
        >
          <option value="auto">Auto (VS Code)</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="nord">Nord</option>
          <option value="one-half-dark">One Half Dark</option>
          <option value="solarized-dark">Solarized</option>
          <option value="vintage">Vintage</option>
          <option value="gruvbox-dark">Gruvbox</option>
          <option value="tokyo-night-day">Tokyo Night</option>
          <option value="orca">Orca</option>
        </select>
      </div>

      <div className="settings-item">
        <div className="settings-item-label">
          <Type size={14} opacity={0.7} />
          <span>Font Size</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button 
            onClick={() => updateConfig('fontSize', Math.max(10, config.fontSize - 1))}
            style={{ padding: '2px 8px', borderRadius: '4px', border: `1px solid ${dropdownBorder}`, background: bgColor, color: textColor, cursor: 'pointer' }}
          >-</button>
          <span style={{ fontSize: '12px', minWidth: '24px', textAlign: 'center' }}>{config.fontSize}</span>
          <button 
            onClick={() => updateConfig('fontSize', Math.min(32, config.fontSize + 1))}
            style={{ padding: '2px 8px', borderRadius: '4px', border: `1px solid ${dropdownBorder}`, background: bgColor, color: textColor, cursor: 'pointer' }}
          >+</button>
        </div>
      </div>

      <div className="settings-item">
        <div className="settings-item-label">
          <Maximize2 size={14} opacity={0.7} />
          <span>Content Width</span>
        </div>
        <select
          className="settings-select"
          value={config.contentWidth}
          onChange={(e) => updateConfig('contentWidth', e.target.value)}
          style={{ fontSize: '12px', padding: '4px', borderRadius: '4px', background: bgColor, color: textColor, border: `1px solid ${dropdownBorder}` }}
        >
          <option value="narrow">Narrow</option>
          <option value="standard">Standard</option>
          <option value="full">Full Width</option>
        </select>
      </div>

      <div className="settings-group-title">Behavior</div>

      <div className="settings-item">
        <label className="settings-item-label">
          <RefreshCcw size={14} opacity={0.7} />
          <span>Auto Refresh File</span>
        </label>
        <label className="toggle-switch">
          <input type="checkbox" checked={config.autoRefresh} onChange={(e) => updateConfig('autoRefresh', e.target.checked)} />
          <span className="toggle-slider"></span>
        </label>
      </div>

      <div className="settings-item">
        <label className="settings-item-label">
          <Wand2 size={14} opacity={0.7} />
          <span>Spell Check</span>
        </label>
        <label className="toggle-switch">
          <input type="checkbox" checked={config.spellCheck} onChange={(e) => updateConfig('spellCheck', e.target.checked)} />
          <span className="toggle-slider"></span>
        </label>
      </div>

      <div className="settings-item">
        <label className="settings-item-label">
          <FileText size={14} opacity={0.7} />
          <span>Show Word Count</span>
        </label>
        <label className="toggle-switch">
          <input type="checkbox" checked={config.showWordCount} onChange={(e) => updateConfig('showWordCount', e.target.checked)} />
          <span className="toggle-slider"></span>
        </label>
      </div>

      <div className="settings-item">
        <label className="settings-item-label">
          <Pilcrow size={14} opacity={0.7} />
          <span>Formatting Toolbar</span>
        </label>
        <label className="toggle-switch">
          <input type="checkbox" checked={config.showFormattingToolbar} onChange={(e) => updateConfig('showFormattingToolbar', e.target.checked)} />
          <span className="toggle-slider"></span>
        </label>
      </div>

      <div className="settings-group-title">Document</div>

      <div className="settings-item">
        <label className="settings-item-label">
          <List size={14} opacity={0.7} />
          <span>Show Table of Contents</span>
        </label>
        <label className="toggle-switch">
          <input type="checkbox" checked={config.showToc} onChange={(e) => updateConfig('showToc', e.target.checked)} />
          <span className="toggle-slider"></span>
        </label>
      </div>

    </div>
  );
}
