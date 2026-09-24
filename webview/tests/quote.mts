// 여러 문단 인용을 인용 블록 여럿으로 나눴다가 저장할 때 합치는지 본다(추가 검토 9).
// 실행: npx tsx tests/quote.mts   (npm test에 들어 있다)
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


// 앱의 여는 경로와 저장 경로와 같은 체인. 이어진 인용의 ID를 파싱 결과에서 모아 저장에 넘긴다.
const roundtrip = (md: string) => {
  const ctx = { docBaseUri: '', wikilinkNames: new Set<string>(), quoteJoins: [] as boolean[] };
  const blocks = T.processBlocksFromMarkdown(editor.tryParseMarkdownToBlocks(toEditorMarkdown(md, ctx)));
  const joins = T.quoteJoinIds(blocks, ctx.quoteJoins);
  let out = editor.blocksToMarkdownLossy(T.processBlocksToMarkdown(blocks, joins));
  out = T.preserveMarkdownLineBreaks(T.normalizeUnorderedListBullets(T.normalizeOrderedListNumbers(out)));
  return { out: fromEditorMarkdown(out, ctx).replace(/\n+$/, ''), blocks };
};

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: string) => {
  if (ok) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + '\n  ' + detail); }
};
const same = (name: string, md: string) => {
  const { out } = roundtrip(md);
  check(name, out === md, JSON.stringify(out));
};

same('두 문단 인용은 한 인용으로 저장된다', '> A\n>\n> B');
same('세 문단 인용', '> one\n>\n> two\n>\n> three');
same('원래 떨어진 인용 둘은 떨어진 채로 저장된다', '> A\n\n> B');
same('이어진 인용과 떨어진 인용이 섞인 문서', '> A\n>\n> B\n\ntext\n\n> C');
{
  const { blocks } = roundtrip('> A\n>\n> B');
  check('두 문단 인용은 화면에서 인용 블록 둘이다', blocks.filter((b: any) => b.type === 'quote').length === 2, JSON.stringify(blocks.map((b: any) => b.type)));
}
{
  const { out } = roundtrip('> # H\n> text');
  check('인용 안 헤딩이 다음 줄과 한 단어로 붙지 않는다', !out.includes('Htext') && out.includes('H') && out.includes('text'), JSON.stringify(out));
}
{
  const { out } = roundtrip('> a\n>> nested\n\nafter');
  check('중첩 인용이 있어도 실패하지 않고 글자가 남는다', out.includes('a') && out.includes('nested') && out.includes('after'), JSON.stringify(out));
}
same('코드 펜스 안의 > 줄은 건드리지 않는다', '```js\n> A\n>\n> B\n```');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
