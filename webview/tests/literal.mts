// 평문 속 마크다운 기호가 저장하고 다시 열어도 평문으로 남는지 본다(추가 검토 10).
// 실행: npx tsx tests/literal.mts   (npm test에 들어 있다)
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { pretendToBeVisual: true });
for (const key of ['window','document','navigator','HTMLElement','Element','Node','DOMParser','MutationObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) {
  try { Object.defineProperty(globalThis, key, { value: (dom.window as any)[key] ?? (globalThis as any)[key], configurable: true, writable: true }); } catch {}
}
const { BlockNoteEditor } = await import('@blocknote/core');
const T = await import('../src/markdownTransforms.ts');
const { toEditorMarkdown, fromEditorMarkdown, makeLiteralVerifier } = await import('../src/markdownPipeline.ts');
const editor = BlockNoteEditor.create() as any;
T.setLiteralVerifier(makeLiteralVerifier(md => editor.tryParseMarkdownToBlocks(md)));


const ctx = () => ({ docBaseUri: '', wikilinkNames: new Set<string>(), quoteJoins: [] as boolean[] });
const save = (text: string) => {
  const c = ctx();
  let m = editor.blocksToMarkdownLossy(T.processBlocksToMarkdown([{ type: 'paragraph', content: [{ type: 'text', text, styles: {} }] }]));
  m = T.preserveMarkdownLineBreaks(T.normalizeUnorderedListBullets(T.normalizeOrderedListNumbers(m)));
  return fromEditorMarkdown(m, c).replace(/\n+$/, '');
};
/** 다시 열었을 때 문단 하나에 스타일 없는 평문만 있으면 그 글자를, 아니면 null */
const reopenPlain = (md: string): string | null => {
  const c = ctx();
  const blocks = T.processBlocksFromMarkdown(editor.tryParseMarkdownToBlocks(toEditorMarkdown(md, c)));
  if (blocks.length !== 1 || blocks[0].type !== 'paragraph') return null;
  const content = blocks[0].content ?? [];
  if (content.some((x: any) => x.type !== 'text' || Object.keys(x.styles ?? {}).length)) return null;
  return content.map((x: any) => x.text).join('').replaceAll('​', '');
};

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail: string) => {
  if (cond) pass++; else { fail++; console.log('FAIL ' + name + '\n  ' + detail); }
};

// 다시 열면 서식이 되던 평문
const BS = String.fromCharCode(92);
const literals = ['see [x](y) here', '1) at start', '1. item', '+ plus', '- minus', '# not heading', '> not quote', '***', '---', '===',
  '```', '~~y~~', 'use a*b*c now', '_under_', '`tick`', 'a' + BS + 'b', 'end ' + BS, 'a' + BS + '*b', '![img](x.png)', 'line one\n# two\n- three'];
for (const t of literals) {
  const saved = save(t);
  ok('평문 유지: ' + JSON.stringify(t), reopenPlain(saved) === t, 'saved ' + JSON.stringify(saved) + ' reopen ' + JSON.stringify(reopenPlain(saved)));
}

// 넘치는 이스케이프가 없어야 하는 평문: 저장 결과가 원문과 같다
for (const t of ['C# and F#', '100% done', 'end with #', 'path a_b_c', 'https://x.io/a_b_c', '2 * 3 = 6', '5 * 6 * 7', 'x < y > z',
  'a & b', '[foo] reference', '<https://x.io>', '한국어 문장입니다.', 'snake_case_name 그대로', '*foo**']) {
  const saved = save(t);
  ok('이스케이프 없음: ' + JSON.stringify(t), saved === t, 'saved ' + JSON.stringify(saved));
}

// 재열기 불변식: 시드를 고정한 무작위 문단 1,000개
let seed = 20260924;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <X,>(xs: X[]) => xs[Math.floor(rand() * xs.length)];
const atoms = ['word', 'x', '가나', '1', '42', ' ', ' ', '*', '**', '_', '__', '`', '~', '~~', '[', ']', '(', ')', '#', '# ', '> ', '- ', '+ ', '1. ', '2) ',
  BS, '!', '<', '>', '&', '---', '===', '```', '|', ':', '/', '.', 'http://a.b/c_d'];
let invariantFail = 0;
for (let i = 0; i < 1000; i++) {
  const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, () =>
    Array.from({ length: 1 + Math.floor(rand() * 8) }, () => pick(atoms)).join('').trim()).filter(Boolean);
  if (!lines.length) continue;
  // 둘째 줄부터 = 만 있는 줄은 setext 헤딩이 된다. BlockNote 파서가 \= 를 풀지 않아 막을 수 없는 한계라 뺀다
  if (lines.slice(1).some(l => /^=+$/.test(l))) continue;
  const text = lines.join('\n');
  const saved = save(text);
  // BlockNote는 연속 공백을 한 칸으로 접는다(이스케이프와 무관한 한계)
  const squeeze = (t: string | null) => t?.replace(/ {2,}/g, ' ');
  if (squeeze(reopenPlain(saved)) !== squeeze(text)) {
    invariantFail++;
    if (invariantFail <= 5) console.log('INVARIANT ' + JSON.stringify(text) + ' saved ' + JSON.stringify(saved) + ' reopen ' + JSON.stringify(reopenPlain(saved)));
  }
}
ok('무작위 1,000개 재열기 불변식', invariantFail === 0, invariantFail + ' failed');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
