import { expect, Locator, Page } from '@playwright/test';

// 추가 검토 18: 클릭 직후 누른 End가 가끔 커서를 옮기지 못한다(20번에 1번 꼴). 클릭 자리에 글자가 들어가 테스트가 흔들린다.
// ProseMirror가 클릭 선택을 늦게 반영하며 End 선택을 덮는 것으로 추정한다(확인하지 않았다).
// 그래서 End 뒤 커서가 줄 끝인지 확인하고, 잠시 뒤에도 그대로인지 다시 본 다음에 넘긴다. 아니면 End를 다시 누른다.

/** 커서가 접힌 선택이고, 커서 뒤로 같은 줄에 남은 글자가 없는가 */
const caretAtLineEnd = (page: Page) => page.evaluate(() => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const r = sel.getRangeAt(0);
  const node = r.endContainer.nodeType === Node.ELEMENT_NODE ? r.endContainer as Element : r.endContainer.parentElement;
  const block = node?.closest('.bn-inline-content, pre, p, blockquote');
  if (!block) return false;
  const after = document.createRange();
  after.setStart(r.endContainer, r.endOffset);
  after.setEnd(block, block.childNodes.length);
  return after.toString().split('\n')[0] === '';
});

/** End가 커서를 옮기지 못한 회의 DOM 선택과 에디터 상태 선택. 앱 결함인지 가를 때 쓴다 */
const selectionState = (page: Page) => page.evaluate(() => {
  const sel = window.getSelection();
  const r = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
  const pm = (window as any).__editor?._tiptapEditor?.state?.selection;
  return {
    dom: r ? { text: r.endContainer.textContent?.slice(0, 40), offset: r.endOffset, collapsed: sel!.isCollapsed } : null,
    pm: pm ? { from: pm.from, to: pm.to } : null,
  };
});

/** target을 누르고 커서를 그 줄 끝에 둔다. 다섯 번 안에 끝에 닿지 않으면 실패한다 */
export async function placeCaretAtEnd(page: Page, target: Locator): Promise<void> {
  await target.click();
  for (let attempt = 1; attempt <= 5; attempt++) {
    await page.keyboard.press('End');
    await page.waitForTimeout(50);
    if (await caretAtLineEnd(page)) {
      await page.waitForTimeout(100);
      if (await caretAtLineEnd(page)) return;
    }
    console.log(`placeCaretAtEnd: End ${attempt}번째가 줄 끝에 닿지 않음 ${JSON.stringify(await selectionState(page))}`);
  }
  expect(await caretAtLineEnd(page), '커서가 줄 끝에 닿지 않았다').toBe(true);
}
