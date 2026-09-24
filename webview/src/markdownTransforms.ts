// 마크다운 <-> BlockNote 왕복 변환에 쓰이는 순수 함수 모음.
// 컴포넌트 상태에 의존하지 않으므로 독립적으로 테스트 가능하다.

export const NBSP = '\xA0';
// 빈 줄 보존용 표식. 사용자가 직접 쓴 &nbsp; 문단과 구별하기 위해 폭 없는 공백을 덧붙인다.
// 이것이 없으면 원문의 리터럴 &nbsp; 문단이 저장할 때 빈 줄로 지워진다.
const BLANK_ZWSP = '\u200B';
export const BLANK_MARKER = '&nbsp;' + BLANK_ZWSP;
const BLANK_MARKER_OUT = NBSP + BLANK_ZWSP;

export const isMermaidCode = (text: string): boolean => {
  const lines = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('%%'));

  if (lines.length === 0) return false;
  const firstRealLine = lines[0];

  const mermaidPatterns = [
    /^(graph|flowchart)(\s+(TB|TD|BT|RL|LR))?\b/i,
    /^sequenceDiagram\b/i,
    /^classDiagram\b/i,
    /^stateDiagram(-v2)?\b/i,
    /^erDiagram\b/i,
    /^gantt\b/i,
    /^pie\b/i,
    /^journey\b/i,
    /^gitGraph\b/i,
    /^c4Diagram\b/i,
    /^mindmap\b/i,
    /^timeline\b/i,
    /^zenuml\b/i,
    /^sankey-beta\b/i,
    /^sankey\b/i,
    /^quadrantChart\b/i,
    /^xychart-beta\b/i,
    /^packet-beta\b/i,
    /^kanban\b/i,
    /^architecture\b/i,
  ];

  return mermaidPatterns.some(pattern => pattern.test(firstRealLine));
};

// 파서는 줄바꿈(<br>) 뒤에 공백 하나를 끼워 넣는다. 그대로 두면 저장할 때 백슬래시 줄바꿈 뒤에 공백이 붙고
// 인용 안에서는 왕복할 때마다 공백이 는다. 연속 줄의 앞 공백은 마크다운에서 뜻이 없으므로 걷어낸다.
// 줄바꿈이 한 조각의 끝이면 그 공백은 다음 조각의 앞에 붙는다(**TL;DR**\n**결론** → [TL;DR\n][ ][결론]).
const stripBreakSpace = (content: any[]): any[] => {
  const out: any[] = [];
  let afterBreak = false;
  for (const c of content) {
    if (c.type === 'text' && typeof c.text === 'string' && !c.styles?.code) {
      let text = c.text.replace(/\n /g, '\n');
      if (afterBreak && text.startsWith(' ')) text = text.slice(1);
      afterBreak = text.endsWith('\n');
      if (text) out.push({ ...c, text });
      continue;
    }
    afterBreak = false;
    out.push(c.type === 'link' && Array.isArray(c.content) ? { ...c, content: stripBreakSpace(c.content) } : c);
  }
  return out;
};

// 텍스트와 주소가 같은 링크를 BlockNote는 주소만 내보내 링크가 사라진다([a.md](a.md) → a.md).
// 직렬화 동안만 텍스트 끝에 표식을 붙여 [..](..) 형태를 강제하고, restoreLinkText가 지운다.
const LINK_TEXT_MARK = '\u200B';
const markSameTextLinks = (content: any[]): any[] => content.map((c: any) => {
  if (c.type !== 'link' || !Array.isArray(c.content) || c.content.length === 0) return c;
  const text = c.content.map((t: any) => t.text ?? '').join('');
  if (text !== c.href) return c;
  const last = c.content[c.content.length - 1];
  return { ...c, content: [...c.content.slice(0, -1), { ...last, text: last.text + LINK_TEXT_MARK }] };
});

