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

export const processBlocksFromMarkdown = (blocks: any[]): any[] => {
  return blocks.map((b: any) => {
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

export const processBlocksToMarkdown = (blocks: any[]): any[] => {
  return blocks.map((b: any) => {
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
    if (newB.children && newB.children.length > 0) {
      newB.children = processBlocksToMarkdown(newB.children);
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
    const isHr = line.match(/^\s*([-*+])\s*\1\s*\1/);
    
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
  return mapOutsideCodeFences(md, part =>
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

// 상대경로 이미지 링크 유효성 감지 함수 (배포용 매뉴얼 링크 상태 체크)
export function detectBrokenImageLinks(md: string): { alt: string; url: string; line: number }[] {
  const broken: { alt: string; url: string; line: number }[] = [];
  const lines = md.split('\n');
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```') || line.trim().startsWith('~~~')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const matches = line.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g);
    for (const match of matches) {
      const alt = match[1];
      const url = match[2];
      // 프로토콜이 없는 로컬 상대 경로 중 잘못된 확장자나 빈 경로 체크
      if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) && !url.startsWith('//') && !url.startsWith('data:')) {
        if (!url || url.endsWith('/') || !/\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(url)) {
          broken.push({ alt, url, line: i + 1 });
        }
      }
    }
  }

  return broken;
}

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

// 본문 내 #태그를 추출하여 중복 없는 배열로 반환
export function extractTagsFromMarkdown(md: string): string[] {
  const tags = new Set<string>();
  mapOutsideCodeFences(md, part => {
    // 공백 문자나 문장 시작 뒤에 오는 #태그 추출
    const matches = part.matchAll(/(?:^|\s)#([A-Za-z0-9가-힣_-]+)/g);
    for (const match of matches) {
      tags.add(match[1]);
    }
    return part;
  });
  return Array.from(tags);
}

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
    part.replace(/<!--[\s\S]*?-->|<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s+[^<>]*)?\/?>/g, (tag) => {
      if (/^<[a-zA-Z][a-zA-Z0-9+.-]*:[^>]+>$/i.test(tag) || /^<[^\s@]+@[^\s@]+\.[^\s@]+>$/.test(tag)) {
        return tag;
      }
      return '<' + ZWSP + tag.slice(1);
    })
  );
}

// 저장 직전 ZWSP 임시 보호 표식을 원상 복구하고, BlockNote가 주석 내부에 붙인 하드브레이크(\)를 정리한다.
export function restoreHtml(md: string): string {
  return mapOutsideCodeFences(md, part => {
    let res = part.replaceAll('<' + ZWSP, '<');
    res = res.replace(/<!--([\s\S]*?)-->/g, (_match, inner) => {
      const cleaned = inner.replace(/\\\r?\n\s?/g, '\n');
      return `<!--${cleaned}-->`;
    });
    return res;
  });
}
