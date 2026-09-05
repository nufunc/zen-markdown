import type React from 'react';
// WYSIWYG 본문의 키보드 단축키. App.tsx에서 떼어낸 이유는 이 핸들러 하나가
// 200줄이고 Undo/Redo, Tab 들여쓰기, Ctrl+D 복제, Ctrl+1~6 헤딩을 모두 담고 있어
// 본문에 섞여 있으면 어떤 키가 잡혀 있는지 한눈에 보이지 않기 때문이다.
import { isPlainInputTarget } from './domTargets';

export interface EditorKeymapDeps {
  editor: any;
  isRawMode: boolean;
  handleUndo: () => void;
  handleRedo: () => void;
  applyBlockTypeToSelection: (type: string, props?: Record<string, any>) => void;
}

export function createEditorKeymap({ editor, isRawMode, handleUndo, handleRedo, applyBlockTypeToSelection }: EditorKeymapDeps) {
  return (e: React.KeyboardEvent) => {
    if (!editor || isRawMode) return;
    // 프론트매터·TOC 등 본문 밖 입력칸의 키 입력은 본문 단축키로 해석하지 않는다
    if (isPlainInputTarget(e.target)) return;

    // 한국어 등 IME 합성(입력 중) 상태에서는 단축키 이벤트를 가로채지 않음 (글자 씹힘 및 겹침 방지)
    if (e.nativeEvent.isComposing) return;

    // Cmd/Ctrl + Z / Y : 에디터 내장 Undo/Redo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      e.stopPropagation();
      handleRedo();
      return;
    }



    if (e.key === 'Tab') {
      try {
        const selection = editor.getSelection();
        const cursor = editor.getTextCursorPosition();
        
        if (cursor && cursor.block && cursor.block.type === 'codeBlock') {
          // 코드 블록 내부에서는 커스텀 목록 탭 제어를 건너뛰어 코드 들여쓰기 보장
          return;
        }
        
        let blocksToProcess: any[] = [];
        if (selection && selection.blocks && selection.blocks.length > 0) {
          blocksToProcess = selection.blocks;
        } else if (cursor && cursor.block) {
          blocksToProcess = [cursor.block];
        }

        if (blocksToProcess.length > 0) {
          if (!e.shiftKey) {
            // Tab (Indent)
            let preventDefault = false;
            for (const block of blocksToProcess) {
              if (block.type === 'paragraph' && block.content?.length === 0) {
                // 빈 문단에서만 Tab을 불릿 리스트 전환으로 쓴다.
                // (cursor.prevCharacter는 BlockNote에 없는 필드라 항상 undefined였고,
                //  그 탓에 내용이 있는 문단에서도 Tab이 불릿으로 바뀌었다)
                editor.updateBlock(block, { type: 'bulletListItem' });
                preventDefault = true;
              } else if (block.type === 'bulletListItem' || block.type === 'numberedListItem') {
                preventDefault = true; // 무조건 기본 동작(포커스 이동) 차단
                if (cursor && editor.canNestBlock()) {
                  editor.nestBlock();
                }
              }
            }
            if (preventDefault) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          } else {
            // Shift-Tab (Outdent)
            let preventDefault = false;
            for (const block of blocksToProcess) {
              if (block.type === 'bulletListItem' || block.type === 'numberedListItem') {
                preventDefault = true; // 무조건 기본 동작 차단 (커서 이탈 방지)
                if (cursor && editor.canUnnestBlock()) {
                  editor.unnestBlock();
                }
              }
            }
            if (preventDefault) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }
        }
      } catch {
        // Ignored if no cursor position can be resolved
      }
      return;
    }

    // UpNote Shortcuts
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '6') {
      e.preventDefault();
      e.stopPropagation();
      applyBlockTypeToSelection('heading', { level: parseInt(e.key) });
      return;
    }
    
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === '7') {
      e.preventDefault();
      e.stopPropagation();
      applyBlockTypeToSelection('bulletListItem');
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === '8') {
      e.preventDefault();
      e.stopPropagation();
      applyBlockTypeToSelection('numberedListItem');
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === '9') {
      e.preventDefault();
      e.stopPropagation();
      applyBlockTypeToSelection('checkListItem');
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      e.stopPropagation();
      applyBlockTypeToSelection('quote');
      return;
    }

    // Cmd/Ctrl + Shift + C : Code Block
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      e.stopPropagation();
      applyBlockTypeToSelection('codeBlock', { language: 'text' });
      return;
    }

    // Cmd/Ctrl + Shift + M : Divider (inserted as '---' paragraph)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      e.stopPropagation();
      try {
        const cursor = editor.getTextCursorPosition();
        if (cursor) {
          editor.insertBlocks([{ type: 'paragraph', content: '---' }], cursor.block, 'after');
        }
      } catch {}
      return;
    }

    // Cmd/Ctrl + Shift + K : Inline Code
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      e.stopPropagation();
      try { editor.toggleStyles({ code: true }); } catch {}
      return;
    }

    // Cmd/Ctrl + Shift + X (or S) : Strikethrough
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key.toLowerCase() === 'x' || e.key.toLowerCase() === 's')) {
      e.preventDefault();
      e.stopPropagation();
      try { editor.toggleStyles({ strike: true }); } catch {}
      return;
    }

    // Cmd/Ctrl + Shift + H : Highlight
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      e.stopPropagation();
      try {
        const active = editor.getActiveStyles();
        if (active.backgroundColor === 'yellow') {
          editor.removeStyles({ backgroundColor: 'yellow' });
        } else {
          editor.addStyles({ backgroundColor: 'yellow' });
        }
      } catch {}
      return;
    }

    // Cmd/Ctrl + D : Duplicate Block
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      e.stopPropagation();
      try {
        const cursor = editor.getTextCursorPosition();
        if (cursor && cursor.block) {
          const block = editor.getBlock(cursor.block);
          if (block) {
            // children까지 복제하되 id는 떼어낸다. 원본 id를 그대로 넘기면 중복 id가 된다.
            const stripIds = (b: any): any => ({
              type: b.type,
              props: b.props,
              content: b.content,
              ...(b.children?.length ? { children: b.children.map(stripIds) } : {})
            });
            editor.insertBlocks([stripIds(block)], block, "after");
          }
        }
      } catch {}
      return;
    }
  };
}
