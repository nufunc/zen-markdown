// 목록 항목 안의 목록 아닌 자식이 저장하고 다시 열어도 항목 안에 남는지 본다(추가 검토 11).
// 실행: npx tsx tests/list.mts   (npm test에 들어 있다)
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { pretendToBeVisual: true });
for (const key of ['window','document','navigator','HTMLElement','Element','Node','DOMParser','MutationObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) {
  try { Object.defineProperty(globalThis, key, { value: (dom.window as any)[key] ?? (globalThis as any)[key], configurable: true, writable: true }); } catch {}
}
const { BlockNoteEditor } = await import('@blocknote/core');
const T = await import('../src/markdownTransforms.ts');
const { fromEditorMarkdown, makeLiteralVerifier, blocksToMarkdown, markdownToBlocks } = await import('../src/markdownPipeline.ts');
const editor = BlockNoteEditor.create() as any;
T.setLiteralVerifier(makeLiteralVerifier(md => editor.tryParseMarkdownToBlocks(md)));

const ctx = () => ({ docBaseUri: '', wikilinkNames: new Set<string>(), quoteJoins: [] as boolean[] });
const parse = (md: string, c: any) => markdownToBlocks(md, c, m => editor.tryParseMarkdownToBlocks(m));
const save = (blocks: any[], c: any) => {
  let m = blocksToMarkdown(blocks, bs => editor.blocksToMarkdownLossy(bs), T.quoteJoinIds(blocks, c.quoteJoins));
  m = T.preserveMarkdownLineBreaks(T.normalizeUnorderedListBullets(T.normalizeOrderedListNumbers(m)));
  return fromEditorMarkdown(m, c).replace(/\n+$/, '');
};
/** 블록 트리 모양: 종류와 글자, 자식을 들여 쓴 줄로 */
const tree = (bs: any[], depth = 0): string => bs.map(b =>
  '  '.repeat(depth) + b.type + ':' + (Array.isArray(b.content) ? b.content.map((c: any) => c.text ?? `<${c.type}>`).join('') : '') +
  (b.children?.length ? '\n' + tree(b.children, depth + 1) : '')).join('\n');

let pass = 0, fail = 0;
const check = (name: string, md: string, expectSaved?: string) => {
  const c1 = ctx(), m1 = parse(md, c1), s1 = save(m1, c1);
  const c2 = ctx(), m2 = parse(s1, c2), s2 = save(m2, c2);
  const ok = tree(m1) === tree(m2) && s1 === s2 && (expectSaved === undefined || s1 === expectSaved);
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + '\n  saved : ' + JSON.stringify(s1) + '\n  tree1 : ' + JSON.stringify(tree(m1)) + '\n  tree2 : ' + JSON.stringify(tree(m2))); }
};

check('목록 항목 안의 코드 블록', '- 조치:\n\n  ```bash\n  az acr update\n  ```', '- 조치:\n\n  ```bash\n  az acr update\n  ```');
check('번호 목록 항목 안의 둘째 문단', '1. first line\n\n   continued paragraph', '1. first line\n\n   continued paragraph');
check('목록 항목 안의 이미지', '1. step\n\n   ![img](a.png)', '1. step\n\n   ![img](a.png)');
check('목록 항목 안의 표', '- item\n\n  | a | b |\n  |---|---|\n  | 1 | 2 |');
check('문단, 중첩 목록, 코드 블록이 섞인 자식은 모델 순서를 지킨다', '- item\n\n  para\n\n  - nested\n\n  ```js\n  x();\n  ```\n- next');
{
  const items = Array.from({ length: 11 }, (_, i) => `${i + 1}. item ${i + 1}` + (i === 9 ? '\n\n    child of ten' : '')).join('\n');
  check('10번 이상 번호: 자식 뒤에서 번호가 1로 되돌아가지 않고 네 칸 들여 쓴다', items);
  const c = ctx();
  const saved = save(parse(items, c), c);
  const ok = saved.includes('\n\n    child of ten\n') && saved.includes('\n11. item 11');
  if (ok) pass++; else { fail++; console.log('FAIL 10번 항목 저장 모양\n  ' + JSON.stringify(saved)); }
}
check('두 단계 중첩 항목 안의 코드 블록', '- a\n  - b\n\n    ```sh\n    ls\n    ```\n  - c\n- d');

// 추가 검토 12: 여러 줄 목록 항목은 처음 열 때부터 항목 하나이고, 둘째 줄은 항목 텍스트의 줄바꿈이다
const firstOpen = (name: string, md: string, text: string) => {
  const m = parse(md, ctx());
  const ok = m.length === 1 && !(m[0].children?.length) && m[0].content.map((c: any) => c.text).join('') === text;
  if (ok) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + '\n  ' + JSON.stringify(tree(m))); }
};
firstOpen('백슬래시 줄바꿈 항목은 처음 열 때 항목 하나', '- item one\\\n  next line', 'item one\nnext line');
firstOpen('두 칸 줄바꿈 항목은 처음 열 때 항목 하나', '- item one  \n  next line', 'item one\nnext line');
firstOpen('부드러운 줄바꿈 항목은 처음 열 때 항목 하나', '- item one\n  lazy continuation', 'item one\nlazy continuation');
firstOpen('세 줄 번호 항목은 처음 열 때 항목 하나', '1. a\\\n   b\\\n   c', 'a\nb\nc');
check('백슬래시 줄바꿈 항목은 편집 없이 저장하면 원문 그대로', '2. start the server.\\\n   next line', '2. start the server.\\\n   next line');
check('두 칸 줄바꿈 항목은 저장하고 다시 열어도 같다', '- item one  \n  next line');
check('여러 줄 항목과 코드 블록 자식', '- one\\\n  two\n\n  ```js\n  x();\n  ```\n- next');
check('여러 줄 항목 아래 중첩 목록', '1. one\\\n   two\n   - nested\\\n     more\n2. next');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
