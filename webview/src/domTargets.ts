// 이벤트가 어느 영역에서 났는지 판별한다. 전역 리스너가 본문 에디터 밖의
// 입력칸(프론트매터, 검색창, 설정)까지 가로채지 않게 하는 데 쓴다.

export const isEditorElement = (el: Element | null): boolean => {
  if (!el) return false;
  return !!el.closest('.bn-editor, .ProseMirror, .bn-container, .mantine-Menu-dropdown, .mantine-Popover-dropdown, .mantine-Select-dropdown, [role="menu"], [role="dialog"]');
};

// 본문 에디터가 아니라 일반 입력칸(프론트매터, 검색창, 설정)에 들어간 이벤트인가.
// 이 자리에서는 본문 편집 단축키와 표 변환 붙여넣기가 발동해서는 안 된다.
export const isPlainInputTarget = (el: EventTarget | null): boolean => {
  const node = el as HTMLElement | null;
  if (!node || !node.tagName) return false;
  const tag = node.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return !node.closest?.('.bn-editor, .ProseMirror');
};
