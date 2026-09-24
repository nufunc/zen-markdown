// 인라인 코드 안의 글자와 같은 이름의 일반 링크를 앱 전처리가 바꾸지 않는지 본다(추가 검토 13).
// 실행: npx tsx tests/wikilink.mts   (npm test에 들어 있다)
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { pretendToBeVisual: true });
for (const key of ['window','document','navigator','HTMLElement','Element','Node','DOMParser','MutationObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) {
  try { Object.defineProperty(globalThis, key, { value: (dom.window as any)[key] ?? (globalThis as any)[key], configurable: true, writable: true }); } catch {}
}
const { BlockNoteEditor } = await import('@blocknote/core');
const T = await import('../src/markdownTransforms.ts');
const { toEditorMarkdown, fromEditorMarkdown, makeLiteralVerifier, blocksToMarkdown } = await import('../src/markdownPipeline.ts');
const editor = BlockNoteEditor.create() as any;
T.setLiteralVerifier(makeLiteralVerifier(md => editor.tryParseMarkdownToBlocks(md)));

// 파싱과 저장이 같은 ctx를 쓴다(앱과 같다). 병합(2단계)은 거치지 않는다
const open = (md: string) => {
  const ctx: any = { docBaseUri: '', wikilinkNames: new Set<string>(), quoteJoins: [] as boolean[] };
  return { ctx, blocks: T.processBlocksFromMarkdown(editor.tryParseMarkdownToBlocks(toEditorMarkdown(md, ctx))) };
};
const save = (blocks: any[], ctx: any) => {
  let m = blocksToMarkdown(blocks, bs => editor.blocksToMarkdownLossy(bs), T.quoteJoinIds(blocks, ctx.quoteJoins));
  m = T.preserveMarkdownLineBreaks(T.normalizeUnorderedListBullets(T.normalizeOrderedListNumbers(m)));
  return fromEditorMarkdown(m, ctx).replace(/\n+$/, '');
};
const codeTexts = (blocks: any[]) => blocks.flatMap((b: any) => (b.content ?? []).filter((c: any) => c.styles?.code).map((c: any) => c.text));

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail: string) => {
  if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + '\n  ' + detail); }
};

// 인라인 코드 안의 글자는 모델에서도 원문 그대로다
for (const [md, code] of [
  ['tag `<b>x</b>` here', '<b>x</b>'],
  ['see `[[Note]]` here', '[[Note]]'],
  ['img `![x](y.png)` here', '![x](y.png)'],
  ['path `[[misc/<slug>]]` here', '[[misc/<slug>]]'],
  ['code ``[[x]] `y` `` end', '[[x]] `y` '],
] as const) {
  const { ctx, blocks } = open(md);
  const saved = save(blocks, ctx);
  ok('인라인 코드 원문 유지: ' + md, codeTexts(blocks)[0] === code && saved === md, JSON.stringify({ code: codeTexts(blocks), saved }));
}

// 같은 이름의 일반 링크와 위키링크
for (const md of ['code `[Note](Note.md)` and link [[Note]]', 'plain [Note](Note.md) and [[Note]]', 'See [[my-doc]] here', 'See [README](README.md) and [[README]]']) {
  const { ctx, blocks } = open(md);
  const saved = save(blocks, ctx);
  ok('저장해도 원문 그대로: ' + md, saved === md, JSON.stringify(saved));
}