// 강조 구분자(**, *, ~~) 바로 안쪽에 공백이 오면 CommonMark는 강조를 열거나 닫지 않는다.
// BlockNote는 강조 조각 끝의 공백은 구분자 밖으로 옮기지만, 인라인 코드 뒤에 이어지는 조각의 앞 공백은 옮기지 않는다
// (**a `b` c** → **a** `b`** c**). 직렬화하는 동안만 강조 조각 앞뒤 공백을 강조 없는 조각으로 떼어 낸다.
const EDGE_STYLES = ['bold', 'italic', 'strike'];
const splitEmphasisEdgeSpaces = (content: any[]): any[] => content.flatMap((c: any) => {
  if (c.type === 'link' && Array.isArray(c.content)) return [{ ...c, content: splitEmphasisEdgeSpaces(c.content) }];
  if (c.type !== 'text' || typeof c.text !== 'string' || c.styles?.code) return [c];
  if (!EDGE_STYLES.some(k => c.styles?.[k])) return [c];
  // 떼어 낸 공백에는 강조만 빼고 글자색 같은 나머지 스타일을 남긴다
  const plain = Object.fromEntries(Object.entries(c.styles).filter(([k]) => !EDGE_STYLES.includes(k)));
  // 강조가 줄바꿈을 가로지르면 구분자 안에 강제 줄바꿈이 들어가 다시 열 때 강조가 깨진다. 줄마다 강조를 닫고 연다.
  return c.text.split(/(\n)/).flatMap((piece: string) => {
    const m = piece.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
    if (!m[2]) return piece ? [{ ...c, text: piece, styles: plain }] : [];
    return [
      ...(m[1] ? [{ ...c, text: m[1], styles: plain }] : []),
      { ...c, text: m[2] },
      ...(m[3] ? [{ ...c, text: m[3], styles: plain }] : []),
    ];
  });
});

