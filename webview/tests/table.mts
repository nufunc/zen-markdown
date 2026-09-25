// 표 셀 하나를 고치면 그 행만 바뀌고 정렬이 남는지 본다(추가 검토 16).
// 실행: npx tsx tests/table.mts   (npm test에 들어 있다)
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { pretendToBeVisual: true });
for (const key of ['window','document','navigator','HTMLElement','Element','Node','DOMParser','MutationObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) {
  try { Object.defineProperty(globalThis, key, { value: (dom.window as any)[key] ?? (globalThis as any)[key], configurable: true, writable: true }); } catch {}
}
const { BlockNoteEditor } = await import('@blocknote/core');
const T = await import('../src/markdownTransforms.ts');
const { fromEditorMarkdown, makeLiteralVerifier, blocksToMarkdown, markdownToBlocks } = await import('../src/markdownPipeline.ts');
const { mergeLines } = await import('../src/lineMerge.ts');
const editor = BlockNoteEditor.create() as any;
T.setLiteralVerifier(makeLiteralVerifier(md => editor.tryParseMarkdownToBlocks(md)));

// 앱과 같은 여는 경로와 저장 경로. 병합(2단계)은 거치지 않는다. 원문 표는 앱처럼 연 시점에 블록 ID와 짝짓는다
const open = (md: string) => {
  const ctx: any = { docBaseUri: '', wikilinkNames: new Set<string>(), quoteJoins: [] as boolean[] };
  const blocks = markdownToBlocks(md, ctx, m => editor.tryParseMarkdownToBlocks(m));
  ctx.tableIds = T.tableOriginalIds(blocks, ctx.tables);
  return { ctx, blocks };
};
const save = (blocks: any[], ctx: any) => {
  let m = blocksToMarkdown(blocks, bs => editor.blocksToMarkdownLossy(bs), T.quoteJoinIds(blocks, ctx.quoteJoins), ctx.tableIds);
  m = T.preserveMarkdownLineBreaks(T.normalizeUnorderedListBullets(T.normalizeOrderedListNumbers(m)));
  return fromEditorMarkdown(m, ctx).replace(/\n+$/, '');
};
/** 표 모델의 요약: 행마다 칸 글자 */
const cellsOf = (blocks: any[]) => blocks.filter((b: any) => b.type === 'table').map((b: any) =>
  b.content.rows.map((r: any) => r.cells.map((c: any) => (c.content ?? []).map((t: any) => (t.styles?.code ? '`' : '') + t.text).join(''))));
const clone = (x: any) => JSON.parse(JSON.stringify(x));
const cell = (text: string) => ({ type: 'tableCell', content: text ? [{ type: 'text', text, styles: {} }] : [], props: { colspan: 1, rowspan: 1, backgroundColor: 'default', textColor: 'default', textAlignment: 'left' } });
const table = (blocks: any[]) => blocks.find((b: any) => b.type === 'table');

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail: string) => {
  if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + '\n  ' + detail); }
};
/** 저장 결과를 다시 열면 같은 표 모델인가 */
const reopensSame = (blocks: any[], saved: string) => JSON.stringify(cellsOf(open(saved).blocks)) === JSON.stringify(cellsOf(blocks));

// 최소 재현: 1을 1x로 고치면 그 행만 바뀌고 정렬이 남는다
{
  const md = '| a | b |\n|:-:|--:|\n| 1 | 2 |';
  const { ctx, blocks } = open(md);
  ok('편집 없이 저장하면 원문 그대로', save(blocks, ctx) === md, JSON.stringify(save(blocks, ctx)));
  const b = clone(blocks);
  table(b).content.rows[1].cells[0].content[0].text = '1x';
  const saved = save(b, ctx);
  ok('칸 하나를 고치면 그 행만 바뀐다', saved === '| a | b |\n|:-:|--:|\n| 1x | 2 |', JSON.stringify(saved));
  const merged = mergeLines(md, save(blocks, ctx), saved);
  ok('병합해도 같은 결과', merged?.text === saved && merged?.conflicts === 0, JSON.stringify(merged));
}

// 폭을 맞춘 표: 편집하지 않은 행은 원문 그대로 남는다
{
  const md = '| 이름       | 설명            |\n| ---------- | --------------- |\n| 하나       | 첫째            |\n| 둘         | 둘째            |';
  const { ctx, blocks } = open(md);
  ok('폭을 맞춘 표를 편집 없이 저장하면 원문 그대로', save(blocks, ctx) === md, JSON.stringify(save(blocks, ctx)));
  const b = clone(blocks);
  table(b).content.rows[2].cells[1].content[0].text = '둘째 고침';
  const saved = save(b, ctx);
  const lines = saved.split('\n');
  ok('폭을 맞춘 표에서 고친 행만 좁은 모양', lines[3] === '| 둘 | 둘째 고침 |' && lines.slice(0, 3).join('\n') === md.split('\n').slice(0, 3).join('\n'), JSON.stringify(saved));
  ok('폭을 맞춘 표를 다시 열면 같은 모델', reopensSame(b, saved), JSON.stringify(cellsOf(open(saved).blocks)));
}

