// CommonMark와 GFM 명세 예제를 앱의 변환 체인으로 왕복시켜, 뜻이 바뀌는 예제 수가 늘지 않는지 본다.
// 실행: npx tsx tests/spec-roundtrip.mts   (npm test에 들어 있다)
//
// 원문과 저장 결과를 같은 기준 렌더러로 HTML로 만들어 견준다. HTML이 다르면 "뜻이 바뀜"이다.
// 앱은 줄바꿈을 일부러 강제 줄바꿈으로 바꾸므로 <br />과 줄바꿈은 같게 본다.
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { pretendToBeVisual: true });
for (const key of ['window','document','navigator','HTMLElement','Element','Node','DOMParser','MutationObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) {
  try { Object.defineProperty(globalThis, key, { value: (dom.window as any)[key] ?? (globalThis as any)[key], configurable: true, writable: true }); } catch {}
}
const require = createRequire(import.meta.url);
const commonmark = require('commonmark');
const MarkdownIt = require('markdown-it');
const spec = require('commonmark-spec');
const { BlockNoteEditor } = await import('@blocknote/core');
const T = await import('../src/markdownTransforms.ts');
const { toEditorMarkdown, fromEditorMarkdown, makeLiteralVerifier } = await import('../src/markdownPipeline.ts');

/** 뜻이 바뀌는 예제 수의 상한. 고칠 때마다 낮춘다. 2026-09-24 측정 302에서 꺾쇠 링크 수정 뒤 299, 여러 문단 인용 보존 뒤 298, 평문 이스케이프 뒤 293 */
const BASELINE = 293;

const editor = BlockNoteEditor.create() as any;
T.setLiteralVerifier(makeLiteralVerifier(md => editor.tryParseMarkdownToBlocks(md)));

// 앱의 여는 경로와 저장 경로와 같은 체인
const roundtrip = async (md: string) => {
  const ctx = { docBaseUri: '', wikilinkNames: new Set<string>(), quoteJoins: [] as boolean[] };
  const blocks = T.processBlocksFromMarkdown(await editor.tryParseMarkdownToBlocks(toEditorMarkdown(md, ctx)));
  let out = await editor.blocksToMarkdownLossy(T.processBlocksToMarkdown(blocks, T.quoteJoinIds(blocks, ctx.quoteJoins)));
  out = T.preserveMarkdownLineBreaks(T.normalizeUnorderedListBullets(T.normalizeOrderedListNumbers(out)));
  return fromEditorMarkdown(out, ctx);
};

const cmParser = new commonmark.Parser();
const cmRenderer = new commonmark.HtmlRenderer();
const mdit = new MarkdownIt({ html: true, linkify: true });
const norm = (h: string) => h.replace(/<br \/>\n?/g, ' ').replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
const renderCm = (m: string) => norm(cmRenderer.render(cmParser.parse(m)));
const renderGfm = (m: string) => norm(mdit.render(m));

const gfm = JSON.parse(fs.readFileSync(new URL('./fixtures/gfm-extensions.json', import.meta.url), 'utf8'));
const cases = [
  ...spec.tests.map((t: any) => ({ markdown: t.markdown.replace(/→/g, '\t'), render: renderCm })),
  ...gfm.map((t: any) => ({ markdown: t.markdown, render: renderGfm })),
];

let same = 0, notation = 0, meaning = 0, failed = 0;
for (const c of cases) {
  try {
    const out = await roundtrip(c.markdown);
    if (out.replace(/\n+$/, '') === c.markdown.replace(/\n+$/, '')) same++;
    else if (c.render(c.markdown) === c.render(out)) notation++;
    else meaning++;
  } catch { failed++; }
}
console.log(`spec examples ${cases.length}: same ${same}, notation ${notation}, meaning ${meaning}, failed ${failed} (baseline ${BASELINE})`);

// 계획서 추가 검토 6의 사례. fixed가 true인 것은 원문의 뜻이 보존돼야 한다. 나머지는 상태만 보여 준다.
const named: { name: string; md: string; fixed: boolean }[] = [
  { name: '꺾쇠로 감싼 링크 주소', md: '[a](<my file.md>)\n', fixed: true },
  { name: '백슬래시 이스케이프', md: '\\*not emphasized*\n', fixed: false },
  { name: '목록 항목의 둘째 문단', md: '- foo\n\n  bar\n', fixed: false },
  { name: '들여쓴 코드 블록', md: '    a simple\n      indented code block\n', fixed: false },
  { name: '표 정렬', md: '| a | b |\n| :-: | --: |\n| 1 | 2 |\n', fixed: false },
  { name: '링크 제목', md: '[link](/uri "title")\n', fixed: false },
  { name: '인용 안의 헤딩', md: '> # Foo\n> bar\n', fixed: false },
  { name: '숫자와 점으로 시작하는 둘째 줄', md: 'The number of windows in my house is\n14.  The number of doors is 6.\n', fixed: false },
  { name: '텍스트가 빈 링크', md: '[](./target.md)\n', fixed: false },
];
let namedFail = 0;
for (const n of named) {
  const out = await roundtrip(n.md);
  const render = n.name === '표 정렬' ? renderGfm : renderCm;
  const ok = render(n.md) === render(out);
  if (n.fixed && !ok) namedFail++;
  console.log(`${ok ? 'KEEP' : n.fixed ? 'FAIL' : 'LOSS'} ${n.name}: ${JSON.stringify(out.replace(/\n+$/, ''))}`);
}

const fail = failed > 0 || meaning > BASELINE || namedFail > 0;
console.log(`\n${fail ? 'FAIL' : 'PASS'} spec roundtrip`);
process.exit(fail ? 1 : 0);