// 평문에 든 마크다운 기호는 BlockNote가 그대로 내보내, 다시 열면 링크, 목록, 헤딩, 강조가 된다.
// 직렬화하는 동안만 코드가 아닌 텍스트 조각에 백슬래시 이스케이프를 넣는다. 파서는 이스케이프를 풀어 같은 평문으로 읽는다.
//
// 어떤 기호가 서식이 되는지는 규칙으로 다 적을 수 없다(짝이 맞지 않는 **a*, 줄바꿈 뒤의 목록 기호 등).
// 그래서 세 단계를 차례로 만들어, 다시 열었을 때 같은 평문이 되는 첫 단계를 쓴다. 판정은 주입한 파서(setLiteralVerifier)가 한다.
//   최소: 백슬래시만 겹친다. 참조 링크, 자동 링크, 엔티티처럼 BlockNote가 평문으로 두는 문법은 여기서 통과해 원문 그대로 남는다.
//   중간: 줄 머리 기호(# > - + 1. 수평선 펜스, 둘째 줄부터 setext 밑줄)를 더한다.
//   전체: 인라인 기호(* _ ` ~ [ ])를 더한다.
// 파서가 없으면(주입 전) 전체 단계를 쓴다.
const escapeBackslashes = (t: string) => t.replace(/\\(?=[!-/:-@[-`{-~]|\n|$)/g, '\\\\');
const escapeInlineAll = (t: string) => escapeBackslashes(t)
  .replace(/[*`[\]~]/g, '\\$&')
  // 단어 안의 _(a_b_c)는 강조가 되지 않으므로 단어 경계의 것만
  .replace(/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, '\\_');
/** protectHtml이 보호한 HTML 태그(<\u200B...>)는 원문 HTML이므로 그 구간 밖에만 적용한다 */
const outsideProtectedHtml = (t: string, fn: (s: string) => string) =>
  t.split(/(<\u200B[^>]*>)/).map((part, i) => (i % 2 ? part : fn(part))).join('');

const escapeLineStart = (line: string) => line
  .replace(/^( {0,3})(#{1,6})(?=[ \t]|$)/, '$1\\$2')
  .replace(/^( {0,3})>/, '$1\\>')
  .replace(/^( {0,3})([-+])(?=[ \t]|$)/, '$1\\$2')
  .replace(/^( {0,3})(\d{1,9})([.)])(?=[ \t]|$)/, '$1$2\\$3')
  // 수평선(---, ***, ___)과 코드 펜스
  .replace(/^( {0,3})([-*_])(?=(?:[ \t]*\2){2,}[ \t]*$)/, '$1\\$2')
  .replace(/^( {0,3})(`{3,}|~{3,})/, '$1\\$2');
/** setext 헤딩 밑줄(---)은 앞 줄이 있을 때만 뜻이 있으므로 둘째 줄부터 본다. BlockNote 파서는 \=를 풀지 않아 ===는 이스케이프할 수 없다 */
const escapeSetextUnderline = (line: string) => line.replace(/^( {0,3})-(?=-*[ \t]*$)/, '$1\\-');
const escapeLineStarts = (t: string, atLineStart: boolean) => t.split('\n')
  .map((l, i) => (i > 0 ? escapeSetextUnderline(escapeLineStart(l)) : atLineStart ? escapeLineStart(l) : l)).join('\n');

/** 마크다운 한 문단을 다시 열어 스타일 없는 평문이면 그 글자를, 아니면 null을 돌려주는 함수 */
let literalVerifier: ((markdown: string) => string | null) | null = null;
export function setLiteralVerifier(fn: ((markdown: string) => string | null) | null) {
  literalVerifier = fn;
  literalCache.clear();
}
const literalCache = new Map<string, string>();

const escapeLiteralText = (text: string, atLineStart: boolean, atBlockEnd = true): string => {
  // 서식이 될 수 있는 기호가 없으면 판정하지 않는다. 줄 머리 기호는 줄 머리에 있을 때만 본다(문장 끝 마침표로 판정기를 부르지 않게)
  if (!/[\\*_`~[\]]|(?:^|\n) {0,3}(?:#|>|[-+](?:\s|$)|\d{1,9}[.)]|[-=]{2,})/.test(text)) return text;
  const key = (atLineStart ? '1' : '0') + (atBlockEnd ? '1' : '0') + text;
  const cached = literalCache.get(key);
  if (cached !== undefined) return cached;
  const minimal = outsideProtectedHtml(text, escapeBackslashes);
  const middle = escapeLineStarts(minimal, atLineStart);
  const full = escapeLineStarts(outsideProtectedHtml(text, escapeInlineAll), atLineStart);
  // 블록 중간의 조각은 앞에 글자가 있는 채로 판정한다. 그래야 첫 줄을 블록 머리로 잘못 보지 않는다
  const lead = atLineStart ? '' : 'x';
  // 블록 끝이 아닌 조각은 뒤에도 글자를 붙여 판정한다. 떼어 놓으면 끝 공백이 잘려 나가 판정이 틀린다
  const tail = atBlockEnd ? '' : 'x';
  // BlockNote는 HTML을 거쳐 파싱하므로 연속 공백을 한 칸으로 접는다. 이스케이프와 무관한 차이라 같게 본다
  const squeeze = (t: string | null) => t?.replace(/ {2,}/g, ' ');
  const reopensSame = (escaped: string) => squeeze(literalVerifier!(lead + escaped.replace(/\n/g, '\\\n') + tail)) === squeeze(lead + text + tail);
  const result = !literalVerifier ? full
    : reopensSame(minimal) ? minimal
    : reopensSame(middle) ? middle
    : full;
  if (literalCache.size > 5000) literalCache.clear();
  literalCache.set(key, result);
  return result;
};

/** blockStart: 블록 첫머리를 줄 머리로 볼지. 목록 항목과 헤딩의 첫머리는 이미 그 블록의 표식 뒤라 문단만 해당한다. */
const escapeLiteralMarkdown = (content: any[], blockStart = false): any[] => {
  let atLineStart = blockStart;
  return content.map((c: any, i: number) => {
    if (c.type !== 'text' || typeof c.text !== 'string') {
      atLineStart = false;
      return c.type === 'link' && Array.isArray(c.content) ? { ...c, content: escapeLiteralMarkdown(c.content) } : c;
    }
    if (c.styles?.code) {
      atLineStart = c.text.endsWith('\n');
      return c;
    }
    const text = escapeLiteralText(c.text, atLineStart, i === content.length - 1);
    atLineStart = c.text.endsWith('\n');
    return { ...c, text };
  });
};

// BlockNote 인용 블록은 인라인 텍스트 한 덩어리만 담아 `> A\n>\n> B`의 두 문단을 한 문단으로 합친다.
// 파싱 전에 인용 문단마다 인용 블록 하나로 나누고(`> A\n\n> B`), 각 인용이 앞 인용에 이어지는지 차례로 적어 둔다.
// 저장할 때는 이어진 인용 사이에만 `>` 빈 줄을 넣어 다시 합친다. 원래부터 떨어진 인용 둘은 합치지 않는다.
// 인용 안의 헤딩은 BlockNote가 다음 줄과 한 단어로 붙이므로(`Htext`) 헤딩 줄도 문단 경계로 본다.
const QUOTE_JOIN_MARK = '\u2063';
const QUOTE_LINE = /^ {0,3}>/;
const QUOTE_NESTED = /^ {0,3}>\s*>/;
const QUOTE_EMPTY = /^ {0,3}>\s*$/;
const QUOTE_HEADING = /^ {0,3}>\s*#{1,6}\s/;

export function splitQuoteParagraphs(md: string, joins: boolean[]): string {
  return mapOutsideCodeFences(md, part => {
    const lines = part.split('\n');
    const out: string[] = [];
    let inQuote = false;
    let prevHeading = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!QUOTE_LINE.test(line)) {
        inQuote = false;
        out.push(line);
        continue;
      }
      const next = lines[i + 1];
      const nextIsContent = next !== undefined && QUOTE_LINE.test(next) && !QUOTE_EMPTY.test(next) && !QUOTE_NESTED.test(next);
      if (!inQuote) {
        inQuote = true;
        joins.push(false);
      } else if (QUOTE_EMPTY.test(line) && nextIsContent) {
        // 인용 안의 문단 구분: 빈 줄로 바꿔 다음 문단을 새 인용으로 만든다
        out.push('');
        joins.push(true);
        prevHeading = false;
        continue;
      } else if (!QUOTE_NESTED.test(line) && !QUOTE_EMPTY.test(line) && (QUOTE_HEADING.test(line) || prevHeading)) {
        out.push('');
        joins.push(true);
      }
      prevHeading = QUOTE_HEADING.test(line);
      out.push(line);
    }
    return out.join('\n');
  });
}

/** 파싱한 블록에서 앞 인용에 이어지는 인용의 ID를 모은다. 인용 수가 기록과 다르면 짝을 믿을 수 없으므로 비운다. */
export function quoteJoinIds(blocks: any[], joins: boolean[]): Set<string> {
  const quotes: any[] = [];
  const walk = (bs: any[]) => bs.forEach(b => { if (b.type === 'quote') quotes.push(b); walk(b.children ?? []); });
  walk(blocks);
  if (quotes.length !== joins.length) return new Set();
  return new Set(quotes.filter((_, i) => joins[i]).map(q => q.id));
}

/** 직렬화 결과에서 표식이 붙은 인용을 앞 인용과 `>` 빈 줄로 합친다 */
export function restoreQuoteJoins(md: string): string {
  return md.replace(new RegExp('\\n\\n((?: {0,3}>)+ ?)' + QUOTE_JOIN_MARK, 'g'), (_m, prefix: string) => `\n${prefix.trimEnd()}\n${prefix}`)
    .replaceAll(QUOTE_JOIN_MARK, '');
}

export function restoreLinkText(md: string): string {
  return mapOutsideCodeFences(md.replaceAll(LINK_TEXT_MARK + '](', ']('), part =>
    // BlockNote는 공백이 든 주소를 꺾쇠 없이 내보내 링크가 깨진다([a](<my file.md>) → [a](my file.md)).
    // 링크 제목은 직렬화에서 버려지므로, 괄호 안에 공백이 있으면 원래 꺾쇠로 감싼 주소다. 인라인 코드 구간은 건너뛴다.
    part.replace(/(`+)[^`\n][\s\S]*?\1|(?<!\\)\]\(([^()<>\n]*[ \t][^()<>\n]*)\)/g,
      (m, ticks: string | undefined, dest: string | undefined) => ticks ? m : `](<${dest}>)`)
  );
}

export const processBlocksFromMarkdown = (blocks: any[]): any[] => {
  return blocks.map((b: any) => {
    if (b.type !== "codeBlock" && Array.isArray(b.content)) {
      b = { ...b, content: stripBreakSpace(b.content) };
    }
    // preserveBlankLines가 만든 nbsp 전용 문단 → 진짜 빈 문단으로 표시
    // (BlockNote는 &nbsp;를 엔티티 디코드 없이 리터럴 텍스트로 파싱함)
    if (b.type === "paragraph" && Array.isArray(b.content) && b.content.length === 1
        && b.content[0].type === "text"
        && (b.content[0].text === BLANK_MARKER || b.content[0].text === BLANK_MARKER_OUT)) {
      return { ...b, content: [] };
    }
    if (b.type === "codeBlock") {
      const lang = b.props?.language;
      const text = b.content?.map((c: any) => c.text).join("") || "";
      if (lang === "mermaid" || ((!lang || lang === "text" || lang === "plaintext" || lang === "") && isMermaidCode(text))) {
        return { id: b.id, type: "mermaid", props: { code: text } } as any;
      }
    }
    if (b.children && b.children.length > 0) {
      b.children = processBlocksFromMarkdown(b.children);
    }
    return b;
  });
};

/** quoteJoins: 앞 인용에 이어지는 인용 블록의 ID(quoteJoinIds). 저장할 때 앞 인용과 한 인용으로 합친다. */
export const processBlocksToMarkdown = (blocks: any[], quoteJoins?: Set<string>): any[] => {
  return blocks.map((b: any, i: number) => {
    const newB = { ...b };
    // 빈 문단 → nbsp 문단으로 직렬화해 빈 줄이 마크다운에서 유실되지 않게 함
    // (저장 직전 restoreBlankLines가 다시 빈 줄로 복원)
    const isEmptyParagraph = newB.type === "paragraph"
      && (!newB.content || (Array.isArray(newB.content) && newB.content.every((c: any) => c.type === "text" && !c.text.trim())));
    if (isEmptyParagraph) {
      return { ...newB, content: [{ type: "text", text: BLANK_MARKER_OUT, styles: {} }] };
    }
    if (newB.type === "mermaid") {
      return {
        id: newB.id,
        type: "codeBlock",
        props: { language: "mermaid" },
        content: [{ type: "text", text: newB.props.code, styles: {} }]
      } as any;
    }
    if (Array.isArray(newB.content) && newB.type !== 'codeBlock') {
      newB.content = splitEmphasisEdgeSpaces(escapeLiteralMarkdown(markSameTextLinks(newB.content), newB.type === 'paragraph'));
    }
    if (newB.type === 'quote' && quoteJoins?.has(newB.id) && blocks[i - 1]?.type === 'quote' && Array.isArray(newB.content)) {
      newB.content = [{ type: 'text', text: QUOTE_JOIN_MARK, styles: {} }, ...newB.content];
    }
    if (newB.children && newB.children.length > 0) {
      newB.children = processBlocksToMarkdown(newB.children, quoteJoins);
    }
    return newB;
  });
};

// 행 단위 스캔으로 코드펜스(``` 및 ~~~, 미폐합 포함)를 정확히 건너뛰고
// 바깥 텍스트에만 fn을 적용한다 (기존 정규식 분할은 ~~~/미폐합 펜스를 오판했음)
export function mapOutsideCodeFences(markdown: string, fn: (part: string) => string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let buffer: string[] = [];
  let openFence: string | null = null;
  const flush = () => {
    if (buffer.length) {
      out.push(fn(buffer.join('\n')));
      buffer = [];
    }
  };
  for (const line of lines) {
    const m = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (openFence === null && m) {
      flush();
      openFence = m[1];
      out.push(line);
    } else if (openFence !== null) {
      out.push(line);
      if (m && m[1][0] === openFence[0] && m[1].length >= openFence.length) {
        openFence = null;
      }
    } else {
      buffer.push(line);
    }
  }
  flush();
  return out.join('\n');
}

// 마크다운 저장 시 모든 연속된 숫자 리스트가 1. 로 직렬화되는 현상을 1., 2., 3. 순차적으로 수정
export function normalizeOrderedListNumbers(md: string): string {
  const lines = md.split('\n');
  let indentCounters: { [indent: number]: number } = {};
  let openFence: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 코드 펜스 처리
    const m = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (openFence === null && m) {
      openFence = m[1];
      continue;
    } else if (openFence !== null) {
      if (m && m[1][0] === openFence[0] && m[1].length >= openFence.length) {
        openFence = null;
      }
      continue;
    }

    const match = line.match(/^(\s*)(\d+)\.(?=\s)(.*)/);
    if (match) {
      const indent = match[1].length;
      if (indentCounters[indent] === undefined) {
        indentCounters[indent] = parseInt(match[2], 10);
      } else {
        indentCounters[indent]++;
      }
      lines[i] = `${match[1]}${indentCounters[indent]}.${match[3]}`;
      
      // 하위 레벨 카운터 리셋
      for (const key in indentCounters) {
        if (parseInt(key) > indent) {
          delete indentCounters[key];
        }
      }
    } else {
      // 헤더를 만나거나 빈 줄을 만나면 모든 카운터를 리셋
      if (/^#{1,6}\s/.test(line) || line.trim() === '') {
        indentCounters = {};
      }
    }
  }
  return lines.join('\n');
}

