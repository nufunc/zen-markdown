// 여러 문단 인용을 인용 블록 여럿으로 나눴다가 저장할 때 합치는지 본다(추가 검토 9).
// 실행: npx tsx tests/quote.mts   (npm test에 들어 있다)
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { pretendToBeVisual: true });
for (const key of ['window','document','navigator','HTMLElement','Element','Node','DOMParser','MutationObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) {
  try { Object.defineProperty(globalThis, key, { value: (dom.window as any)[key] ?? (globalThis as any)[key], configurable: true, writable: true }); } catch {}
}
const { BlockNoteEditor } = await import('@blocknote/core');
const T = await import('../src/markdownTransforms.ts');
const { fromEditorMarkdown, makeLiteralVerifier, markdownToBlocks, blocksToMarkdown } = await import('../src/markdownPipeline.ts');
const editor = BlockNoteEditor.create() as any;
T.setLiteralVerifier(makeLiteralVerifier(md => editor.tryParseMarkdownToBlocks(md)));


// 앱의 여는 경로와 저장 경로와 같은 체인. 이어진 인용의 ID를 파싱 결과에서 모아 저장에 넘긴다.
const roundtrip = (md: string) => {
  const ctx = { docBaseUri: '', wikilinkNames: new Set<string>(), quoteJoins: [] as boolean[] };
  const blocks = markdownToBlocks(md, ctx, m => editor.tryParseMarkdownToBlocks(m));
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

// 구조가 든 인용(추가 검토 20): 인용 안의 목록, 헤딩, 코드, 중첩 인용이 인용의 자식 블록이 된다.
// 앱과 같은 저장 경로(blocksToMarkdown)를 쓰고, 안쪽의 인용 이어짐도 합친다
const openS = (md: string) => {
  const ctx: any = { docBaseUri: '', wikilinkNames: new Set<string>(), quoteJoins: [] as boolean[] };
  return { ctx, blocks: markdownToBlocks(md, ctx, m => editor.tryParseMarkdownToBlocks(m)) };
};
const saveS = (blocks: any[], ctx: any) => {
  const joins = new Set([...T.quoteJoinIds(blocks, ctx.quoteJoins), ...(ctx.innerQuoteJoins ?? [])]);
  let out = blocksToMarkdown(blocks, bs => editor.blocksToMarkdownLossy(bs), joins, T.tableOriginalIds(blocks, ctx.tables ?? []));
  out = T.preserveMarkdownLineBreaks(T.normalizeUnorderedListBullets(T.normalizeOrderedListNumbers(out)));
  return fromEditorMarkdown(out, ctx).replace(/\n+$/, '');
};
const treeOf = (bs: any[]): string => bs.map((b: any) => b.type + ':' + (Array.isArray(b.content) ? b.content.map((c: any) => c.text ?? `<${c.type}>`).join('') : '') + (b.children?.length ? '[' + treeOf(b.children) + ']' : '')).join(', ');
/** 연 모델이 expected이고, 저장하면 saved(생략하면 원문)이며, 다시 열어도 같은 모델이고 두 번째 저장이 같다 */
const structured = (name: string, md: string, expected: string, saved = md) => {
  const { ctx, blocks } = openS(md);
  check(name + ': 모델', treeOf(blocks) === expected, treeOf(blocks));
  const s1 = saveS(blocks, ctx);
  check(name + ': 저장', s1 === saved, JSON.stringify(s1));
  const o2 = openS(s1);
  check(name + ': 다시 열면 같다', treeOf(o2.blocks) === treeOf(blocks) && saveS(o2.blocks, o2.ctx) === s1, treeOf(o2.blocks));
};
structured('인용 안 목록', '> 앞 문단\n> - a\n> - b', 'quote:앞 문단[bulletListItem:a, bulletListItem:b]');
structured('목록으로 시작하는 인용', '> 1. 하나\n> 2. 둘', 'quote:[numberedListItem:하나, numberedListItem:둘]');
structured('인용 안 헤딩', '> # 제목\n>\n> 본문', 'quote:[heading:제목, paragraph:본문]');
structured('인용 안 코드 펜스', '> 앞\n>\n> ```js\n> const x = 1;\n> ```\n>\n> 뒤', 'quote:앞[codeBlock:const x = 1;, paragraph:뒤]');
structured('중첩 인용', '> 바깥\n>\n> > 안쪽 인용', 'quote:바깥[quote:안쪽 인용]');
structured('중첩 인용의 두 문단은 한 인용으로 남는다', '> 바깥\n>\n> > 안 A\n> >\n> > 안 B', 'quote:바깥[quote:안 A, quote:안 B]');
structured('목록 안의 구조 인용', '- 목록\n  > 인용 안\n  > - 중첩', 'bulletListItem:목록[quote:인용 안[bulletListItem:중첩]]');
structured('인용 안 위키링크', '> 앞 [[위키 링크]]\n> - [[a]] 항목\n\n뒤 [[b]]', 'quote:앞 <link>[bulletListItem:<link> 항목], paragraph:뒤 <link>');
structured('구조 없는 여러 문단 인용은 추가 검토 9 그대로', '> A\n>\n> B', 'quote:A, quote:B');
{
  // 인용 안 목록 항목 하나를 고치면 그 줄만 바뀐다
  const md = '앞\n\n> 설명\n> - 첫째\n> - 둘째\n\n뒤';
  const { ctx, blocks } = openS(md);
  const edited = JSON.parse(JSON.stringify(blocks));
  edited.find((b: any) => b.type === 'quote').children[1].content[0].text = '둘째 고침';
  const s = saveS(edited, ctx);
  check('인용 안 목록 항목을 고치면 그 줄만 바뀐다', s === md.replace('둘째', '둘째 고침'), JSON.stringify(s));
  // 항목을 더해도 인용 안에 남는다
  const added = JSON.parse(JSON.stringify(blocks));
  added.find((b: any) => b.type === 'quote').children.push({ type: 'bulletListItem', content: [{ type: 'text', text: '셋째', styles: {} }], children: [] });
  const s2 = saveS(added, ctx);
  check('인용 안에 항목을 더하면 인용 안에 남는다', s2 === '앞\n\n> 설명\n> - 첫째\n> - 둘째\n> - 셋째\n\n뒤', JSON.stringify(s2));
}

// GitHub 알림과 Obsidian 콜아웃(추가 검토 27): 표식 줄 끝에 \를 붙이지 않고, 편집한 뒤에도 원문 모양으로 저장한다
const alertSame = (name: string, md: string) => {
  const { ctx, blocks } = openS(md);
  const s1 = saveS(blocks, ctx);
  const o2 = openS(s1);
  check(name, s1 === md && saveS(o2.blocks, o2.ctx) === s1 && treeOf(o2.blocks) === treeOf(blocks), JSON.stringify(s1));
};
alertSame('GitHub 알림', '> [!NOTE]\n> 참고할 내용');
alertSame('Obsidian 콜아웃 제목', '> [!warning] 주의\n> 본문');
alertSame('접는 콜아웃', '> [!tip]- 펼치기\n> 숨긴 내용');
alertSame('여러 문단 알림(인용 이어짐)', '> [!IMPORTANT]\n> 첫 문단\n>\n> 둘째 문단');
alertSame('목록이 든 알림(구조 인용)', '> [!CAUTION]\n> - 하나\n> - 둘');
{
  // 알림 본문을 고쳐도 표식 줄은 그대로다
  const { ctx, blocks } = openS('> [!NOTE]\n> 참고');
  const edited = JSON.parse(JSON.stringify(blocks));
  edited[0].content = edited[0].content.map((c: any) => (c.type === 'text' ? { ...c, text: c.text.replace('참고', '참고 고침') } : c));
  const s = saveS(edited, ctx);
  check('알림 본문을 고쳐도 표식 줄은 그대로', s === '> [!NOTE]\n> 참고 고침', JSON.stringify(s));
}
// 알림이 아닌 인용의 강제 줄바꿈은 그대로 둔다
alertSame('알림이 아닌 인용의 줄바꿈', '> 첫 줄\\\n> 둘째 줄');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
