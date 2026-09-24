// 저장하고 다시 열면 보이는 문서가 같은지 본다(추가 검토 8).
// 실행: npx tsx tests/reopen.mts   (npm test에 들어 있다)
//
// 비교는 블록 종류와 인라인 글자, 그리고 공백이 아닌 글자의 스타일이다. 공백과 줄바꿈에 붙은 강조는 화면에서 구분되지 않으므로 보지 않는다.
// 저장 결과가 두 번째 저장부터 바뀌지 않는지도 본다.
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
const parse = (md: string, c: any) => T.processBlocksFromMarkdown(editor.tryParseMarkdownToBlocks(toEditorMarkdown(md, c)));
const save = (blocks: any[], c: any) => {
  let m = editor.blocksToMarkdownLossy(T.processBlocksToMarkdown(blocks, T.quoteJoinIds(blocks, c.quoteJoins)));
  m = T.preserveMarkdownLineBreaks(T.normalizeUnorderedListBullets(T.normalizeOrderedListNumbers(m)));
  return fromEditorMarkdown(m, c).replace(/\n+$/, '');
};

/** 보이는 모습의 요약: 공백과 줄바꿈의 스타일은 지우고, 같은 스타일이 이어지면 합친다 */
const view = (blocks: any[]): string => blocks.map((b: any) => {
  const parts: { t: string; st: string }[] = [];
  for (const c of Array.isArray(b.content) ? b.content : []) {
    if (c.type !== 'text') { parts.push({ t: `<${c.type}:${c.href ?? ''}>`, st: '' }); continue; }
    for (const piece of c.text.split(/(\s+)/)) {
      if (!piece) continue;
      const st = piece.trim() ? JSON.stringify(c.styles) : '';
      const last = parts[parts.length - 1];
      if (last && last.st === st) last.t += piece; else parts.push({ t: piece, st });
    }
  }
  return b.type + '|' + parts.map(p => p.t + p.st).join('') + '|' + view(b.children ?? []);
}).join('\n');

let pass = 0, fail = 0;
const check = (name: string, md: string) => {
  const c1 = ctx(), m1 = parse(md, c1), s1 = save(m1, c1);
  const c2 = ctx(), m2 = parse(s1, c2), s2 = save(m2, c2);
  if (view(m1) === view(m2) && s1 === s2) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + '\n  saved : ' + JSON.stringify(s1) + '\n  saved2: ' + JSON.stringify(s2) + '\n  view1 : ' + view(m1) + '\n  view2 : ' + view(m2)); }
};

check('굵게 안의 인라인 코드', '**auditd `auid=-1` 만 기록된다**');
check('기울임 안의 인라인 코드', '*기울임 `code` 끝*');
check('인용 안 다음 줄의 굵게', '> TL;DR\n> **결론**: 끝');
check('굵게 뒤 줄바꿈과 다음 줄 굵게', '> **TL;DR**\n> **결론**: 끝');
check('줄바꿈을 가로지르는 굵게', '**첫 줄\n둘째 줄**');
check('한국어 조사가 붙은 굵게', '이제 **중요.**다음 문장, 결과는 **87.5%**이다, **결론**: 끝');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