// 다단계 불릿 리스트를 -와 * 번갈아가며 표시하도록 직렬화 정규화
export function normalizeUnorderedListBullets(md: string): string {
  const lines = md.split('\n');
  let activeIndents: number[] = [];
  let openFence: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 코드 펜스 처리
    const m = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (openFence === null && m) {
      openFence = m[1];
      continue;
    } else if (openFence !== null) {
      if (m && m[1][0] === openFence[0] && m[1].length >= openFence.length) {
        openFence = null;
      }
      continue;
    }

    // 마크다운 불릿 리스트 매칭 (- * +). 단, 수평선(---, ***)은 제외.
    const match = line.match(/^(\s*)([-*+])\s+(.*)/);
    // 수평선은 같은 기호 셋 이상과 공백만으로 된 줄이다. 앞부분만 보면 '* **굵게**'를 수평선으로 잘못 본다.
    const isHr = /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line);
    
    if (match && !isHr) {
      const indent = match[1].length;
      
      // 현재보다 깊은 들여쓰기는 스택에서 제거
      activeIndents = activeIndents.filter(ind => ind < indent);
      
      if (!activeIndents.includes(indent)) {
        activeIndents.push(indent);
      }
      
      const level = activeIndents.indexOf(indent);
      // 레벨 0: -, 레벨 1: *, 레벨 2: -, 레벨 3: *
      const bullet = level % 2 === 0 ? '-' : '*';
      lines[i] = `${match[1]}${bullet} ${match[3]}`;
    } else {
      // 헤더를 만나면 초기화
      if (/^#{1,6}\s/.test(line)) {
        activeIndents = [];
      }
    }
  }
  return lines.join('\n');
}

