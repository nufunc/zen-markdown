import { useEffect, useState, useRef } from 'react';
import { BlockNoteEditor, BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core';
import { MermaidBlock } from './MermaidBlock';

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    mermaid: MermaidBlock(),
  },
});

const isMermaidCode = (text: string): boolean => {
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

const NBSP = '\u00A0';

const processBlocksFromMarkdown = (blocks: any[]): any[] => {
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

const processBlocksToMarkdown = (blocks: any[]): any[] => {
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
import { BlockNoteView } from '@blocknote/mantine';
import { Settings, X, Info, ChevronDown, ChevronUp, Search, List, RefreshCw, GitCompare } from 'lucide-react';
import YAML from 'yaml';
import '@blocknote/mantine/style.css';
import { vscode } from './vscode';
import CodeMirror from '@uiw/react-codemirror';
import CodeMirrorMerge from 'react-codemirror-merge';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { codeLanguages } from './codeLanguages';
import { EditorView } from 'codemirror';
import { EditorState } from '@codemirror/state';
import * as cmThemes from '@uiw/codemirror-themes-all';

const { Original, Modified } = CodeMirrorMerge;

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

function sanitizeMarkdownCodeBlocks(markdown: string): string {
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

function mapOutsideCodeFences(markdown: string, fn: (part: string) => string): string {
  const parts = markdown.split(/(```[\s\S]*?```)/);
  return parts.map((part, index) => (index % 2 === 0 ? fn(part) : part)).join('');
}

function preserveMarkdownLineBreaks(markdown: string): string {
  return mapOutsideCodeFences(markdown, part =>
    // Replace single newlines between text with two spaces + newline
    // This forces markdown parsers to treat them as hard breaks (<br>)
    part.replace(/([^\n])\n(?=[^\n])/g, '$1  \n')
  );
}

// 빈 줄 2줄 이상(\n 3개 이상): 초과분을 &nbsp; 문단으로 바꿔 파싱에서 살아남게 함
// (마크다운 파서는 연속 빈 줄을 문단 구분 하나로 접어버림)
function preserveBlankLines(md: string): string {
  return mapOutsideCodeFences(md, part =>
    part.replace(/\n{3,}/g, m => '\n\n' + '&nbsp;\n\n'.repeat(m.length - 2))
  );
}

// 저장 시 &nbsp;/NBSP 전용 문단을 다시 빈 줄로 복원
function restoreBlankLines(md: string): string {
  return mapOutsideCodeFences(md, part =>
    part.replace(/\n\n(?:&nbsp;|\u00A0)[ \t]*(?=\n|$)/g, '\n')
  );
}

const MD_IMAGE_RE = /(!\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g;

// 상대경로 이미지를 webview URI로 바꿔 WYSIWYG에서 미리보기 가능하게 함
function toWebviewImageUrls(md: string, base: string): string {
  if (!base) return md;
  return mapOutsideCodeFences(md, part => part.replace(MD_IMAGE_RE, (m, pre, url, post) => {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) || url.startsWith('//') || url.startsWith('/') || url.startsWith('#')) {
      return m;
    }
    return `${pre}${base}/${url}${post}`;
  }));
}

// 저장 시 webview URI를 다시 상대경로로 복원 (base는 고유 URL이므로 단순 치환 안전)
function fromWebviewImageUrls(md: string, base: string): string {
  if (!base) return md;
  return md.split(`${base}/`).join('');
}

function extractFrontmatter(text: string): { frontmatter: string, content: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (match) {
    return { frontmatter: match[1], content: text.slice(match[0].length) };
  }
  return { frontmatter: "", content: text };
}

function App() {
  const [documentText, setDocumentText] = useState<string | "loading">("loading");
  const [config, setConfig] = useState<{ theme: string, fontSize: number, autoFix: boolean, autoRefresh: boolean, showToc: boolean, showProperties: boolean, isReadOnly: boolean }>({ theme: "auto", fontSize: 16, autoFix: false, autoRefresh: true, showToc: false, showProperties: false, isReadOnly: false });
  const [isRawMode, setIsRawMode] = useState(() => !!(vscode.getState()?.isRawMode));
  const [isDiffMode, setIsDiffMode] = useState(false);
  const [originalText, setOriginalText] = useState<string | null>(null);
  const [editor, setEditor] = useState<any>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [parsedFrontmatter, setParsedFrontmatter] = useState<string>("");
  const [fmData, setFmData] = useState<Record<string, any> | null>(null);
  const [showSearchReplace, setShowSearchReplace] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [headings, setHeadings] = useState<{id: string, text: string, level: number}[]>([]);
  const showToc = config.showToc;
  const showProperties = config.showProperties;
  const [tocPosition, setTocPosition] = useState({ right: 20, top: 80 });
  const tocDragRef = useRef<{ startX: number, startY: number, startRight: number, startTop: number } | null>(null);
  
  const settingsRef = useRef<HTMLDivElement>(null);
  const hasEdited = useRef(false);
  const isInitializing = useRef(false);
  const docBaseUriRef = useRef<string>("");
  const pendingUploads = useRef<Map<string, (v: { relPath?: string, error?: string }) => void>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRestoredScroll = useRef(false);
  const cmViewRef = useRef<any>(null);
  const pendingHeadingRef = useRef<string | null>(null);

  useEffect(() => {
    const handleTocMouseMove = (e: MouseEvent) => {
      if (!tocDragRef.current) return;
      const dx = e.clientX - tocDragRef.current.startX;
      const dy = e.clientY - tocDragRef.current.startY;
      setTocPosition({
        right: Math.max(0, tocDragRef.current.startRight - dx),
        top: Math.max(0, tocDragRef.current.startTop + dy)
      });
    };

    const handleTocMouseUp = () => {
      tocDragRef.current = null;
    };

    document.addEventListener('mousemove', handleTocMouseMove);
    document.addEventListener('mouseup', handleTocMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleTocMouseMove);
      document.removeEventListener('mouseup', handleTocMouseUp);
    };
  }, []);

  const handleTocMouseDown = (e: React.MouseEvent) => {
    tocDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRight: tocPosition.right,
      startTop: tocPosition.top
    };
  };

  useEffect(() => {
    vscode.postMessage({ type: 'ready' });
  }, []);

  // Ctrl/Cmd+클릭으로 링크 열기 — 상대경로 .md는 Neat 에디터로, 그 외는 VS Code/외부로
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (!href) return;
      e.preventDefault();
      e.stopPropagation();
      const base = docBaseUriRef.current;
      const rel = base && href.startsWith(base + '/') ? href.slice(base.length + 1) : href;
      vscode.postMessage({ type: 'openLink', href: rel });
    };
    document.addEventListener('click', handleLinkClick, true);
    return () => document.removeEventListener('click', handleLinkClick, true);
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'config':
          docBaseUriRef.current = message.docBaseUri || "";
          setConfig({
            theme: message.theme,
            fontSize: message.fontSize,
            autoFix: message.autoFix,
            autoRefresh: message.autoRefresh,
            showToc: message.showToc,
            showProperties: message.showProperties,
            isReadOnly: message.isReadOnly
          });
          if (message.isReadOnly) {
            setIsRawMode(true);
          }
          break;
        case 'update':
          if (documentText === "loading") {
            setDocumentText(message.text || "");
          }
          break;
        case 'external_update':
          setDocumentText(message.text || "");
          break;
        case 'originalContent':
          setOriginalText(message.content);
          break;
        case 'imageSaved': {
          const resolve = pendingUploads.current.get(message.requestId);
          if (resolve) {
            pendingUploads.current.delete(message.requestId);
            resolve({ relPath: message.relPath, error: message.error });
          }
          break;
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [documentText]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (isRawMode) return;

    let hoverTarget: HTMLElement | null = null;
    let timeoutId: any = null;

    const floatingBtn = document.createElement('button');
    floatingBtn.className = 'bn-floating-copy-btn';
    floatingBtn.innerHTML = '📋 Copy';
    floatingBtn.style.position = 'absolute';
    floatingBtn.style.padding = '4px 8px';
    floatingBtn.style.fontSize = '11px';
    floatingBtn.style.cursor = 'pointer';
    floatingBtn.style.borderRadius = '4px';
    floatingBtn.style.opacity = '0';
    floatingBtn.style.pointerEvents = 'none';
    floatingBtn.style.transition = 'opacity 0.2s';
    floatingBtn.style.zIndex = '1000';
    
    document.body.appendChild(floatingBtn);

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const codeBlock = target.closest('.bn-block-content[data-content-type="codeBlock"]') as HTMLElement;
      
      if (codeBlock) {
        hoverTarget = codeBlock;
        const rect = codeBlock.getBoundingClientRect();
        floatingBtn.style.top = `${rect.top + window.scrollY + 6}px`;
        // Button width is ~60px, padding right is ~6px
        floatingBtn.style.left = `${rect.right + window.scrollX - 70}px`; 
        floatingBtn.style.opacity = '1';
        floatingBtn.style.pointerEvents = 'auto';
        
        clearTimeout(timeoutId);
      } else {
        if (target !== floatingBtn && !floatingBtn.contains(target)) {
          timeoutId = setTimeout(() => {
            floatingBtn.style.opacity = '0';
            floatingBtn.style.pointerEvents = 'none';
            hoverTarget = null;
            floatingBtn.innerHTML = '📋 Copy';
          }, 100);
        }
      }
    };

    floatingBtn.onclick = () => {
      if (hoverTarget) {
        const pre = hoverTarget.querySelector('pre');
        if (pre) {
          navigator.clipboard.writeText(pre.innerText);
          floatingBtn.innerHTML = '✅ Copied!';
          setTimeout(() => { floatingBtn.innerHTML = '📋 Copy'; }, 2000);
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      if (document.body.contains(floatingBtn)) {
        document.body.removeChild(floatingBtn);
      }
    };
  }, [isRawMode]);

  const extractHeadings = (editorInstance: any) => {
    const newHeadings: {id: string, text: string, level: number}[] = [];
    editorInstance.forEachBlock((b: any) => {
      if (b.type === 'heading') {
        const text = b.content?.map((c: any) => c.text || c.content?.map((cc:any)=>cc.text).join('') || '').join('') || '';
        if (text.trim()) {
          newHeadings.push({ id: b.id, text, level: b.props.level });
        }
      }
      return true;
    });
    setHeadings(newHeadings);
  };

  useEffect(() => {
    async function initEditor() {
      if (documentText !== "loading" && !isRawMode) {
        const { frontmatter, content } = extractFrontmatter(documentText);
        setParsedFrontmatter(frontmatter);
        try {
          if (frontmatter) setFmData(YAML.parse(frontmatter));
        } catch(e) {
          setFmData(null);
        }
        const normalizedContent = content.replace(/\r\n/g, '\n');
        const safeContent = preserveMarkdownLineBreaks(sanitizeMarkdownCodeBlocks(
          preserveBlankLines(toWebviewImageUrls(normalizedContent, docBaseUriRef.current))
        ));

        isInitializing.current = true;
        if (!editor) {
          const newEditor = BlockNoteEditor.create({ schema, uploadFile });
          let blocks = await newEditor.tryParseMarkdownToBlocks(safeContent);
          blocks = processBlocksFromMarkdown(blocks);
          newEditor.replaceBlocks(newEditor.document, blocks);
          setEditor(newEditor);
          extractHeadings(newEditor);
          // Reset edit flag after initialization
          hasEdited.current = false;

          // 모드 전환 시 기억한 헤딩 또는 저장된 스크롤 위치로 복원
          setTimeout(() => {
            const target = pendingHeadingRef.current;
            if (target) {
              pendingHeadingRef.current = null;
              newEditor.forEachBlock((b: any) => {
                if (b.type === 'heading') {
                  const text = b.content?.map((c: any) => c.text || '').join('') || '';
                  if (text.trim() === target) {
                    document.querySelector(`[data-id="${b.id}"]`)?.scrollIntoView({ block: 'start' });
                    return false;
                  }
                }
                return true;
              });
            } else if (!hasRestoredScroll.current && scrollRef.current) {
              const saved = vscode.getState();
              if (saved?.scrollTop) scrollRef.current.scrollTop = saved.scrollTop;
            }
            hasRestoredScroll.current = true;
          }, 150);
        } else {
          // External update or refresh: replace existing blocks
          let blocks = await editor.tryParseMarkdownToBlocks(safeContent);
          blocks = processBlocksFromMarkdown(blocks);
          editor.replaceBlocks(editor.document, blocks);
          extractHeadings(editor);
        }
        
        setTimeout(() => {
          isInitializing.current = false;
        }, 100);
      }
    }
    initEditor();
  }, [documentText, isRawMode, editor]);

  // 클립보드/드롭 이미지를 문서 옆 assets/ 폴더에 저장하고 미리보기 URL 반환
  const uploadFile = async (file: File): Promise<string> => {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const requestId = Math.random().toString(36).slice(2);
    const result = await new Promise<{ relPath?: string, error?: string }>((resolve) => {
      pendingUploads.current.set(requestId, resolve);
      vscode.postMessage({ type: 'saveImage', requestId, name: file.name || 'image.png', data });
    });
    if (result.error || !result.relPath) {
      vscode.postMessage({ type: 'notify', message: `이미지 저장 실패: ${result.error || 'unknown'}` });
      throw new Error(result.error || 'Image save failed');
    }
    const base = docBaseUriRef.current;
    return base ? `${base}/${result.relPath}` : result.relPath;
  };

  const changeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 매 키입력마다 전체 문서를 교체하지 않도록 300ms 디바운스
  const postChange = (text: string) => {
    if (changeDebounceRef.current) clearTimeout(changeDebounceRef.current);
    changeDebounceRef.current = setTimeout(() => {
      changeDebounceRef.current = null;
      vscode.postMessage({ type: 'change', text });
    }, 300);
  };

  const saveToHost = (fmString: string, mdString: string) => {
    const fullText = fmString ? `---\n${fmString}\n---\n${mdString}` : mdString;
    postChange(fullText);
  };

  const handleWysiwygChange = async () => {
    if (!editor || isInitializing.current) return;
    hasEdited.current = true;
    extractHeadings(editor);
    const blocksForMd = processBlocksToMarkdown(editor.document);
    let markdown = await editor.blocksToMarkdownLossy(blocksForMd as any);
    
    // Force hyphens for bullet lists (Notion/UpNote style) safely (ignore codeblocks)
    const lines = markdown.split('\n');
    let inCodeBlock = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
      } else if (!inCodeBlock) {
        lines[i] = lines[i].replace(/^(\s*)\*\s/, '$1- ');
      }
    }
    markdown = lines.join('\n');

    markdown = preserveMarkdownLineBreaks(sanitizeMarkdownCodeBlocks(markdown));
    if (config.autoFix) {
      try {
        const prettier = await import('prettier/standalone');
        const prettierPluginMarkdown = await import('prettier/plugins/markdown');
        markdown = await prettier.format(markdown, { parser: "markdown", plugins: [prettierPluginMarkdown.default || prettierPluginMarkdown] });
      } catch (e) {
        console.error("Auto fix formatting failed", e);
      }
    }
    markdown = restoreBlankLines(fromWebviewImageUrls(markdown, docBaseUriRef.current));
    saveToHost(parsedFrontmatter, markdown);
  };

  const handleFmChange = async (key: string, value: any) => {
    if (!fmData || !editor) return;
    const newData = { ...fmData, [key]: value };
    setFmData(newData);
    const newFmString = YAML.stringify(newData).trim();
    setParsedFrontmatter(newFmString);
    const md = restoreBlankLines(fromWebviewImageUrls(
      await editor.blocksToMarkdownLossy(processBlocksToMarkdown(editor.document) as any),
      docBaseUriRef.current
    ));
    saveToHost(newFmString, md);
  };

  const handleFindNext = () => {
    if (!searchQuery) return;
    // @ts-ignore
    window.find(searchQuery, false, false, true, false, false, false);
  };

  const handleFindPrev = () => {
    if (!searchQuery) return;
    // @ts-ignore
    window.find(searchQuery, false, true, true, false, false, false);
  };

  const handleReplace = () => {
    if (!editor || !searchQuery) return;
    const selection = window.getSelection();
    if (selection && selection.toString().toLowerCase() === searchQuery.toLowerCase()) {
      // @ts-ignore
      if (editor._tiptapEditor) {
        // @ts-ignore
        editor._tiptapEditor.commands.insertContent(replaceQuery);
      }
      handleFindNext();
    } else {
      handleFindNext();
    }
  };

  const handleReplaceAll = () => {
    if (!editor || !searchQuery) return;
    let count = 0;
    
    const processContent = (content: any[]): { newContent: any[], modified: boolean } => {
      let modified = false;
      const newContent = content.map(item => {
        if (item.type === 'text' && item.text.toLowerCase().includes(searchQuery.toLowerCase())) {
          modified = true;
          const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          const matches = item.text.match(regex);
          if (matches) count += matches.length;
          return { ...item, text: item.text.replace(regex, replaceQuery) };
        }
        if (item.type === 'link' && item.content) {
          const childRes = processContent(item.content);
          if (childRes.modified) modified = true;
          return { ...item, content: childRes.newContent };
        }
        return item;
      });
      return { newContent, modified };
    };

    editor.forEachBlock((block: any) => {
      if (block.content && Array.isArray(block.content)) {
        const res = processContent(block.content);
        if (res.modified) {
          editor.updateBlock(block.id, { content: res.newContent });
        }
      }
      return true;
    });
    
    // alert()는 VS Code 웹뷰 샌드박스에서 차단되므로 호스트 알림 사용
    vscode.postMessage({ type: 'notify', message: `총 ${count}개의 항목이 바뀌었습니다.` });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+F는 VS Code 네이티브 find 위젯(enableFindWidget)에 양보하고,
      // 자체 Replace 위젯은 Ctrl+H로 연다
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        setShowSearchReplace(prev => !prev);
      } else if (e.key === 'Escape' && showSearchReplace) {
        setShowSearchReplace(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearchReplace]);

  const toggleMode = async () => {
    // 모드 전환 시 현재 위치의 헤딩을 기억해 반대 모드에서 같은 지점으로 스크롤 (best-effort)
    try {
      if (!isRawMode) {
        let current: string | null = null;
        for (const h of headings) {
          const el = document.querySelector(`[data-id="${h.id}"]`);
          if (!el) continue;
          if ((el as HTMLElement).getBoundingClientRect().top <= 120) current = h.text;
          else break;
        }
        pendingHeadingRef.current = current;
      } else {
        const view = cmViewRef.current;
        if (view && typeof documentText === 'string') {
          const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
          const lineNo = view.state.doc.lineAt(block.from).number;
          const lines = documentText.split('\n');
          for (let i = Math.min(lineNo, lines.length) - 1; i >= 0; i--) {
            const m = lines[i].match(/^#{1,6}\s+(.+)/);
            if (m) { pendingHeadingRef.current = m[1].trim(); break; }
          }
        }
      }
    } catch { /* 위치 동기화는 실패해도 무해 */ }
    vscode.updateState({ isRawMode: !isRawMode });

    if (!isRawMode && editor) {
      if (hasEdited.current) {
        let markdown = await editor.blocksToMarkdownLossy(processBlocksToMarkdown(editor.document) as any);
        markdown = restoreBlankLines(fromWebviewImageUrls(sanitizeMarkdownCodeBlocks(markdown), docBaseUriRef.current));
        const fullText = parsedFrontmatter ? `---\n${parsedFrontmatter}\n---\n${markdown}` : markdown;
        setDocumentText(fullText);
      }
      setEditor(null);
    }
    setIsRawMode(!isRawMode);
  };

  const handleKeyDownCapture = (e: React.KeyboardEvent) => {
    if (!editor || isRawMode) return;

    if (e.key === 'Tab' && !e.shiftKey) {
      try {
        const cursor = editor.getTextCursorPosition();
        if (cursor && cursor.block.type === 'numberedListItem') {
          // Change the block type to bulletListItem right before the editor handles the Tab key for indentation
          editor.updateBlock(cursor.block, {
            type: 'bulletListItem',
          });
          // We DO NOT preventDefault() here because we still want the editor to handle the indentation
        }
      } catch (err) {
        // Ignored if no cursor position can be resolved
      }
      return;
    }

    // UpNote Shortcuts
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '6') {
      e.preventDefault();
      e.stopPropagation();
      try {
        const cursor = editor.getTextCursorPosition();
        if (cursor) {
          editor.updateBlock(cursor.block, {
            type: 'heading',
            props: { level: parseInt(e.key) as any }
          });
        }
      } catch(err) {}
      return;
    }
    
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === '7') {
      e.preventDefault();
      e.stopPropagation();
      try {
        const cursor = editor.getTextCursorPosition();
        if (cursor) {
          editor.updateBlock(cursor.block, { type: 'bulletListItem' });
        }
      } catch(err) {}
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === '8') {
      e.preventDefault();
      e.stopPropagation();
      try {
        const cursor = editor.getTextCursorPosition();
        if (cursor) {
          editor.updateBlock(cursor.block, { type: 'numberedListItem' });
        }
      } catch(err) {}
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === '9') {
      e.preventDefault();
      e.stopPropagation();
      try {
        const cursor = editor.getTextCursorPosition();
        if (cursor) {
          editor.updateBlock(cursor.block, { type: 'checkListItem' });
        }
      } catch(err) {}
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      e.stopPropagation();
      try {
        const cursor = editor.getTextCursorPosition();
        if (cursor) {
          editor.updateBlock(cursor.block, { type: 'blockQuote' });
        }
      } catch(err) {}
      return;
    }
  };

  const updateConfig = (key: string, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    vscode.postMessage({ type: 'updateConfig', key, value });
  };

  // Resolve 'auto' to 'light' or 'dark' based on body class (VS Code sets vscode-light, vscode-dark, etc)
  const isVscodeDark = document.body.className.includes('vscode-dark') || document.body.className.includes('vscode-high-contrast');
  const activeTheme = config.theme === 'auto' ? (isVscodeDark ? 'dark' : 'light') : config.theme;
  
  const isDark = activeTheme === 'dark' || activeTheme === 'nord' || activeTheme === 'one-half-dark' || activeTheme === 'solarized-dark';

  useEffect(() => {
    document.body.setAttribute('data-theme-dark', isDark ? 'true' : 'false');
    window.dispatchEvent(new Event('theme-changed'));
  }, [isDark]);

  if (documentText === "loading") {
    return <div>Loading document...</div>;
  }
  
  let bgColor = '#ffffff';
  let textColor = '#333333';
  let headerBg = '#f3f3f3';
  let codeBg = '#f5f5f5';
  let codeColor = '#333333';
  let blockNoteTheme: "light" | "dark" = "light";
  let cmTheme: any = cmThemes.vscodeLight;

  if (activeTheme === 'dark') {
    bgColor = '#1e1e1e';
    textColor = '#d4d4d4';
    headerBg = '#2d2d2d';
    codeBg = '#252526';
    codeColor = '#d4d4d4';
    blockNoteTheme = "dark";
    cmTheme = cmThemes.vscodeDark;
  } else if (activeTheme === 'nord') {
    bgColor = '#2e3440';
    textColor = '#d8dee9';
    headerBg = '#3b4252';
    codeBg = '#3b4252';
    codeColor = '#d8dee9';
    blockNoteTheme = "dark";
    cmTheme = cmThemes.nord;
  } else if (activeTheme === 'one-half-dark') {
    bgColor = '#282c34';
    textColor = '#dcdfe4';
    headerBg = '#2c323c';
    codeBg = '#2c323c';
    codeColor = '#dcdfe4';
    blockNoteTheme = "dark";
    cmTheme = cmThemes.atomone;
  } else if (activeTheme === 'solarized-dark') {
    bgColor = '#002b36';
    textColor = '#839496';
    headerBg = '#073642';
    codeBg = '#073642';
    codeColor = '#839496';
    blockNoteTheme = "dark";
    cmTheme = cmThemes.solarizedDark;
  } else if (activeTheme === 'vintage') {
    bgColor = '#f4ecd8';
    textColor = '#3a3a3a';
    headerBg = '#e8dcc3';
    codeBg = '#e8dcc3';
    codeColor = '#3a3a3a';
    cmTheme = cmThemes.gruvboxLight;
  }

  const dropdownBg = isDark ? '#252526' : '#ffffff';
  const dropdownBorder = isDark ? '#555555' : '#dddddd';
  const inputBg = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';

  const renderFrontmatterUI = () => {
    if (!parsedFrontmatter || !showProperties) return null;
    if (!fmData) {
      return <pre style={{ fontSize: '11px', opacity: 0.7, whiteSpace: 'pre-wrap', padding: '10px' }}>{parsedFrontmatter}</pre>;
    }

    return (
      <div style={{ marginBottom: '16px', padding: '10px 14px', backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)', borderRadius: '6px', border: `1px solid ${dropdownBorder}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {Object.entries(fmData).map(([key, value]) => {
            const isArray = Array.isArray(value);
            
            return (
              <div key={key} style={{ display: 'flex', fontSize: '12px', alignItems: 'center' }}>
                <span style={{ width: '150px', fontWeight: '600', opacity: 0.7 }}>{key}</span>
                {isArray ? (
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '4px',
                    padding: '4px 8px',
                    backgroundColor: inputBg,
                    borderRadius: '4px',
                    minHeight: '24px',
                    alignItems: 'center',
                    flex: 1
                  }}>
                    {value.map((tag: string, i: number) => (
                      <span key={i} style={{
                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                        padding: '2px 6px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        {tag}
                        <button
                          style={{ background: 'none', border: 'none', color: 'inherit', padding: 0, cursor: 'pointer', opacity: 0.5, display: 'flex', alignItems: 'center' }}
                          onClick={() => {
                            const newArr = [...value];
                            newArr.splice(i, 1);
                            handleFmChange(key, newArr);
                          }}
                          title="Remove"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      placeholder="Add..."
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: textColor,
                        outline: 'none',
                        flex: 1,
                        minWidth: '60px',
                        fontSize: '11px',
                        padding: 0,
                        margin: 0
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                          handleFmChange(key, [...value, e.currentTarget.value.trim()]);
                          e.currentTarget.value = '';
                        } else if (e.key === 'Backspace' && !e.currentTarget.value && value.length > 0) {
                          const newArr = [...value];
                          newArr.pop();
                          handleFmChange(key, newArr);
                        }
                      }}
                      onBlur={(e) => {
                        if (e.currentTarget.value.trim()) {
                          handleFmChange(key, [...value, e.currentTarget.value.trim()]);
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                  </div>
                ) : (
                  <input 
                    type="text" 
                    value={String(value || '')}
                    onChange={(e) => handleFmChange(key, e.target.value)}
                    style={{ 
                      flex: 1,
                      background: inputBg, 
                      border: '1px solid transparent', 
                      borderRadius: '4px', 
                      padding: '4px 8px', 
                      color: 'inherit',
                      fontSize: '12px'
                    }}
                    onFocus={(e) => e.target.style.border = `1px solid ${dropdownBorder}`}
                    onBlur={(e) => e.target.style.border = '1px solid transparent'}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: bgColor, color: textColor }}>
      
      {/* Search & Replace Widget */}
      {showSearchReplace && !isRawMode && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          background: dropdownBg,
          padding: '8px',
          border: `1px solid ${dropdownBorder}`,
          borderRadius: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          color: textColor
        }}>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <Search size={14} style={{ opacity: 0.7, margin: '0 4px' }} />
            <input 
              placeholder="Find..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              style={{ padding: '4px', fontSize: '12px', background: inputBg, color: textColor, border: `1px solid ${dropdownBorder}`, borderRadius: '4px', width: '150px', outline: 'none' }} 
              onKeyDown={e => e.key === 'Enter' && handleFindNext()} 
              autoFocus
            />
            <button onClick={handleFindPrev} style={{ background: inputBg, color: textColor, border: `1px solid ${dropdownBorder}`, borderRadius: '4px', padding: '2px 6px', cursor: 'pointer' }}><ChevronUp size={14}/></button>
            <button onClick={handleFindNext} style={{ background: inputBg, color: textColor, border: `1px solid ${dropdownBorder}`, borderRadius: '4px', padding: '2px 6px', cursor: 'pointer' }}><ChevronDown size={14}/></button>
            <button onClick={() => setShowSearchReplace(false)} style={{ background: 'transparent', color: textColor, border: 'none', padding: '2px', cursor: 'pointer', marginLeft: '4px', opacity: 0.7 }}><X size={14}/></button>
          </div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <div style={{ width: '22px' }} />
            <input 
              placeholder="Replace..." 
              value={replaceQuery} 
              onChange={e => setReplaceQuery(e.target.value)} 
              style={{ padding: '4px', fontSize: '12px', background: inputBg, color: textColor, border: `1px solid ${dropdownBorder}`, borderRadius: '4px', width: '150px', outline: 'none' }} 
            />
            <button onClick={handleReplace} style={{ fontSize: '11px', background: inputBg, color: textColor, border: `1px solid ${dropdownBorder}`, borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}>Replace</button>
            <button onClick={handleReplaceAll} style={{ fontSize: '11px', background: inputBg, color: textColor, border: `1px solid ${dropdownBorder}`, borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}>Replace All</button>
          </div>
        </div>
      )}

      {/* TOC Sidebar */}
      {!isRawMode && showToc && headings.length > 0 && (
        <div style={{
          position: 'fixed',
          top: `${tocPosition.top}px`,
          right: `${tocPosition.right}px`,
          width: '200px',
          maxHeight: 'calc(100vh - 120px)',
          overflowY: 'auto',
          background: dropdownBg,
          border: `1px solid ${dropdownBorder}`,
          borderRadius: '8px',
          padding: '12px',
          fontSize: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          zIndex: 90
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div 
              onMouseDown={handleTocMouseDown}
              style={{ 
                fontWeight: 'bold', 
                opacity: 0.8, 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px',
                cursor: 'grab',
                userSelect: 'none',
                flex: 1
              }}
              title="Drag to move"
            >
              <span style={{ fontSize: '14px' }}>📑</span> Table of Contents
            </div>
            <span title="Close TOC" onClick={() => updateConfig('showToc', false)} style={{ display: 'flex', cursor: 'pointer', opacity: 0.7 }}>
              <X size={14} />
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {headings.map(h => (
              <div 
                key={h.id} 
                style={{ 
                  paddingLeft: `${(h.level - 1) * 12}px`, 
                  cursor: 'pointer',
                  opacity: 0.7,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
                onClick={() => {
                  const el = document.querySelector(`[data-id="${h.id}"]`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
              >
                {h.text}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '4px 16px', backgroundColor: headerBg, borderBottom: `1px solid ${dropdownBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
        {!config.isReadOnly && (
          <>
            <div style={{ display: 'flex', borderRadius: '4px', overflow: 'hidden', border: `1px solid ${dropdownBorder}` }}>
              <button 
                onClick={() => { if (!isRawMode) toggleMode(); }} 
                style={{ 
                  padding: '2px 10px', 
                  cursor: 'pointer', 
                  border: 'none', 
                  borderRight: `1px solid ${dropdownBorder}`,
                  background: isRawMode ? textColor : 'transparent', 
                  color: isRawMode ? bgColor : textColor,
                  fontWeight: isRawMode ? 'bold' : 'normal',
                  fontSize: '12px'
                }}
              >
                Markdown
              </button>
              <button 
                onClick={() => { if (isRawMode) toggleMode(); }} 
                style={{ 
                  padding: '2px 10px', 
                  cursor: 'pointer', 
                  border: 'none', 
                  background: !isRawMode ? textColor : 'transparent', 
                  color: !isRawMode ? bgColor : textColor,
                  fontWeight: !isRawMode ? 'bold' : 'normal',
                  fontSize: '12px'
                }}
              >
                WYSIWYG
              </button>
            </div>
            {isRawMode && (
              <button
                onClick={() => {
                  if (!isDiffMode && originalText === null) {
                    vscode.postMessage({ type: 'getOriginalContent' });
                  }
                  setIsDiffMode(!isDiffMode);
                }}
                style={{
                  background: isDiffMode ? 'rgba(0, 150, 0, 0.2)' : 'transparent',
                  border: `1px solid ${dropdownBorder}`,
                  borderRadius: '4px',
                  color: textColor,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px 6px',
                  marginLeft: '8px'
                }}
                title="Toggle Git Diff View"
              >
                <GitCompare size={14} style={{ marginRight: '4px' }} />
                <span style={{ fontSize: '12px' }}>Diff</span>
              </button>
            )}
          </>
        )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {parsedFrontmatter && (
            <>
              <button 
                onClick={() => updateConfig('showToc', !showToc)} 
                style={{ background: 'transparent', border: 'none', color: textColor, cursor: 'pointer', opacity: showToc ? 1 : 0.5, display: 'flex', alignItems: 'center', padding: '4px' }}
                title="Toggle TOC"
              >
                <List size={16} />
              </button>
              <button 
                onClick={() => updateConfig('showProperties', !showProperties)} 
                style={{ background: 'transparent', border: 'none', color: textColor, cursor: 'pointer', opacity: showProperties ? 1 : 0.5, display: 'flex', alignItems: 'center', padding: '4px' }}
                title="Toggle Properties"
              >
                <Info size={16} />
              </button>
            </>
          )}
          <button 
            onClick={() => vscode.postMessage({ type: 'refresh' })}
            style={{ background: 'transparent', border: 'none', color: textColor, cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <div style={{ position: 'relative' }} ref={settingsRef}>
            <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: textColor,
                display: 'flex',
                alignItems: 'center',
                padding: '4px'
              }}
              title="Settings"
            >
              <Settings size={16} />
            </button>

          {isSettingsOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '6px',
              padding: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 1000,
              minWidth: '220px',
              color: textColor
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '14px' }}>Editor Settings</h3>
                <X size={16} cursor="pointer" onClick={() => setIsSettingsOpen(false)} />
              </div>
              
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', opacity: 0.8 }}>Theme</label>
                <select 
                  value={config.theme} 
                  onChange={(e) => updateConfig('theme', e.target.value)}
                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: `1px solid ${dropdownBorder}`, background: bgColor, color: textColor }}
                >
                  <option value="auto">Auto (Match VS Code)</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="nord">Nord (Cool frosty dark)</option>
                  <option value="one-half-dark">One Half Dark</option>
                  <option value="solarized-dark">Solarized Dark</option>
                  <option value="vintage">Vintage</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', opacity: 0.8 }}>Font Size</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button 
                    onClick={() => updateConfig('fontSize', Math.max(10, config.fontSize - 1))}
                    style={{ padding: '4px 8px', borderRadius: '4px', border: `1px solid ${dropdownBorder}`, background: bgColor, color: textColor, cursor: 'pointer' }}
                  >-</button>
                  <span style={{ flex: 1, textAlign: 'center', fontSize: '14px' }}>{config.fontSize}px</span>
                  <button 
                    onClick={() => updateConfig('fontSize', Math.min(32, config.fontSize + 1))}
                    style={{ padding: '4px 8px', borderRadius: '4px', border: `1px solid ${dropdownBorder}`, background: bgColor, color: textColor, cursor: 'pointer' }}
                  >+</button>
                </div>
              </div>

              <div style={{ marginTop: '12px', borderTop: `1px solid ${dropdownBorder}`, paddingTop: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', marginBottom: '8px' }}>
                  <input 
                    type="checkbox" 
                    checked={config.autoFix} 
                    onChange={(e) => updateConfig('autoFix', e.target.checked)}
                  />
                  <span>Auto Fix (Format on edit)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', marginBottom: '8px' }}>
                  <input 
                    type="checkbox" 
                    checked={config.autoRefresh} 
                    onChange={(e) => updateConfig('autoRefresh', e.target.checked)}
                  />
                  <span>Auto Refresh (Sync external changes)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', marginBottom: '8px' }}>
                  <input 
                    type="checkbox" 
                    checked={config.showToc} 
                    onChange={(e) => updateConfig('showToc', e.target.checked)}
                  />
                  <span>Show Table of Contents by default</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={config.showProperties} 
                    onChange={(e) => updateConfig('showProperties', e.target.checked)}
                  />
                  <span>Show Document Properties by default</span>
                </label>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
      
      <div 
        style={{ flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', fontSize: `${config.fontSize}px`, overflow: 'hidden' }}
        onKeyDownCapture={handleKeyDownCapture}
      >
        <style>{`
          /* Confluence Typography Base */
          .bn-editor { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
            font-size: ${config.fontSize}px; 
            background-color: transparent !important; 
          }
          
          /* Confluence Link Style */
          .bn-editor a {
            color: ${isDark ? '#579dff' : '#0052cc'} !important;
            text-decoration: none;
          }
          .bn-editor a:hover {
            text-decoration: underline;
          }
          
          .bn-container { color: ${textColor} !important; }
          .cm-content { padding: 16px 32px !important; }
          
          /* Custom Code Block Theme Colors */
          .bn-editor .bn-block-content[data-content-type="codeBlock"] {
            background-color: ${isDark ? codeBg : '#ebecf0'} !important;
            color: ${codeColor} !important;
            border-radius: 6px !important;
            border: 1px solid ${isDark ? '#333' : '#dfe1e6'} !important;
          }
          /* Override BlockNote default syntax highlighting background */
          .bn-editor .bn-block-content[data-content-type="codeBlock"] pre {
            background-color: transparent !important;
            padding: 8px !important;
            margin: 0 !important;
          }
          
          /* Floating Copy Button Style */
          .bn-floating-copy-btn {
            background-color: ${isDark ? '#333' : '#ffffff'} !important;
            color: ${isDark ? '#eee' : '#333'} !important;
            border: 1px solid ${isDark ? '#555' : '#ccc'} !important;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .bn-floating-copy-btn:hover {
            background-color: ${isDark ? '#444' : '#f0f0f0'} !important;
          }
          
          /* Uniform Bullet Icons */
          .bn-editor .bn-block-content[data-content-type="bulletListItem"]::before {
            font-family: "Segoe UI Symbol", "Apple Color Emoji", "Arial", sans-serif !important;
            font-size: 0.7em !important;
            transform: translateY(0.2em);
          }
          
          /* Level 1: Solid Circle */
          .bn-editor .bn-block-outer:not([data-prev-type]) > .bn-block > .bn-block-content[data-content-type="bulletListItem"]::before,
          .bn-editor .bn-block-outer[data-prev-type="bulletListItem"] > .bn-block > .bn-block-content::before,
          .bn-editor .bn-block-outer:not([data-prev-type]) > .bn-block > div[data-type="modification"] > .bn-block-content[data-content-type="bulletListItem"]::before {
            content: "●" !important;
          }
          
          /* Level 2: Hollow Circle */
          .bn-editor [data-content-type="bulletListItem"] ~ .bn-block-group > .bn-block-outer[data-prev-type="bulletListItem"] > .bn-block > .bn-block-content::before,
          .bn-editor [data-content-type="bulletListItem"] ~ .bn-block-group > .bn-block-outer:not([data-prev-type]) > .bn-block > .bn-block-content[data-content-type="bulletListItem"]::before,
          .bn-editor [data-content-type="bulletListItem"] ~ .bn-block-group > .bn-block-outer:not([data-prev-type]) > .bn-block > div[data-type="modification"] > .bn-block-content[data-content-type="bulletListItem"]::before {
            content: "○" !important;
            font-size: 0.85em !important; /* Hollow circle usually looks slightly smaller */
          }
          
          /* Level 3: Solid Square */
          .bn-editor [data-content-type="bulletListItem"] ~ .bn-block-group [data-content-type="bulletListItem"] ~ .bn-block-group > .bn-block-outer[data-prev-type="bulletListItem"] > .bn-block > .bn-block-content::before,
          .bn-editor [data-content-type="bulletListItem"] ~ .bn-block-group [data-content-type="bulletListItem"] ~ .bn-block-group > .bn-block-outer:not([data-prev-type]) > .bn-block > .bn-block-content[data-content-type="bulletListItem"]::before,
          .bn-editor [data-content-type="bulletListItem"] ~ .bn-block-group [data-content-type="bulletListItem"] ~ .bn-block-group > .bn-block-outer:not([data-prev-type]) > .bn-block > div[data-type="modification"] > .bn-block-content[data-content-type="bulletListItem"]::before {
            content: "■" !important;
          }
          
          /* Global Block Spacing Reduction - Aggressive Zero Gap */
          .bn-editor .bn-block-outer,
          .bn-editor .bn-block-group,
          .bn-editor .bn-block,
          .bn-editor .bn-block-content,
          .bn-editor p,
          .bn-editor h1, .bn-editor h2, .bn-editor h3, .bn-editor h4, .bn-editor h5, .bn-editor h6,
          .bn-editor ul, .bn-editor ol, .bn-editor li,
          .bn-editor [data-content-type="heading"],
          .bn-editor .bn-inline-content {
            margin-top: 0 !important;
            margin-bottom: 0 !important;
            padding-top: 0 !important;
            padding-bottom: 0 !important;
          }
          
          /* Heading Specific Margins (Override Zero Gap) */
          .bn-editor h1, .bn-editor [data-content-type="heading"][data-level="1"] {
            margin-top: 0.8cm !important;
            margin-bottom: 0.5em !important;
          }
          .bn-editor h2, .bn-editor [data-content-type="heading"][data-level="2"] {
            margin-top: 0.8cm !important;
            margin-bottom: 0.4em !important;
          }
          .bn-editor h3, .bn-editor [data-content-type="heading"][data-level="3"] {
            margin-top: 0.8cm !important;
            margin-bottom: 0.3em !important;
          }
          .bn-editor h4, .bn-editor h5, .bn-editor h6,
          .bn-editor [data-content-type="heading"][data-level="4"],
          .bn-editor [data-content-type="heading"][data-level="5"],
          .bn-editor [data-content-type="heading"][data-level="6"] {
            margin-top: 0.25cm !important;
            margin-bottom: 0.15em !important;
          }

          /* Remove spacing between consecutive headings */
          .bn-editor .bn-block-outer:has([data-content-type="heading"]) + .bn-block-outer:has([data-content-type="heading"]) [data-content-type="heading"] {
            margin-top: 0 !important;
          }

          /* Code Block Margins */
          .bn-editor .bn-block-outer:has([data-content-type="codeBlock"]) {
            margin-top: 0.25cm !important;
            margin-bottom: 0.25cm !important;
          }

          /* Table Styles Enhancement */
          /* 1. Target the table block itself */
          .bn-editor .bn-block-outer:has([data-content-type="table"]),
          .bn-editor .bn-block-outer:has([data-content-type="table"]) .bn-block,
          .bn-editor .bn-block-outer:has([data-content-type="table"]) .bn-block-content {
            padding-top: 0 !important;
            padding-bottom: 0 !important;
            margin-top: 0 !important;
            margin-bottom: 0 !important;
          }
          /* 2. Target the block BEFORE the table */
          .bn-editor .bn-block-outer:has(+ .bn-block-outer [data-content-type="table"]),
          .bn-editor .bn-block-outer:has(+ .bn-block-outer [data-content-type="table"]) .bn-block,
          .bn-editor .bn-block-outer:has(+ .bn-block-outer [data-content-type="table"]) .bn-block-content {
            padding-bottom: 0 !important;
            margin-bottom: 0 !important;
          }
          /* 3. Target the block AFTER the table */
          .bn-editor .bn-block-outer:has([data-content-type="table"]) + .bn-block-outer,
          .bn-editor .bn-block-outer:has([data-content-type="table"]) + .bn-block-outer .bn-block,
          .bn-editor .bn-block-outer:has([data-content-type="table"]) + .bn-block-outer .bn-block-content {
            padding-top: 0 !important;
            margin-top: 0 !important;
          }
          .bn-editor [data-content-type="table"] {
            margin: 0 !important;
            padding: 0 !important;
            overflow-x: auto;
            line-height: 1.2 !important;
          }
          .bn-editor [data-content-type="table"] table {
            border-collapse: collapse !important;
            min-width: 100% !important;
            border: 1px solid ${dropdownBorder} !important;
            margin: 0 !important;
          }
          .bn-editor [data-content-type="table"] th {
            background-color: ${isDark ? '#22272b' : '#f4f5f7'} !important;
            color: ${isDark ? '#b6c2cf' : '#172b4d'} !important;
            font-weight: 600 !important;
          }
          .bn-editor [data-content-type="table"] td, 
          .bn-editor [data-content-type="table"] th {
            border: 1px solid ${isDark ? '#a6c5e229' : '#dfe1e6'} !important;
            padding: 2px 6px !important;
            min-width: 100px;
          }
          
          /* Blockquote Styles (Confluence) */
          .bn-editor [data-content-type="blockQuote"] {
            background-color: ${isDark ? 'rgba(87, 157, 255, 0.05)' : 'rgba(0, 82, 204, 0.03)'} !important;
            border-left: 3px solid ${isDark ? '#579dff' : '#0052cc'} !important;
            padding: 4px 12px !important;
            color: ${isDark ? '#8c9bab' : '#172b4d'} !important;
            border-radius: 0 4px 4px 0 !important;
          }
          /* Ensure child div doesn't add an extra black border */
          .bn-editor [data-content-type="blockQuote"] > div {
            border-left: none !important;
            padding-left: 0 !important;
          }
          
          /* Inline Code Styles (Confluence) */
          .bn-editor code, .bn-editor [data-inline-style="code"] {
            background-color: ${isDark ? 'rgba(166, 197, 226, 0.16)' : '#ebecf0'} !important;
            padding: 2px 4px !important;
            border-radius: 3px !important;
            font-family: Consolas, 'Courier New', monospace !important;
            font-size: 0.9em !important;
            color: ${isDark ? '#b6c2cf' : '#172b4d'} !important;
            border: none !important;
            box-shadow: none !important;
          }
          .bn-editor [data-content-type="table"] tr {
            transition: background-color 0.1s ease;
          }
          .bn-editor [data-content-type="table"] tr:hover {
            background-color: ${isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'} !important;
          }
        `}</style>
        {isRawMode ? (
          isDiffMode ? (
            originalText === null ? (
              <div style={{ padding: '20px', fontFamily: 'monospace', color: textColor, opacity: 0.7 }}>Loading Git HEAD...</div>
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }} className="cm-merge-container">
                <CodeMirrorMerge orientation="a-b" className="cm-merge-root" theme={cmTheme}>
                  <Original
                    value={originalText}
                    extensions={[markdown({ base: markdownLanguage, codeLanguages: codeLanguages }), EditorView.lineWrapping, EditorState.readOnly.of(true)]}
                  />
                  <Modified
                    value={documentText as string}
                    extensions={[markdown({ base: markdownLanguage, codeLanguages: codeLanguages }), EditorView.lineWrapping]}
                    onChange={(val) => {
                      setDocumentText(val);
                      postChange(val);
                    }}
                  />
                </CodeMirrorMerge>
                <style>{`
                  .cm-merge-root { flex: 1; height: 100%; overflow: hidden; display: flex; }
                  .cm-merge-theme { flex: 1; display: flex; height: 100%; min-height: 0; }
                  .cm-merge-container .cm-editor { height: 100%; flex: 1; font-family: Consolas, 'Courier New', monospace; font-size: inherit; }
                  .cm-merge-container .cm-scroller { overflow: auto !important; height: 100%; }
                  /* Scrollbar & Layout Fixes */
                  .cm-merge-container .cm-scroller { overflow-y: scroll !important; overflow-x: auto !important; height: 100%; }
                  .cm-merge-root { overflow: hidden !important; }
                  /* Make lines transparent so CodeMirror merge background highlights can be seen */
                  .cm-merge-container .cm-line { background-color: transparent !important; }
                  /* Diff Highlight Colors */
                  .cm-merge-a .cm-changedLine, .cm-deletedLine, .cm-deletedChunk { background-color: ${isDark ? 'rgba(255, 80, 80, 0.2)' : 'rgba(255, 0, 0, 0.15)'} !important; }
                  .cm-merge-b .cm-changedLine, .cm-insertedLine, .cm-insertedChunk { background-color: ${isDark ? 'rgba(80, 255, 80, 0.2)' : 'rgba(0, 255, 0, 0.15)'} !important; }
                  .cm-deletedText, .cm-merge-a .cm-changedText { background-color: ${isDark ? 'rgba(255, 80, 80, 0.4)' : 'rgba(255, 0, 0, 0.3)'} !important; }
                  .cm-insertedText, .cm-merge-b .cm-changedText { background-color: ${isDark ? 'rgba(80, 255, 80, 0.4)' : 'rgba(0, 255, 0, 0.3)'} !important; }
                `}</style>
              </div>
            )
          ) : (
            <CodeMirror
              value={documentText as string}
              extensions={[markdown({ base: markdownLanguage, codeLanguages: codeLanguages }), EditorView.lineWrapping]}
              onChange={(val) => {
                setDocumentText(val);
                postChange(val);
              }}
              onCreateEditor={(view: any) => {
                cmViewRef.current = view;
                // WYSIWYG에서 기억한 헤딩 위치로 스크롤 복원
                const target = pendingHeadingRef.current;
                if (target && typeof documentText === 'string') {
                  pendingHeadingRef.current = null;
                  const lines = (documentText as string).split('\n');
                  let pos = 0;
                  for (const line of lines) {
                    const m = line.match(/^#{1,6}\s+(.+)/);
                    if (m && m[1].trim() === target) {
                      setTimeout(() => {
                        try { view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start' }) }); } catch { /* noop */ }
                      }, 50);
                      break;
                    }
                    pos += line.length + 1;
                  }
                }
              }}
              theme={cmTheme}
              style={{
                width: '100%',
                height: '100%',
                fontSize: 'inherit',
                fontFamily: "Consolas, 'Courier New', monospace"
              }}
              height="100%"
            />
          )
        ) : (
          <div
            ref={scrollRef}
            style={{ flex: 1, overflow: 'auto' }}
            onScroll={(e) => {
              const top = e.currentTarget.scrollTop;
              if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
              scrollSaveTimer.current = setTimeout(() => vscode.updateState({ scrollTop: top }), 200);
            }}
          >
            <div style={{ padding: '16px 32px' }}>
              {renderFrontmatterUI()}
              {editor && <BlockNoteView editor={editor} onChange={handleWysiwygChange} theme={blockNoteTheme} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
