// 마크다운 <-> 에디터 왕복 변환 체인. 두 함수는 정확히 역순 대칭이어야 한다.
//
// 이 파일이 존재하는 이유: 두 체인이 App.tsx 안에서 700줄 떨어져 있던 탓에
// 파싱 전처리 함수가 저장 경로에도 재적용되고 있었다. 그 결과 ```mermaid 펜스가
// ```text로, 일반 링크 [X](X.md)가 [[X]]로 조용히 바뀌었다.
// 한 파일에 나란히 두어 대칭이 깨지면 눈에 보이게 한다.
import {
  preserveMarkdownLineBreaks,
  preserveBlankLines,
  restoreBlankLines,
  protectHtml,
  restoreHtml,
  restoreLinkText,
  splitQuoteParagraphs,
  joinListItemLines,
  restoreQuoteJoins,
  parseWikilinks,
  serializeWikilinks,
  toWebviewImageUrls,
  fromWebviewImageUrls,
  processBlocksFromMarkdown,
  processBlocksToMarkdown,
  serializeKeepingListChildren,
  recordTables,
  compactTables,
  extractQuoteStructures,
  quotePlaceholderIndex,
  restoreQuoteStructures,
  dividersAsDashes,
  quoteJoinIds,
} from './markdownTransforms';
import type { WikilinkOccurrence, TableOriginal } from './markdownTransforms';

export interface PipelineContext {
  /** 문서 폴더의 webview URI — 상대경로 이미지 미리보기용 */
  docBaseUri: string;
  /** parseWikilinks가 실제로 변환한 문서명. 저장 시 그것만 되돌린다. */
  wikilinkNames: Set<string>;
  /** parseWikilinks가 채운다. [x](x.md) 모양 링크의 차례와 원문이 [[x]]였는지. 저장할 때 같은 차례의 링크만 되돌린다 */
  wikilinkOrder?: WikilinkOccurrence[];
  /** splitQuoteParagraphs가 채운다. 인용 블록마다 앞 인용에 이어지는지 차례로 */
  quoteJoins?: boolean[];
  /** recordTables가 채운다. 표마다 원문 구분 행을 차례로. 파싱 뒤 tableOriginalIds로 블록 ID에 짝짓는다 */
  tables?: TableOriginal[];
  /** extractQuoteStructures가 채운다. 구조가 든 인용의 안쪽 마크다운. 파싱 뒤 expandQuoteStructures가 자식 블록으로 단다 */
  quoteInners?: string[];
  /** expandQuoteStructures가 채운다. 구조 인용 안쪽에서 앞 인용에 이어지는 인용의 ID. quoteJoinIds의 결과와 합쳐 쓴다 */
  innerQuoteJoins?: Set<string>;
}

/** 디스크의 마크다운 -> 에디터가 파싱할 마크다운 */
export function toEditorMarkdown(markdown: string, ctx: PipelineContext): string {
  const normalized = joinListItemLines(splitQuoteParagraphs(extractQuoteStructures(markdown.replace(/\r\n/g, '\n'), ctx.quoteInners ??= []), ctx.quoteJoins ??= []));
  recordTables(normalized, ctx.tables ??= []);
  return parseWikilinks(
    preserveMarkdownLineBreaks(
      preserveBlankLines(
        protectHtml(
          toWebviewImageUrls(normalized, ctx.docBaseUri)
        )
      )
    ),
    ctx.wikilinkNames,
    ctx.wikilinkOrder ??= []
  );
}

/** 파싱한 블록에서 구조 인용의 자리표시를 인용 블록으로 바꾼다. 안쪽은 같은 체인으로 따로 파싱해 첫 문단을 인용 내용으로,
 *  나머지를 자식으로 단다(첫 블록이 문단이 아니면 모두 자식). parse는 에디터의 tryParseMarkdownToBlocks다.
 *  안쪽의 위키링크 차례는 자리표시 자리에 끼우고, 안쪽의 인용 이어짐은 ctx.innerQuoteJoins에 모은다. */