// 문단 내부의 단일 개행을 하드브레이크(후행 공백 2개)로 만들어 BlockNote 왕복에서
// 줄바꿈이 유실되지 않게 함. 리스트/표/헤딩/인용 등 구조 행에는 붙이지 않고(diff 오염 방지),
// 이미 하드브레이크인 행은 건너뛰어 멱등적으로 동작.
export function preserveMarkdownLineBreaks(markdown: string): string {
  const isStructural = (line: string) => /^\s*(?:[-*+]\s|\d+[.)]\s|#{1,6}\s|>|\|)/.test(line);
  return mapOutsideCodeFences(markdown, part => {
    const lines = part.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      const cur = lines[i];
      const next = lines[i + 1];
      if (cur.trim() === '' || next.trim() === '') continue;
      if (isStructural(cur) || isStructural(next)) continue;
      if (!cur.endsWith('  ') && !cur.endsWith('\\')) {
        lines[i] = cur + '  ';
      }
    }
    return lines.join('\n');
  });
}

// 빈 줄 2줄 이상(\n 3개 이상): 초과분을 &nbsp; 문단으로 바꿔 파싱에서 살아남게 함
// (마크다운 파서는 연속 빈 줄을 문단 구분 하나로 접어버림)
export function preserveBlankLines(md: string): string {
  return mapOutsideCodeFences(md, part =>
    part.replace(/\n{3,}/g, m => '\n\n' + (BLANK_MARKER + '\n\n').repeat(m.length - 2))
  );
}

