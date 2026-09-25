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

/** 보이는 모습의 요약: 공백과 줄바꿈의 스타일은 지우고, 같은 스타일이 이어지면 합친다 */
const inline = (content: any[]): string => {
  const parts: { t: string; st: string }[] = [];
  for (const c of content) {
    // 링크는 주소와 함께 글자와 스타일도 적는다(추가 검토 21: 링크 글자의 퇴행도 잡는다)
    if (c.type === 'link') { parts.push({ t: `<link:${c.href ?? ''}|${inline(c.content ?? [])}>`, st: '' }); continue; }
    if (c.type !== 'text') { parts.push({ t: `<${c.type}:${c.href ?? ''}>`, st: '' }); continue; }
    for (const piece of c.text.split(/(\s+)/)) {
      if (!piece) continue;
      const st = piece.trim() ? JSON.stringify(c.styles) : '';
      const last = parts[parts.length - 1];
      if (last && last.st === st) last.t += piece; else parts.push({ t: piece, st });
    }
  }
  return parts.map(p => p.t + p.st).join('');
};
// 표는 칸마다 인라인을 읽고 칸은 ¦, 행은 ⏎로 가른다(추가 검토 17: 표 칸의 퇴행도 잡는다)
const blockInline = (b: any): string => Array.isArray(b.content) ? inline(b.content)
  : b.content?.rows ? b.content.rows.map((r: any) => r.cells.map((c: any) => inline(c.content ?? [])).join('¦')).join('⏎') : '';
const view = (blocks: any[]): string => blocks.map((b: any) =>
  b.type + '|' + blockInline(b) + '|' + view(b.children ?? [])
).join('\n');

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

check('인라인 코드 뒤 강제 줄바꿈 다음 줄의 굵게', '> **A**: `x.md`\\\n> **B**: y\n> **C**: z');
// 표 칸도 문단과 같은 인라인 후처리를 거친다(추가 검토 17)
check('표 칸: 굵게 안의 인라인 코드', '| a |\n| --- |\n| **auditd `auid=-1` 만 기록** |');
check('표 칸: 이스케이프한 링크 모양', '| a |\n| --- |\n| \\[x](y) |');
check('표 칸: 이스케이프한 별표', '| a |\n| --- |\n| \\*not em* |');
check('표 칸: 글자와 주소가 같은 링크', '| a |\n| --- |\n| [01_현황진단.md](01_현황진단.md) |');
check('표 칸: 셀 안의 \\|는 겹쳐 이스케이프하지 않는다', '| a |\n| --- |\n| x \\| y *z* |');
// 링크 글자와 스타일(추가 검토 21)
check('링크 글자: 굵게가 든 링크', '앞 [**굵은** 링크](a.md) 뒤');
check('링크 글자: 이스케이프한 별표', '[\\*별표\\*](a.md)');
check('링크 글자: 인라인 코드가 든 링크', '[`code` 설명](a.md)');
check('표 칸: 굵게가 든 링크', '| a |\n| --- |\n| [**굵은** 링크](a.md) |');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
