// 링크 입력창이 쓰는 편집기 조작(추가 검토 31). 선택을 기억했다가 입력을 마치면 그 선택에 링크를 건다
export type LinkTarget = { from: number; to: number; x: number; y: number };

/** 지금 선택 범위와 그 아래 화면 위치. 입력창으로 포커스가 옮겨 가도 선택을 되살리려고 기억해 둔다 */
export function captureLinkTarget(editor: any): LinkTarget | null {
  const tt = editor?._tiptapEditor;
  if (!tt) return null;
  const { from, to } = tt.state.selection;
  const rect = tt.view.coordsAtPos(to);
  return { from, to, x: rect.left, y: rect.bottom + 4 };
}

/** 기억한 선택에 링크를 건다. 선택이 비어 있으면 주소를 글자로 넣는다 */
export function applyLink(editor: any, target: LinkTarget, url: string) {
  const tt = editor._tiptapEditor;
  tt.commands.setTextSelection({ from: target.from, to: target.to });
  if (target.from === target.to) editor.insertInlineContent([{ type: 'link', href: url, content: url }]);
  else editor.createLink(url);
  editor.focus();
}