// 열을 더하고 빼면 정렬을 앞에서부터 옮긴다
{
  const md = '| a | b |\n|:-:|--:|\n| 1 | 2 |';
  const o = open(md);
  const add = clone(o.blocks);
  for (const [i, r] of table(add).content.rows.entries()) r.cells.push(cell(i === 0 ? 'c' : '3'));
  table(add).content.columnWidths.push(null);
  const added = save(add, o.ctx);
  ok('열을 더하면 새 열은 ---', added.split('\n')[1] === '| :-: | --: | --- |', JSON.stringify(added));
  ok('열을 더한 표를 다시 열면 같은 모델', reopensSame(add, added), JSON.stringify(cellsOf(open(added).blocks)));
  const p = open(md);
  const del = clone(p.blocks);
  for (const r of table(del).content.rows) r.cells.pop();
  table(del).content.columnWidths.pop();
  const deleted = save(del, p.ctx);
  ok('열을 빼면 앞 열의 정렬이 남는다', deleted.split('\n')[1] === '| :-: |', JSON.stringify(deleted));
  ok('열을 뺀 표를 다시 열면 같은 모델', reopensSame(del, deleted), JSON.stringify(cellsOf(open(deleted).blocks)));
}
// 추가 검토 30: 빈 열을 더하면(표의 열 추가 단추) 모든 행이 새 열 수만큼 칸을 갖는다. 원문 행으로 되돌리면 칸이 모자라 GFM 표가 아니다
{
  const md = '| A | B |\n| --- | --- |\n| 1 | 2 |';
  const o = open(md);
  const add = clone(o.blocks);
  for (const r of table(add).content.rows) r.cells.push(cell(''));
  table(add).content.columnWidths.push(null);
  const saved = save(add, o.ctx);
  const counts = saved.split('\n').map(l => l.replace(/^\||\|$/g, '').split('|').length);
  ok('빈 열을 더하면 모든 행이 3칸', counts.length === 3 && counts.every(c => c === 3), JSON.stringify(saved));
}

// 셀 안의 \| 와 인라인 코드
{
  const md = '| a \\| b | `code` |\n| --- | :-- |\n| x_y | **굵게** |';
  const { ctx, blocks } = open(md);
  ok('셀 안의 \\|와 코드: 편집 없이 원문 그대로', save(blocks, ctx) === md, JSON.stringify(save(blocks, ctx)));
  const b = clone(blocks);
  table(b).content.rows[1].cells[0].content[0].text = 'x_y z';
  const saved = save(b, ctx);
  ok('셀 안의 \\|와 코드: 머리 행은 그대로', saved.split('\n')[0] === md.split('\n')[0] && saved.split('\n')[1] === '| --- | :-- |', JSON.stringify(saved));
  ok('셀 안의 \\|와 코드: 다시 열면 같은 모델', reopensSame(b, saved), JSON.stringify(cellsOf(open(saved).blocks)));
}

// 머리 행만 있는 표
{
  const md = '| h1 | h2 |\n| -- | :-: |';
  const { ctx, blocks } = open(md);
  ok('머리 행만 있는 표: 편집 없이 원문 그대로', save(blocks, ctx) === md, JSON.stringify(save(blocks, ctx)));
  const b = clone(blocks);
  table(b).content.rows[0].cells[0].content[0].text = 'h1x';
  const saved = save(b, ctx);
  ok('머리 행만 있는 표: 고쳐도 구분 행은 원문', saved === '| h1x | h2 |\n| -- | :-: |', JSON.stringify(saved));
}

// 표가 여럿이고 코드 펜스 안에 표 모양이 있어도 차례가 어긋나지 않는다
{
  const md = '```md\n| x | y |\n|:-:|:-:|\n```\n\n| a |\n|--:|\n| 1 |\n\n| b | c |\n|:--|--:|\n| 2 | 3 |';
  const { ctx, blocks } = open(md);
  ok('표 여럿과 펜스: 편집 없이 원문 그대로', save(blocks, ctx) === md, JSON.stringify(save(blocks, ctx)));
}

// 추가 검토 30: 칸 안 줄바꿈은 <br>로 저장하고 열 때 줄바꿈으로 읽는다
{
  const md = '| a | b |\n| --- | --- |\n| 1<br>2 | 3 |';
  const o = open(md);
  ok('칸 안 <br>은 줄바꿈으로 읽는다', table(o.blocks).content.rows[1].cells[0].content.map((c: any) => c.text).join('') === '1\n2', JSON.stringify(cellsOf(o.blocks)));
  ok('칸 안 <br>이 든 표는 원문 그대로 저장', save(o.blocks, o.ctx) === md, JSON.stringify(save(o.blocks, o.ctx)));
  const e = clone(o.blocks);
  table(e).content.rows[1].cells[1].content[0].text = '3 고침';
  ok('칸 안 줄바꿈이 든 행을 고쳐도 한 줄', save(e, o.ctx) === '| a | b |\n| --- | --- |\n| 1<br>2 | 3 고침 |', JSON.stringify(save(e, o.ctx)));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
