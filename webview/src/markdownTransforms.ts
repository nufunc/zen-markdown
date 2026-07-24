// 마크다운 <-> BlockNote 왕복 변환에 쓰이는 순수 함수 모음.
// 컴포넌트 상태에 의존하지 않으므로 독립적으로 테스트 가능하다.

export const NBSP = ' ';

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
        && (b.content[0].text === "&nbsp;" || b.content[0].text === NBSP)) {
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
      return { ...newB, content: [{ type: "text", text: NBSP, styles: {} }] };
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

// 확장된 공식 지원 언어 목록 (이외의 잘못된 언어 문자열은 text로 기본 처리)
const KNOWN_LANGUAGES = [
  "abap", "actionscript", "ada", "arduino", "bash", "basic", "c", "cpp", "csharp", "cs", "css",
  "d", "dart", "delphi", "dockerfile", "docker", "elixir", "erlang", "fortran", "go", "golang",
  "graphql", "groovy", "haskell", "html", "java", "javascript", "js", "jsx", "json", "julia",
  "kotlin", "latex", "tex", "lisp", "lua", "makefile", "markdown", "md", "matlab", "objectivec",
  "ocaml", "pascal", "perl", "php", "plaintext", "text", "txt", "powershell", "ps1", "ps",
  "prolog", "python", "py", "r", "ruby", "rb", "rust", "rs", "scala", "scheme", "shell", "sh",
  "sql", "swift", "tcl", "tsx", "typescript", "ts", "vbnet", "vhdl", "verilog", "xml", "yaml", "yml"
];

export function sanitizeMarkdownCodeBlocks(markdown: string): string {
  return markdown.replace(/^```([^\s\n]+)?(.*)$/gm, (match, lang, rest) => {
    if (!lang) return match; // 닫힘 태그(```) 또는 언어 없는 열림 태그는 원본 유지
    const normalizedLang = lang.toLowerCase();
    if (KNOWN_LANGUAGES.includes(normalizedLang)) {
      return match;
    }
    // 잘못된(알 수 없는) 대상이 들어간 경우 기본 서식(text)으로 변경
    return "```text" + rest;
  });
}

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
    part.replace(/\n{3,}/g, m => '\n\n' + '&nbsp;\n\n'.repeat(m.length - 2))
  );
}

// 저장 시 &nbsp;/NBSP 전용 문단을 다시 빈 줄로 복원
export function restoreBlankLines(md: string): string {
  return mapOutsideCodeFences(md, part =>
    part.replace(/\n\n(?:&nbsp;| )[ \t]*(?=\n|$)/g, '\n')
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

  // 탭(\t) 구분자 확인 (TSV / Excel 기본)
  const isTsv = lines[0].includes('\t');
  // 콤마(,) 구분자 확인
  const isCsv = !isTsv && lines[0].includes(',');

  if (!isTsv && !isCsv) return null;

  const delimiter = isTsv ? '\t' : ',';
  const rows = lines.map(line => line.split(delimiter).map(cell => cell.trim()));
  const colCount = Math.max(...rows.map(r => r.length));

  if (colCount < 2) return null;

  // Header row
  const header = `| ${rows[0].map(c => c || ' ').join(' | ')} |`;
  // Separator row
  const separator = `| ${Array(colCount).fill('---').join(' | ')} |`;
  // Data rows
  const dataRows = rows.slice(1).map(row => {
    const padded = [...row];
    while (padded.length < colCount) padded.push(' ');
    return `| ${padded.map(c => c || ' ').join(' | ')} |`;
  }).join('\n');

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

// [[문서명]] -> [문서명](문서명.md) 로 변환하여 에디터 렌더링 지원
export function parseWikilinks(md: string): string {
  return mapOutsideCodeFences(md, part => 
    part.replace(/\[\[([^\]]+)\]\]/g, (_, docName) => `[${docName}](${docName}.md)`)
  );
}

// 저장 시 [문서명](문서명.md) 형태를 다시 [[문서명]]으로 원상 복구
export function serializeWikilinks(md: string): string {
  return mapOutsideCodeFences(md, part => 
    part.replace(/\[([^\]]+)\]\(\1\.md\)/g, (_, docName) => `[[${docName}]]`)
  );
}