export function expandQuoteStructures(blocks: any[], ctx: PipelineContext, parse: (markdown: string) => any[]): any[] {
  const inners = ctx.quoteInners;
  if (!inners?.length) return blocks;
  const walk = (bs: any[]): any[] => bs.map(b => {
    const n = quotePlaceholderIndex(b);
    if (n === null || inners[n] === undefined) return b.children?.length ? { ...b, children: walk(b.children) } : b;
    const sub: PipelineContext = { docBaseUri: ctx.docBaseUri, wikilinkNames: ctx.wikilinkNames };
    const inner = expandQuoteStructures(processBlocksFromMarkdown(parse(toEditorMarkdown(inners[n], sub))), sub, parse);
    const at = ctx.wikilinkOrder?.findIndex(o => o.quote === n) ?? -1;
    if (at >= 0) ctx.wikilinkOrder!.splice(at, 1, ...(sub.wikilinkOrder ?? []));
    ctx.innerQuoteJoins ??= new Set();
    for (const id of [...quoteJoinIds(inner, sub.quoteJoins ?? []), ...(sub.innerQuoteJoins ?? [])]) ctx.innerQuoteJoins.add(id);
    const [first, ...rest] = inner;
    const lead = first?.type === 'paragraph' && !first.children?.length;
    return { id: b.id, type: 'quote', props: { backgroundColor: 'default', textColor: 'default' }, content: lead ? first.content : [], children: lead ? rest : inner };
  });
  return walk(blocks);
}

/** 디스크의 마크다운을 에디터 블록으로 연다. 앱과 테스트가 같은 경로를 쓴다 */
export function markdownToBlocks(markdown: string, ctx: PipelineContext, parse: (markdown: string) => any[]): any[] {
  return expandQuoteStructures(processBlocksFromMarkdown(parse(toEditorMarkdown(markdown, ctx))), ctx, parse);
}

/** 에디터가 내놓은 마크다운 -> 디스크에 쓸 마크다운 (위 체인의 역순) */
export function fromEditorMarkdown(markdown: string, ctx: PipelineContext): string {
  return serializeWikilinks(
    restoreLinkText(restoreHtml(
      restoreBlankLines(
        fromWebviewImageUrls(restoreQuoteJoins(markdown), ctx.docBaseUri)
      )
    )),
    ctx.wikilinkNames,
    ctx.wikilinkOrder
  );
}

/** 평문 이스케이프 판정기(setLiteralVerifier에 넘긴다): 마크다운 한 문단을 앱과 같은 체인으로 다시 열어
 *  스타일 없는 평문 문단이면 그 글자를, 아니면 null을 돌려준다. parse는 에디터의 tryParseMarkdownToBlocks다. */
export function makeLiteralVerifier(parse: (markdown: string) => any[]) {
  return (markdown: string): string | null => {
    const blocks = processBlocksFromMarkdown(parse(toEditorMarkdown(markdown, { docBaseUri: '', wikilinkNames: new Set() })));
    if (blocks.length !== 1 || blocks[0].type !== 'paragraph') return null;
    const content: any[] = blocks[0].content ?? [];
    if (content.some(c => c.type !== 'text' || Object.keys(c.styles ?? {}).length)) return null;
    return content.map(c => c.text).join('');
  };
}

/** 블록을 마크다운으로 직렬화한다(정규화 전). 앱의 저장, 안전장치, 복사와 테스트가 같은 경로를 쓴다.
 *  toMarkdown은 에디터의 blocksToMarkdownLossy다. 목록 항목 안의 목록 아닌 자식은 들여 써서 항목 안에 남긴다.
 *  표는 칸을 채우지 않고 쓰며, tables(블록 ID별 원문 표)가 있으면 바뀌지 않은 행과 구분 행을 원문대로 쓴다. */
export function blocksToMarkdown(blocks: any[], toMarkdown: (blocks: any[]) => string, quoteJoins?: Set<string>, tables?: Map<string, TableOriginal>): string {
  return compactTables(restoreQuoteStructures(dividersAsDashes(serializeKeepingListChildren(processBlocksToMarkdown(blocks, quoteJoins), toMarkdown))), blocks, tables);
}