// 편집한 뒤에도 편집하지 않은 링크와 코드는 그대로다(병합 없이)
{
  const md = 'plain [Note](Note.md) and [[Note]] and `[[Note]]`\n\nsecond paragraph';
  const { ctx, blocks } = open(md);
  const edited = blocks.map((b: any) => (b.content?.[0]?.text === 'second paragraph' ? { ...b, content: [{ type: 'text', text: 'second paragraph EDIT', styles: {} }] } : b));
  const saved = save(edited, ctx);
  ok('다른 문단을 고쳐도 첫 줄이 원문 그대로', saved.split('\n')[0] === md.split('\n')[0], JSON.stringify(saved));
}
{
  // 앞에 다른 링크가 든 문단을 새로 넣어도 원래 링크는 각자 원문 모양으로 남는다. 같은 이름의 링크를 새로 넣으면 차례로만 짝지으므로 가리지 못한다
  const md = 'first [[Note]]\n\nlast [Note](Note.md)';
  const { ctx, blocks } = open(md);
  const added = [{ type: 'paragraph', content: [{ type: 'link', href: 'Other.md', content: [{ type: 'text', text: 'Other', styles: {} }] }], children: [] }, ...blocks];
  const saved = save(added, ctx);
  ok('앞에 문단을 넣어도 원래 위키링크와 일반 링크 유지', saved === '[Other](Other.md)\n\nfirst [[Note]]\n\nlast [Note](Note.md)', JSON.stringify(saved));
}

// 공백, 폴더, 헤딩, 별칭이 든 위키링크(추가 검토 14): 주소가 잘리지 않고, 저장하면 원래 표기로 돌아온다
const links = (blocks: any[]) => blocks.flatMap((b: any) => (b.content ?? []).filter((c: any) => c.type === 'link')
  .map((c: any) => [c.href, (c.content ?? []).map((t: any) => t.text).join('')]));
for (const [md, href, text] of [
  ['see [[my doc]] here', 'my doc.md', 'my doc'],
  ['see [[폴더/한글 문서]] here', '폴더/한글 문서.md', '폴더/한글 문서'],
  ['see [[a#Heading Two]] here', 'a.md#Heading Two', 'a#Heading Two'],
  ['see [[my doc|별칭]] here', 'my doc.md', '별칭'],
  ['see [[plain]] here', 'plain.md', 'plain'],
] as const) {
  const { ctx, blocks } = open(md);
  ok('링크 주소와 글자: ' + md, JSON.stringify(links(blocks)) === JSON.stringify([[href, text]]), JSON.stringify(links(blocks)));
  ok('저장해도 원문 그대로: ' + md, save(blocks, ctx) === md, JSON.stringify(save(blocks, ctx)));
  const doc = md + '\n\nsecond paragraph';
  const o = open(doc);
  const edited = o.blocks.map((b: any) => (b.content?.[0]?.text === 'second paragraph' ? { ...b, content: [{ type: 'text', text: 'second paragraph EDIT', styles: {} }] } : b));
  ok('다른 문단을 고쳐도(병합 없이) 원문 그대로: ' + md, save(edited, o.ctx) === md + '\n\nsecond paragraph EDIT', JSON.stringify(save(edited, o.ctx)));
}
{
  // 링크 글자를 고치면 위키링크를 새 글자로 다시 만든다. 다시 만들 수 없는 글자면 일반 링크로 둔다
  const setLinkText = (blocks: any[], text: string) => blocks.map((b: any) => ({ ...b, content: (b.content ?? []).map((c: any) =>
    c.type === 'link' ? { ...c, content: [{ type: 'text', text, styles: {} }] } : c) }));
  const { ctx, blocks } = open('see [[my doc|별칭]] here');
  ok('별칭을 고치면 새 별칭으로', save(setLinkText(blocks, '새 이름'), ctx) === 'see [[my doc|새 이름]] here', JSON.stringify(save(setLinkText(blocks, '새 이름'), ctx)));
  const o = open('see [[my doc|별칭]] here');
  ok('별칭을 문서 이름과 같게 고치면 별칭 없이', save(setLinkText(o.blocks, 'my doc'), o.ctx) === 'see [[my doc]] here', JSON.stringify(save(setLinkText(o.blocks, 'my doc'), o.ctx)));
  const p = open('see [[my doc|별칭]] here');
  const bad = save(setLinkText(p.blocks, 'a|b'), p.ctx);
  ok('위키링크로 만들 수 없는 글자면 일반 링크로', !bad.includes('[[') && bad.includes('(<my doc.md>)'), JSON.stringify(bad));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