// 저장 시 빈 줄 표식 문단을 다시 빈 줄로 복원. 표식이 붙은 것만 지우므로
// 사용자가 직접 쓴 &nbsp; 문단은 그대로 남는다.
export function restoreBlankLines(md: string): string {
  // 문서가 빈 문단으로 시작하면 표식 앞에 \n\n이 없고, 직렬화기가 맨 앞 NBSP까지 잘라 폭 없는 공백만 남긴다.
  // 그대로 두면 보이지 않는 문자가 파일에 남는다.
  const head = md.replace(new RegExp('^(?:&nbsp;|' + NBSP + ')?' + BLANK_ZWSP + '[ \t]*(?=\n|$)'), '');
  return mapOutsideCodeFences(head, part =>
    part.replace(new RegExp('\n\n(?:&nbsp;|' + NBSP + ')' + BLANK_ZWSP + '[ \t]*(?=\n|$)', 'g'), '\n')
  );
}

const MD_IMAGE_RE = /(!\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g;

// 상대경로 이미지를 webview URI로 바꿔 WYSIWYG에서 미리보기 가능하게 함
export function toWebviewImageUrls(md: string, base: string): string {
  if (!base) return md;
  return mapOutsideCodeFences(md, part => part.replace(MD_IMAGE_RE, (m, pre, url, post) => {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) || url.startsWith('//') || url.startsWith('/') || url.startsWith('#')) {
      return m;
    }
    return `${pre}${base}/${url}${post}`;
  }));
}

