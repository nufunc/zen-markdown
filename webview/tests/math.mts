// 수식의 백슬래시와 중괄호가 저장 뒤에도 원문 그대로인지 본다(추가 검토 27).
// 사례는 String.raw로 쓴다(백슬래시가 JS 이스케이프로 빠지지 않게).
// 실행: npx tsx tests/math.mts   (npm test에 들어 있다)
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

const open = (md: string) => {
  const ctx: any = { docBaseUri: '', wikilinkNames: new Set<string>(), quoteJoins: [] as boolean[] };
  return { ctx, blocks: markdownToBlocks(md, ctx, m => editor.tryParseMarkdownToBlocks(m)) };
};
const save = (blocks: any[], ctx: any) => {
  const joins = new Set([...T.quoteJoinIds(blocks, ctx.quoteJoins), ...(ctx.innerQuoteJoins ?? [])]);
  let m = blocksToMarkdown(blocks, bs => editor.blocksToMarkdownLossy(bs), joins, T.tableOriginalIds(blocks, ctx.tables ?? []));
  m = T.preserveMarkdownLineBreaks(T.normalizeUnorderedListBullets(T.normalizeOrderedListNumbers(m)));
  return fromEditorMarkdown(m, ctx).replace(/\n+$/, '');
};
const texts = (bs: any[]): string => bs.map((b: any) => b.type + ':' + (Array.isArray(b.content) ? b.content.map((c: any) => c.text ?? '').join('') : '') + (b.children?.length ? '[' + texts(b.children) + ']' : '')).join(' | ');

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail: string) => {
  if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + '\n  ' + detail); }
};
/** 편집 없이 저장하면 원문 그대로이고, 다시 열어도 같은 모델이다 */
const same = (name: string, md: string, model?: string) => {
  const { ctx, blocks } = open(md);
  const s1 = save(blocks, ctx);
  const o2 = open(s1);
  const m = texts(blocks);
  ok(name, s1 === md && texts(o2.blocks) === m && (model === undefined || m === model), JSON.stringify({ saved: s1, model: m }));
};

same('블록 수식', String.raw`앞

$$
\int_0^1 x\,dx
$$

뒤`, String.raw`paragraph:앞 | codeBlock:\int_0^1 x\,dx | paragraph:뒤`);
same('여러 줄 블록 수식', String.raw`$$
a \\
b_{1}
$$`);
same('인라인 수식의 이스케이프한 밑줄', String.raw`수식 $a\_b$ 끝`, String.raw`paragraph:수식 $a\_b$ 끝`);
same('인라인 수식의 이스케이프한 중괄호', String.raw`수식 $\{x\}$ 끝`, String.raw`paragraph:수식 $\{x\}$ 끝`);
same('인라인 수식의 명령', String.raw`$\alpha + \beta$`);
same('한 글자 수식', String.raw`변수 $x$ 와 $y$`);
same('별표와 밑줄이 든 수식은 강조가 아니다', String.raw`$a*b*c$ 와 $_x_$`, String.raw`paragraph:$a*b*c$ 와 $_x_$`);
same('한 줄 $$ 수식', String.raw`식 $$x^2 + y^2$$ 끝`);
same('돈 표기는 수식이 아니다', String.raw`가격은 $5 and $10 이다`);
{
  // \$는 여는 $가 아니다. BlockNote가 \$의 \를 글자로 남기고 저장 때 \\$로 쓰는 것은 이번 변경 전부터의 표기 차이다(다시 열면 같은 글자)
  const md = String.raw`\$not math$ 이다`;
  const { ctx, blocks } = open(md);
  const s1 = save(blocks, ctx);
  ok('이스케이프한 $는 수식이 아니다', texts(blocks) === String.raw`paragraph:\$not math$ 이다` && texts(open(s1).blocks) === texts(blocks), JSON.stringify({ saved: s1, model: texts(blocks) }));
}
same('목록 안 수식', String.raw`- 항목 $a\_b$
- 둘째`);
same('인용 안 수식', String.raw`> 인용 $\{x\}$ 끝`);
same('math 펜스는 그대로', String.raw`$$ 없이

` + '```math\n' + String.raw`\frac{1}{2}` + '\n```');
{
  // 같은 문단의 다른 곳을 고쳐도 수식은 원문 그대로다(평문 이스케이프가 수식을 건너뛴다)
  const md = String.raw`질량 $a\_b + \{x\}$ 끝`;
  const { ctx, blocks } = open(md);
  const edited = JSON.parse(JSON.stringify(blocks));
  edited[0].content = edited[0].content.map((c: any) => ({ ...c, text: c.text.replace('끝', '끝*별*') }));
  const s = save(edited, ctx);
  ok('다른 곳을 고쳐도 수식은 그대로, 수식 밖은 이스케이프', s === String.raw`질량 $a\_b + \{x\}$ 끝\*별\*`, JSON.stringify(s));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
