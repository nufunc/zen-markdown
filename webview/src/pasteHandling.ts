// 붙여 넣기 입구. Ctrl+V(pasteHandler)와 우클릭 메뉴의 붙여넣기가 같은 처리를 지난다(추가 검토 30)
import { parseTableFromClipboardText } from './markdownTransforms';

const inCodeBlock = (ed: any): boolean =>
  ed.transact((tr: any) => tr.selection.$from.parent.type.spec.code && tr.selection.$to.parent.type.spec.code);

/** Windows 클립보드의 CRLF를 LF로 바꾼다. 그대로 두면 줄마다 \r이 남아 마크다운 표식이 글자로 저장된다 */
const normalizeEol = (text: string) => text.replace(/\r\n?/g, '\n');

/** 평문을 붙여 넣는다. 코드 블록 안이면 글자 그대로, TSV면 표(첫 행이 머리 행), 그 밖은 마크다운으로 읽는다 */
export function pastePlainText(ed: any, raw: string): void {
  const text = normalizeEol(raw);
  if (inCodeBlock(ed)) ed.pasteText(text);
  else ed.pasteMarkdown(parseTableFromClipboardText(text) ?? text);
}

/** <code> 없는 <pre>(GitHub 렌더링 모양)를 <pre><code>로 감싼다. BlockNote는 pre>code만 코드 블록으로 읽는다 */
export const wrapBarePre = (html: string) =>
  html.replace(/<pre\b([^>]*)>(?!\s*<code\b)([\s\S]*?)<\/pre>/gi, '<pre$1><code>$2</code></pre>');

/**
 * Ctrl+V 처리. 붙여 넣었으면 true, BlockNote 기본 처리로 넘길 것이면 false.
 * wordLists는 Word 목록 HTML을 ul/ol로 바꾸는 함수다.
 */
export function handlePaste(ed: any, data: DataTransfer, wordLists: (html: string) => string): boolean {
  // 에디터 안에서 복사한 블록, 파일, 마크다운 형식은 BlockNote가 처리한다
  if (['blocknote/html', 'Files', 'text/markdown'].some(t => data.types.includes(t))) return false;
  const plain = data.getData('text/plain');
  // VS Code 텍스트 편집기에서 복사한 것. BlockNote는 한 낱말도 코드 블록으로 넣어 문장이 갈렸다(추가 검토 30).
  // 한 줄이면 언어와 상관없이 글자로, 여러 줄이면 markdown은 마크다운으로 읽고 그 밖은 BlockNote가 코드 블록으로 넣는다
  if (data.types.includes('vscode-editor-data')) {
    const text = normalizeEol(plain).replace(/\n$/, '');
    if (!text) return false;
    if (!text.includes('\n')) { ed.pasteText(text); return true; }
    let mode = '';
    try { mode = JSON.parse(data.getData('vscode-editor-data'))?.mode ?? ''; } catch { /* 모양이 다르면 코드 블록으로 둔다 */ }
    if (mode !== 'markdown') return false;
    pastePlainText(ed, text);
    return true;
  }
  const html = data.getData('text/html');
  // TSV는 HTML보다 먼저 본다. Excel은 머리 행(<th>) 없는 HTML 표를 함께 넣어 빈 머리 행이 생긴다
  if (html && !inCodeBlock(ed) && !parseTableFromClipboardText(normalizeEol(plain))) {
    ed.pasteHTML(/mso-list/i.test(html) ? wordLists(html) : wrapBarePre(html));
    return true;
  }
  if (!plain) return false;
  pastePlainText(ed, plain);
  return true;
}