// 저장 시 webview URI를 다시 상대경로로 복원 (base는 고유 URL이므로 단순 치환 안전)
export function fromWebviewImageUrls(md: string, base: string): string {
  if (!base) return md;
  return md.split(`${base}/`).join('');
}

export function extractFrontmatter(text: string): { frontmatter: string, content: string } {
  // 닫는 --- 뒤에 개행이 없어도(파일이 frontmatter로 끝나도) 인식
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (match) {
    return { frontmatter: match[1], content: text.slice(match[0].length) };
  }
  return { frontmatter: "", content: text };
}

// GFM GitHub Alert 구문 패턴 (> [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION])
export const GITHUB_ALERT_RE = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i;

// 엑셀, TSV, CSV 등 구분자 텍스트를 마크다운 표 문자열로 파싱해준다.
export function parseTableFromClipboardText(text: string): string | null {
  if (!text || !text.includes('\n')) return null;
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  // 탭 구분(TSV)만 표로 자동 변환한다. Excel과 스프레드시트가 클립보드에 넣는 형식이고,
  // 산문에는 탭이 거의 나오지 않아 오판이 없다.
  // 쉼표 구분은 쓰지 않는다: "안녕하세요, 반갑습니다"처럼 쉼표가 든 평범한 두 줄이
  // 열 개수까지 우연히 맞으면 표로 바뀌어 버린다.
  if (!lines[0].includes('\t')) return null;

  const delimiter = '\t';
  const rows = lines.map(line => line.split(delimiter).map(cell => cell.trim()));
  const colCount = rows[0].length;

  if (colCount < 2) return null;
  // 모든 줄의 열 개수가 같을 때만 표로 본다. 쉼표가 든 평범한 산문 두 줄이
  // 표로 바뀌던 오동작을 막는다.
  if (!rows.every(r => r.length === colCount)) return null;

  // 셀 안의 | 는 표 구분자와 충돌하므로 이스케이프한다
  const cell = (c: string) => (c || ' ').replace(/\|/g, '\\|');
  const header = `| ${rows[0].map(cell).join(' | ')} |`;
  const separator = `| ${Array(colCount).fill('---').join(' | ')} |`;
  const dataRows = rows.slice(1).map(row => `| ${row.map(cell).join(' | ')} |`).join('\n');

  return `${header}\n${separator}\n${dataRows}`;
}

