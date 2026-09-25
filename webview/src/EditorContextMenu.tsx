// 본문 오른쪽 클릭 메뉴(VS Code 모양): 실행 취소, 다시 실행, 잘라내기, 복사, 붙여넣기, 찾기
import { Undo2, Redo2, Scissors, Copy, Clipboard, Search } from 'lucide-react';

export function EditorContextMenu({ at, canUndo, canRedo, onUndo, onRedo, onFind, onClose }: {
  at: { x: number; y: number };
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onFind: () => void;
  onClose: () => void;
}) {
  return (
      <div 
        className="vscode-context-menu" 
        style={{ top: at.y, left: at.x }}
        role="menu"
        onMouseDown={e => e.stopPropagation()}
      >
        <div 
          className={`vscode-context-menu-item ${!canUndo ? 'disabled' : ''}`}
          onClick={() => {
            if (canUndo) {
              onUndo();
              onClose();
            }
          }}
        >
          <div className="menu-label">
            <Undo2 size={13} />
            <span>실행 취소</span>
          </div>
          <span className="menu-shortcut">Ctrl+Z</span>
        </div>

        <div 
          className={`vscode-context-menu-item ${!canRedo ? 'disabled' : ''}`}
          onClick={() => {
            if (canRedo) {
              onRedo();
              onClose();
            }
          }}
        >
          <div className="menu-label">
            <Redo2 size={13} />
            <span>다시 실행</span>
          </div>
          <span className="menu-shortcut">Ctrl+Y</span>
        </div>

        <div className="vscode-context-menu-divider" />

        <div 
          className="vscode-context-menu-item"
          onClick={() => {
            document.execCommand('cut');
            onClose();
          }}
        >
          <div className="menu-label">
            <Scissors size={13} />
            <span>잘라내기</span>
          </div>
          <span className="menu-shortcut">Ctrl+X</span>
        </div>

        <div 
          className="vscode-context-menu-item"
          onClick={() => {
            document.execCommand('copy');
            onClose();
          }}
        >
          <div className="menu-label">
            <Copy size={13} />
            <span>복사</span>
          </div>
          <span className="menu-shortcut">Ctrl+C</span>
        </div>

        <div 
          className="vscode-context-menu-item"
          onClick={async () => {
            try {
              const text = await navigator.clipboard.readText();
              if (text) {
                document.execCommand('insertText', false, text);
              }
            } catch {}
            onClose();
          }}
        >
          <div className="menu-label">
            <Clipboard size={13} />
            <span>붙여넣기</span>
          </div>
          <span className="menu-shortcut">Ctrl+V</span>
        </div>

        <div className="vscode-context-menu-divider" />

        <div 
          className="vscode-context-menu-item"
          onClick={() => {
            onFind();
            onClose();
          }}
        >
          <div className="menu-label">
            <Search size={13} />
            <span>찾기 / 바꾸기</span>
          </div>
          <span className="menu-shortcut">Ctrl+F</span>
        </div>
      </div>
  );
}