// --- Phase 2: Obsidian Integration Helpers ---

// [[문서명]] -> [문서명](문서명.md) 로 변환하여 에디터 렌더링 지원.
// 변환한 문서명을 seen에 기록해 두면 저장 시 그것만 되돌린다 (사용자가 직접 쓴
// [X](X.md) 형태의 일반 링크가 위키링크로 바뀌는 것을 막음).
export function parseWikilinks(md: string, seen?: Set<string>): string {
  return mapOutsideCodeFences(md, part =>
    part.replace(/\[\[([^\]]+)\]\]/g, (_, docName) => {
      seen?.add(docName);
      return `[${docName}](${docName}.md)`;
    })
  );
}

// 저장 시 parseWikilinks가 실제로 변환했던 문서명만 [[문서명]]으로 원상 복구
export function serializeWikilinks(md: string, seen?: Set<string>): string {
  if (!seen || seen.size === 0) return md;
  return mapOutsideCodeFences(md, part =>
    part.replace(/\[([^\]]+)\]\(\1\.md\)/g, (m, docName) =>
      seen.has(docName) ? `[[${docName}]]` : m
    )
  );
}

const ZWSP = '\u200B';

// HTML 주석(<!-- ... -->) 및 인라인/블록 HTML 태그(<kbd>, <span> 등)를 BlockNote가 파싱 중
// 무단 삭제하거나 태그를 벗겨내지 못하도록 폭 없는 공백(ZWSP)으로 임시 보호한다.
// 단, CommonMark autolink(<https://...>, <mailto:...>)는 BlockNote 링크 파서 유지를 위해 제외한다.
export function protectHtml(md: string): string {
  return mapOutsideCodeFences(md, part =>
    part.replace(/<!--[\s\S]*?-->|<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s+[^<>]*)?\/?>/g, (tag, offset: number, whole: string) => {
      if (/^<[a-zA-Z][a-zA-Z0-9+.-]*:[^>]+>$/i.test(tag) || /^<[^\s@]+@[^\s@]+\.[^\s@]+>$/.test(tag)) {
        return tag;
      }
      // 인라인 링크 목적지를 감싼 꺾쇠([a](<my file.md>))는 HTML 태그가 아니다.
      // 참조 정의([a]: <my file.md>)는 BlockNote가 보존하지 못하므로 지금처럼 글자로 보호해 원문을 지킨다.
      if (whole.slice(Math.max(0, offset - 2), offset) === '](') {
        return tag;
      }
      return '<' + ZWSP + tag.slice(1);
    })
  );
}

// 저장 직전 ZWSP 임시 보호 표식을 원상 복구하고, BlockNote가 주석 내부에 붙인 하드브레이크(\)를 정리한다.
export function restoreHtml(md: string): string {
  return mapOutsideCodeFences(md, part => {
    // 보호한 HTML 태그만 있는 줄은 원래 하드브레이크가 아니다. 파싱 전 줄 보존이 붙인 \를 걷어낸다.
    let res = part.replace(/^([ \t]*<\u200B[^\n]*>)\\$/gm, '$1');
    res = res.replaceAll('<' + ZWSP, '<');
    res = res.replace(/<!--([\s\S]*?)-->/g, (_match, inner) => {
      const cleaned = inner.replace(/\\\r?\n\s?/g, '\n');
      return `<!--${cleaned}-->`;
    });
    return res;
  });
}
