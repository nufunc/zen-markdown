import { useEffect, useState, useRef, useMemo } from 'react';
import { BlockNoteEditor, BlockNoteSchema, defaultBlockSpecs, createCodeBlockSpec } from '@blocknote/core';
import { MermaidBlock } from './MermaidBlock';
import { createShikiHighlighter, supportedLanguages } from './shikiHighlighter';
import { processBlocksFromMarkdown, processBlocksToMarkdown, sanitizeMarkdownCodeBlocks, preserveMarkdownLineBreaks, preserveBlankLines, restoreBlankLines, toWebviewImageUrls, fromWebviewImageUrls, extractFrontmatter, detectBrokenImageLinks, parseTableFromClipboardText, parseWikilinks, serializeWikilinks, extractTagsFromMarkdown, normalizeOrderedListNumbers, normalizeUnorderedListBullets, preserveEmptyHeadings } from './markdownTransforms';
import { formatCodeBlock } from './codeFormatter';
import { resolveTheme } from './themes';
import { buildEditorStyles } from './editorStyles';
import { FrontmatterPanel } from './FrontmatterPanel';
import { CodeBlockMenu } from './CodeBlockMenu';
import { useDebouncedCallback } from './hooks/useDebounceCallback';

// 기본 코드 언어 설정(neatMdEditor.defaultCodeLanguage)을 반영하기 위해
// 스키마는 모듈 상수가 아니라 에디터 생성 시점에 만든다
const buildSchema = (defaultCodeLanguage: string) => BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec({
      indentLineWithTab: true,
      defaultLanguage: defaultCodeLanguage || 'text',
      supportedLanguages,
      createHighlighter: createShikiHighlighter as any,
    }),
    mermaid: MermaidBlock(),
  },
});

const insertDateItem = (editor: any) => ({
  title: "Insert Date",
  onItemClick: () => {
    const now = new Date();
    const dateString = now.toLocaleString();
    editor.insertBlocks(
      [
        {
          type: "paragraph",
          content: dateString,
        },
      ],
      editor.getTextCursorPosition().block,
      "after"
    );
  },
  aliases: ["date", "time", "now"],
  group: "Utilities",
  icon: <span style={{ fontSize: '16px' }}>📅</span>,
  subtext: "Insert current date and time",
});

const insertMermaidItem = (editor: any) => ({
  title: "Mermaid Diagram",
  onItemClick: () => {
    editor.insertBlocks(
      [
        {
          type: "mermaid",
          props: {
            code: "graph TD;\n    A-->B;\n    A-->C;\n    B-->D;\n    C-->D;"
          }
        },
      ],
      editor.getTextCursorPosition().block,
      "after"
    );
  },
  aliases: ["mermaid", "flowchart", "diagram"],
  group: "Advanced",
  icon: <span style={{ fontSize: '16px' }}>📈</span>,
  subtext: "Insert a Mermaid flowchart",
});

const insertCalloutItem = (editor: any) => ({
  title: "Callout / Tip",
  onItemClick: () => {
    editor.insertBlocks(
      [
        {
          type: "quote",
          content: "💡 **Tip**: ",
        },
      ],
      editor.getTextCursorPosition().block,
      "after"
    );
  },
  aliases: ["callout", "tip", "info", "warning"],
  group: "Advanced",
  icon: <span style={{ fontSize: '16px' }}>💡</span>,
  subtext: "Insert a highlighted callout block",
});

import { BlockNoteView } from '@blocknote/mantine';
import { SuggestionMenuController, getDefaultReactSlashMenuItems } from '@blocknote/react';
import { Settings, X, Info, ChevronDown, ChevronUp, Search, List, RefreshCw, GitCompare, ExternalLink, AlertTriangle, Bold, Italic, Strikethrough, ListOrdered, CheckSquare, Quote, Link, Image as ImageIcon, Code, Edit3, Pilcrow, Printer } from 'lucide-react';
import YAML from 'yaml';
import '@blocknote/mantine/style.css';
import { vscode } from './vscode';
import CodeMirror from '@uiw/react-codemirror';
import CodeMirrorMerge from 'react-codemirror-merge';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { codeLanguages } from './codeLanguages';
import { EditorView } from 'codemirror';
import { EditorState } from '@codemirror/state';

const { Original, Modified } = CodeMirrorMerge;

const isEditorElement = (el: Element | null): boolean => {
  if (!el) return false;
  return !!el.closest('.bn-editor, .ProseMirror, .bn-container, .mantine-Menu-dropdown, .mantine-Popover-dropdown, .mantine-Select-dropdown, [role="menu"], [role="dialog"]');
};

function formatDocPath(rawUri: string): string {
  if (!rawUri) return 'document.md';
  try {
    let decoded = decodeURIComponent(rawUri);
    decoded = decoded.replace(/^https?:\/\/[^/]+\//i, '');
    decoded = decoded.replace(/^file:\/\/\//i, '');
    decoded = decoded.replace(/^file:\/\//i, '');
    if (/^[a-z]:/i.test(decoded)) {
      decoded = decoded.charAt(0).toUpperCase() + decoded.slice(1);
    }
    return decoded;
  } catch {
    return rawUri;
  }
}

function App() {
  const [documentText, setDocumentText] = useState<string | "loading">("loading");
  const [config, setConfig] = useState<{ theme: string, fontSize: number, autoFix: boolean, autoRefresh: boolean, showToc: boolean, showProperties: boolean, isReadOnly: boolean, defaultCodeLanguage: string }>({ theme: "auto", fontSize: 16, autoFix: false, autoRefresh: true, showToc: false, showProperties: false, isReadOnly: false, defaultCodeLanguage: 'text' });
  // 에디터 생성 시점(비동기)에 최신 설정을 읽기 위한 ref
  const configRef = useRef(config);
  configRef.current = config;
  // 코드블록 케밥(⋮) 메뉴 상태
  const [codeMenu, setCodeMenu] = useState<{ blockId: string, x: number, y: number } | null>(null);
  const [isRawMode, setIsRawMode] = useState(() => !!(vscode.getState()?.isRawMode));
  const [isDiffMode, setIsDiffMode] = useState(false);
  const [originalText, setOriginalText] = useState<string | null>(null);
  const [editor, setEditor] = useState<any>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [parsedFrontmatter, setParsedFrontmatter] = useState<string>("");
  const [fmData, setFmData] = useState<Record<string, any> | null>(null);
  const [fmCollapsed, setFmCollapsed] = useState(false);
  const [showSearchReplace, setShowSearchReplace] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [headings, setHeadings] = useState<{id: string, text: string, level: number}[]>([]);
  const showToc = config.showToc;
  const showProperties = config.showProperties;
  
  const settingsRef = useRef<HTMLDivElement>(null);
  const hasEdited = useRef(false);
  const lastEditTimeRef = useRef(0);
  const lastUndoTimeRef = useRef(0);
  const isInitializing = useRef(false);
  // 호스트로 마지막에 보낸 전체 텍스트 — external_update가 자기 편집의 반사인지 판별용
  const lastSentTextRef = useRef<string>("");
  // 에디터에 마지막으로 반영한 documentText — setEditor로 인한 이펙트 재실행 시 이중 파싱 방지
  const lastInitializedTextRef = useRef<string | null>(null);
  const docBaseUriRef = useRef<string>("");
  const pendingUploads = useRef<Map<string, (v: { relPath?: string, error?: string }) => void>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRestoredScroll = useRef(false);
  const cmViewRef = useRef<any>(null);
  const pendingHeadingRef = useRef<string | null>(null);
  const pendingExternalUpdateRef = useRef<string | null>(null);

  useEffect(() => {
    const handleFocusOut = (e: FocusEvent) => {
      const isEditorBlurred = !isEditorElement(e.relatedTarget as Element);
      if (isEditorBlurred && pendingExternalUpdateRef.current !== null) {
        setDocumentText(pendingExternalUpdateRef.current);
        pendingExternalUpdateRef.current = null;
      }
    };
    document.addEventListener('focusout', handleFocusOut);
    return () => document.removeEventListener('focusout', handleFocusOut);
  }, []);

  // 글로벌 Drag & Drop 이벤트 (이미지 드롭 시 Base64로 호스트에 저장 후 삽입)
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = async (e: DragEvent) => {
      if (isRawMode || !editor) return;
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      if (!file.type.startsWith('image/')) return;

      e.preventDefault();
      e.stopPropagation();

      try {
        const url = await uploadFile(file);
        // 드롭된 위치 혹은 현재 커서 위치에 이미지 삽입
        const cursor = editor.getTextCursorPosition();
        if (cursor && cursor.block) {
          editor.insertBlocks(
            [{ type: 'paragraph', content: [{ type: 'text', text: `![${file.name || 'image'}](${url})`, styles: {} }] }],
            cursor.block,
            'after'
          );
          editor.focus();
        }
      } catch (err) {
        console.error('Drag & drop image save failed', err);
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [isRawMode, editor]);

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
            isReadOnly: message.isReadOnly,
            defaultCodeLanguage: message.defaultCodeLanguage || 'text'
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
        case 'external_update': {
          const incoming = message.text || "";
          // 호스트가 이미 내용 비교로 echo를 걸러 보내므로 여기 오는 것은 대부분 진짜 외부 변경.
          // 단, 적용 실패 재동기화 등으로 자기 편집이 되돌아온 경우는 무시.
          const incomingNormalized = incoming.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
          const lastSentNormalized = lastSentTextRef.current.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
          if (incomingNormalized === lastSentNormalized) return;
          
          // 위지윅 에디터 포커스 여부와 최근 로컬 편집 여부 검사
          const isEditorFocused = isEditorElement(document.activeElement);
          const isRecentlyEdited = (Date.now() - lastEditTimeRef.current) < 2000;
          const isUndoing = (Date.now() - lastUndoTimeRef.current) < 1000;
          if (!isUndoing && (isEditorFocused || isRecentlyEdited) && documentText !== "loading") {
            pendingExternalUpdateRef.current = incoming;
            return;
          }

          // 진행 중인 로컬 debounce는 이전 문서 기준의 stale 상태이므로 취소하고 외부 내용 채택
          debouncedWysiwygSerialize.cancel();
          postChange.cancel();
          setDocumentText(incoming);
          break;
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // 클립보드 엑셀/TSV/CSV 붙여넣기 시 마크다운 표 자동 변환 생성
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (isRawMode || !editor) return;
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;

      const tableMd = parseTableFromClipboardText(text);
      if (tableMd) {
        e.preventDefault();
        try {
          const blocks = await editor.tryParseMarkdownToBlocks(tableMd);
          if (blocks && blocks.length > 0) {
            const cur = editor.getTextCursorPosition();
            if (cur && cur.block) {
              const isBlockEmpty = !cur.block.content || (Array.isArray(cur.block.content) && cur.block.content.every((c: any) => c.type === 'text' && !c.text));
              if (isBlockEmpty && cur.block.type === 'paragraph') {
                editor.replaceBlocks([cur.block], blocks);
              } else {
                editor.insertBlocks(blocks, cur.block, 'after');
              }
            }
          }
        } catch (err) {
          console.error('Failed to parse TSV/CSV table paste', err);
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isRawMode, editor]);

  // 코드블록 호버 시 Copy/Format 플로팅 버튼.
  // Format은 명시적 클릭 시에만 실행 — 커서 이탈 시 자동 재인덴트는 문자열/주석 안의
  // 중괄호를 오판해 사용자가 의도한 들여쓰기를 훼손할 수 있어 제거함.
  // 코드블록 호버 시 Copy 플로팅 버튼
  useEffect(() => {
    if (isRawMode) return;

    let hoverTarget: HTMLElement | null = null;
    let timeoutId: any = null;

    // 고정 SVG 문자열 — 이모지 대신 라인 아이콘으로 (사용자 입력 미포함이라 innerHTML 안전)
    const COPY_LABEL = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span>Copy</span>';
    const COPIED_LABEL = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span>Copied</span>';

    const makeFloatingBtn = (className: string, html: string) => {
      const btn = document.createElement('button');
      btn.className = className;
      btn.innerHTML = html;
      btn.style.position = 'absolute';
      btn.style.cursor = 'pointer';
      btn.style.opacity = '0';
      btn.style.pointerEvents = 'none';
      btn.style.transition = 'opacity 0.2s';
      btn.style.zIndex = '1000';
      // 오른쪽 끝 기준 정렬 — 라벨 길이가 달라져도 위치가 흔들리지 않음
      btn.style.transform = 'translateX(-100%)';
      document.body.appendChild(btn);
      return btn;
    };

    const copyBtn = makeFloatingBtn('bn-floating-copy-btn', COPY_LABEL);
    // 케밥(⋮) — 복사/잘라내기/삭제/언어 메뉴 트리거
    const KEBAB_LABEL = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
    const menuBtn = makeFloatingBtn('bn-floating-copy-btn bn-floating-menu-btn', KEBAB_LABEL);

    const buttons = [copyBtn, menuBtn];

    const resetCopyBtn = () => {
      copyBtn.innerHTML = COPY_LABEL;
      copyBtn.classList.remove('copied');
    };

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const codeBlock = target.closest('.bn-block-content[data-content-type="codeBlock"]') as HTMLElement;

      if (codeBlock) {
        hoverTarget = codeBlock;
        const rect = codeBlock.getBoundingClientRect();
        menuBtn.style.top = `${rect.top + window.scrollY + 8}px`;
        menuBtn.style.left = `${rect.right + window.scrollX - 10}px`;
        copyBtn.style.top = `${rect.top + window.scrollY + 8}px`;
        copyBtn.style.left = `${rect.right + window.scrollX - 42}px`;
        for (const b of buttons) {
          b.style.opacity = '1';
          b.style.pointerEvents = 'auto';
        }
        clearTimeout(timeoutId);
      } else {
        if (!buttons.some(b => b === target || b.contains(target))) {
          timeoutId = setTimeout(() => {
            for (const b of buttons) {
              b.style.opacity = '0';
              b.style.pointerEvents = 'none';
            }
            hoverTarget = null;
            resetCopyBtn();
          }, 100);
        }
      }
    };

    copyBtn.onclick = () => {
      if (hoverTarget) {
        const pre = hoverTarget.querySelector('pre');
        if (pre) {
          navigator.clipboard.writeText(pre.innerText);
          copyBtn.innerHTML = COPIED_LABEL;
          copyBtn.classList.add('copied');
          setTimeout(resetCopyBtn, 1800);
        }
      }
    };

    menuBtn.onclick = () => {
      if (!hoverTarget) return;
      const id = (hoverTarget.closest('[data-id]') as HTMLElement | null)?.getAttribute('data-id');
      if (!id) return;
      const r = menuBtn.getBoundingClientRect();
      setCodeMenu({ blockId: id, x: r.right, y: r.bottom + 6 });
    };

    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      for (const b of buttons) {
        if (document.body.contains(b)) {
          document.body.removeChild(b);
        }
      }
    };
  }, [isRawMode]);

  // 커서가 코드블록을 떠날 때 prettier로 자동 포맷.
  // 지원 언어(js/ts/json/css/html/yaml)만 대상이고, 문법 오류나 미지원 언어는 원본 유지.
  const activeCodeBlockIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (isRawMode || !editor) return;

    const handleSelectionChange = () => {
      try {
        const cursor = editor.getTextCursorPosition();
        const currentBlockId = cursor?.block?.id || null;
        const currentBlockType = cursor?.block?.type || null;

        if (activeCodeBlockIdRef.current && activeCodeBlockIdRef.current !== currentBlockId) {
          const prevBlockId = activeCodeBlockIdRef.current;
          const prevBlock = editor.getBlock(prevBlockId);
          if (prevBlock && prevBlock.type === 'codeBlock') {
            const text = prevBlock.content?.map((c: any) => c.text || '').join('') || '';
            const lang = prevBlock.props?.language || '';
            formatCodeBlock(text, lang).then(formatted => {
              if (formatted === null || formatted === text) return;
              // 비동기 완료 시점에 블록이 여전히 존재하고 내용이 그대로일 때만 반영
              const stillThere = editor.getBlock(prevBlockId);
              if (!stillThere || stillThere.type !== 'codeBlock') return;
              const currentText = stillThere.content?.map((c: any) => c.text || '').join('') || '';
              if (currentText !== text) return;
              editor.updateBlock(prevBlockId, { content: [{ type: 'text', text: formatted, styles: {} }] });
            }).catch(() => { /* noop */ });
          }
        }

        activeCodeBlockIdRef.current = currentBlockType === 'codeBlock' ? currentBlockId : null;
      } catch { /* noop */ }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [isRawMode, editor]);

  // 가벼운 정규식 기반 언어 자동 인식기 (4개 언어 한정 - 비용 거의 0)
  const detectLanguage = (text: string): string | null => {
    // 텍스트가 매우 길 경우 첫 500자만 검사하여 정규식 부하를 방지
    const t = text.length > 500 ? text.slice(0, 500).trim() : text.trim();
    if (!t) return null;
    
    // 1. JSON
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { JSON.parse(t); return 'json'; } catch {}
    }
    // 2. PowerShell
    if (/\\b(Get|Set|Invoke|New|Remove|Start|Stop|Out)-[A-Z][a-zA-Z]+\\b/.test(t) || /\\$(null|true|false|_)\\b/.test(t)) {
      return 'powershell';
    }
    // 3. Bash/Shell (shebang, 널리 쓰이는 CLI 커맨드 - az cli, npm, git 등 포함)
    if (t.startsWith('#!/bin/') || /^\s*(sudo|systemctl|service|apt-get|dpkg|npm|npx|yarn|pnpm|git|node|python|pip|brew|apt|yum|kubectl|az|helm|docker|ls|grep|awk|sed|cat|echo|export|curl|cd|mkdir|rm|mv|cp)\b/m.test(t)) {
      return 'shellscript';
    }
    // 4. YAML (JSON이 아니면서 key: value 패턴이 2줄 이상이거나 --- 시작)
    if (t.startsWith('---')) return 'yaml';
    const yamlLines = t.split('\\n').filter(l => /^[a-zA-Z0-9_-]+\\s*:\\s*.+/.test(l));
    if (yamlLines.length >= 2 && !t.includes('{')) return 'yaml';
    // 5. KQL (Azure Kusto Query Language)
    if (/^\\s*(let|search|where|summarize|project|join|extend|parse|evaluate|print)\\b/im.test(t) && t.includes('|')) {
      return 'kql';
    }
    
    return null;
  };

  const extractHeadings = (editorInstance: any) => {
    const newHeadings: {id: string, text: string, level: number}[] = [];
    editorInstance.forEachBlock((b: any) => {
      if (b.type === 'heading') {
        const text = b.content?.map((c: any) => c.text || c.content?.map((cc:any)=>cc.text).join('') || '').join('') || '';
        if (text.trim()) {
          newHeadings.push({ id: b.id, text, level: b.props.level });
        }
      }
      // 언어가 'text'인 코드블록 자동 인식 적용
      if (b.type === 'codeBlock' && (!b.props.language || b.props.language === 'text')) {
        const codeText = b.content?.map((c: any) => c.text || '').join('') || '';
        const detected = detectLanguage(codeText);
        if (detected) {
          editorInstance.updateBlock(b.id, { props: { ...b.props, language: detected } });
        }
      }
      return true;
    });
    // 내용이 같으면 같은 참조를 유지해 매 키입력마다의 전체 리렌더를 방지
    setHeadings(prev => {
      if (prev.length === newHeadings.length &&
          prev.every((h, i) => h.id === newHeadings[i].id && h.text === newHeadings[i].text && h.level === newHeadings[i].level)) {
        return prev;
      }
      return newHeadings;
    });
  };

  // Shiki 지연 로딩 완료 시 해당 언어를 사용하는 코드블록 강제 재렌더링
  useEffect(() => {
    const handleShikiLoaded = ((e: CustomEvent<string>) => {
      if (!editor) return;
      const lang = e.detail;
      editor.forEachBlock((b: any) => {
        if (b.type === 'codeBlock' && b.props.language === lang) {
           editor.updateBlock(b.id, { props: { ...b.props } });
        }
        return true;
      });
    }) as EventListener;
    window.addEventListener('shiki-lang-loaded', handleShikiLoaded);
    return () => window.removeEventListener('shiki-lang-loaded', handleShikiLoaded);
  }, [editor]);

  useEffect(() => {
    async function initEditor() {
      if (documentText !== "loading" && !isRawMode) {
        // setEditor로 인한 이펙트 재실행에서 같은 내용을 다시 파싱하지 않음
        // (이중 파싱 + undo 스택에 replaceBlocks 중복 적재 방지)
        if (editor && lastInitializedTextRef.current === documentText) {
          return;
        }
        lastInitializedTextRef.current = documentText;
        const { frontmatter, content } = extractFrontmatter(documentText);
        setParsedFrontmatter(frontmatter);
        try {
          if (frontmatter) setFmData(YAML.parse(frontmatter));
        } catch {
          setFmData(null);
        }
        const normalizedContent = content.replace(/\r\n/g, '\n');
        const safeContent = preserveEmptyHeadings(parseWikilinks(preserveMarkdownLineBreaks(sanitizeMarkdownCodeBlocks(
          preserveBlankLines(toWebviewImageUrls(normalizedContent, docBaseUriRef.current))
        ))));

        isInitializing.current = true;
        if (!editor) {
          const newEditor = BlockNoteEditor.create({ schema: buildSchema(configRef.current.defaultCodeLanguage), uploadFile });
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
          // External update or refresh: replace existing blocks.
          // replaceBlocks는 커서를 문서 끝으로 보내므로, 블록 인덱스 기준으로 복원
          // (블록 id는 재파싱 시 재생성되어 id로는 복원 불가)
          let cursorIdx = -1;
          try {
            const cur = editor.getTextCursorPosition();
            cursorIdx = editor.document.findIndex((b: any) => b.id === cur?.block?.id);
          } catch { /* noop */ }
          let blocks = await editor.tryParseMarkdownToBlocks(safeContent);
          blocks = processBlocksFromMarkdown(blocks);
          editor.replaceBlocks(editor.document, blocks);
          extractHeadings(editor);
          if (cursorIdx >= 0) {
            try {
              const doc = editor.document;
              const target = doc[Math.min(cursorIdx, doc.length - 1)];
              if (target) editor.setTextCursorPosition(target, 'start');
            } catch { /* noop */ }
          }
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

  // 매 키입력마다 전체 문서를 교체하지 않도록 300ms 디바운스
  const postChange = useDebouncedCallback((text: string) => {
    lastSentTextRef.current = text;
    vscode.postMessage({ type: 'change', text });
  }, 300);

  const debouncedWysiwygSerialize = useDebouncedCallback(async () => {
    if (!editor) return;
    extractHeadings(editor);
    try {
      const markdown = await generateMarkdownFromEditor(true);
      
      // Phase 2: Tag Sync
      const extractedTags = extractTagsFromMarkdown(markdown);
      let updatedFmString = parsedFrontmatter;
      
      if (extractedTags.length > 0) {
        setFmData(prev => {
          const currentTags = prev?.tags || [];
          const newTags = Array.from(new Set([...currentTags, ...extractedTags]));
          
          if (newTags.length !== currentTags.length) {
            const newData = { ...(prev || { title: '', date: '' }), tags: newTags };
            updatedFmString = YAML.stringify(newData).trim();
            setParsedFrontmatter(updatedFmString);
            return newData;
          }
          return prev;
        });
      }

      const fullText = updatedFmString ? `---\n${updatedFmString}\n---\n${markdown}` : markdown;
      lastSentTextRef.current = fullText;
      vscode.postMessage({ type: 'change', text: fullText });
    } catch (err) {
      console.error('Failed to serialize document', err);
    }
  }, 600);

  const saveToHost = (fmString: string, mdString: string) => {
    const fullText = fmString ? `---\n${fmString}\n---\n${mdString}` : mdString;
    postChange(fullText);
  };

  const generateMarkdownFromEditor = async (skipAutoFix = false) => {
    if (!editor) return "";
    const blocksForMd = processBlocksToMarkdown(editor.document);
    let markdown = await editor.blocksToMarkdownLossy(blocksForMd as any);
    


    markdown = normalizeOrderedListNumbers(markdown);
    markdown = normalizeUnorderedListBullets(markdown);
    markdown = preserveMarkdownLineBreaks(sanitizeMarkdownCodeBlocks(markdown));
    
    if (config.autoFix && !skipAutoFix) {
      try {
        const prettier = await import('prettier/standalone');
        const prettierPluginMarkdown = await import('prettier/plugins/markdown');
        markdown = await prettier.format(markdown, { parser: "markdown", plugins: [prettierPluginMarkdown.default || prettierPluginMarkdown] });
      } catch (e) {
        console.error("Auto fix formatting failed", e);
      }
    }
    
    return serializeWikilinks(preserveEmptyHeadings(restoreBlankLines(fromWebviewImageUrls(markdown, docBaseUriRef.current))));
  };

  const handleWysiwygChange = () => {
    if (!editor || isInitializing.current) return;
    hasEdited.current = true;
    lastEditTimeRef.current = Date.now();
    debouncedWysiwygSerialize();

    // Scroll cursor into view when editing (especially on line breaks)
    setTimeout(() => {
      try {
        const cursor = editor.getTextCursorPosition();
        if (cursor && cursor.block) {
          const blockElement = document.querySelector(`[data-id="${cursor.block.id}"]`);
          if (blockElement) {
            blockElement.scrollIntoView({ block: 'nearest', behavior: 'auto' });
          }
        }
      } catch {
        // Ignored
      }
    }, 10);
  };

  const handleFmChange = async (key: string, value: any) => {
    if (!editor) return;
    const currentData = fmData || {};
    const newData = { ...currentData, [key]: value };
    setFmData(newData);
    // Document API로 해당 키만 수정해 주석·빈 줄·인용 스타일을 보존
    // (전체 재직렬화는 frontmatter의 주석을 모두 날림)
    let newFmString: string;
    try {
      if (parsedFrontmatter) {
        const doc = YAML.parseDocument(parsedFrontmatter);
        doc.set(key, value);
        newFmString = doc.toString().trim();
      } else {
        newFmString = YAML.stringify(newData).trim();
      }
    } catch {
      newFmString = YAML.stringify(newData).trim();
    }
    setParsedFrontmatter(newFmString);
    const md = await generateMarkdownFromEditor();
    saveToHost(newFmString, md);
  };

  useEffect(() => {
    const handleBlur = async () => {
      if (hasEdited.current && config.autoFix && !isRawMode && editor) {
        try {
          // Blur 시점에 한 번만 autoFix 적용하여 저장
          const markdown = await generateMarkdownFromEditor(false);
          const fullText = parsedFrontmatter ? `---\n${parsedFrontmatter}\n---\n${markdown}` : markdown;
          if (lastSentTextRef.current !== fullText) {
            lastSentTextRef.current = fullText;
            vscode.postMessage({ type: 'change', text: fullText });
          }
        } catch {
          console.error("AutoFix on blur failed");
        }
      }
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.autoFix, isRawMode, editor, parsedFrontmatter]);

  const handleFindNext = () => {
    if (!searchQuery) return;
    const searchInput = document.getElementById('search-input') as HTMLInputElement;
    const replaceInput = document.getElementById('replace-input') as HTMLInputElement;
    let sVal = "", rVal = "";
    if (searchInput) { sVal = searchInput.value; searchInput.value = ""; }
    if (replaceInput) { rVal = replaceInput.value; replaceInput.value = ""; }
    
    // @ts-ignore
    window.find(searchQuery, false, false, true, false, false, false);
    
    if (searchInput) searchInput.value = sVal;
    if (replaceInput) replaceInput.value = rVal;
  };

  const handleFindPrev = () => {
    if (!searchQuery) return;
    const searchInput = document.getElementById('search-input') as HTMLInputElement;
    const replaceInput = document.getElementById('replace-input') as HTMLInputElement;
    let sVal = "", rVal = "";
    if (searchInput) { sVal = searchInput.value; searchInput.value = ""; }
    if (replaceInput) { rVal = replaceInput.value; replaceInput.value = ""; }
    
    // @ts-ignore
    window.find(searchQuery, false, true, true, false, false, false);
    
    if (searchInput) searchInput.value = sVal;
    if (replaceInput) replaceInput.value = rVal;
  };

  const handleReplace = () => {
    if (!editor || !searchQuery) return;
    const selection = window.getSelection();
    if (selection && selection.toString().toLowerCase() === searchQuery.toLowerCase()) {
      document.execCommand("insertText", false, replaceQuery);
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
      // 자체 Search/Replace 위젯을 Ctrl+F와 Ctrl+H 모두에 연동한다 (WYSIWYG 모드에서)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'h' || e.key === 'f')) {
        if (!isRawMode) {
          e.preventDefault();
          e.stopPropagation();
          setShowSearchReplace(true);
        }
      } else if (e.key === 'Escape' && showSearchReplace) {
        setShowSearchReplace(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearchReplace, isRawMode]);

  useEffect(() => {
    const handleWindowScroll = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener('scroll', handleWindowScroll);
    return () => window.removeEventListener('scroll', handleWindowScroll);
  }, []);

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
      try {
        if (hasEdited.current) {
          const markdown = await generateMarkdownFromEditor();
          const fullText = parsedFrontmatter ? `---\n${parsedFrontmatter}\n---\n${markdown}` : markdown;
          setDocumentText(fullText);
          lastSentTextRef.current = fullText;
          vscode.postMessage({ type: 'change', text: fullText });
        }
      } catch (err) {
        console.error("Failed to generate markdown during mode toggle", err);
      }
      setEditor(null);
    }
    setIsRawMode(!isRawMode);
  };

  const getSelectedOrCursorBlocks = (editorInstance: any) => {
    if (!editorInstance) return [];
    try {
      const selection = editorInstance.getSelection();
      if (selection && selection.blocks && selection.blocks.length > 0) {
        return selection.blocks;
      }
      const cursor = editorInstance.getTextCursorPosition();
      if (cursor && cursor.block) {
        return [cursor.block];
      }
    } catch {}
    return [];
  };

  const sanitizePropsForBlockType = (type: string, oldProps: Record<string, any> = {}, newProps: Record<string, any> = {}) => {
    const baseProps: Record<string, any> = {
      textAlignment: oldProps.textAlignment || 'left',
      textColor: oldProps.textColor || 'default',
      backgroundColor: oldProps.backgroundColor || 'default',
    };

    if (type === 'heading') {
      baseProps.level = newProps.level || oldProps.level || 1;
    } else if (type === 'codeBlock') {
      baseProps.language = newProps.language || oldProps.language || 'text';
    } else if (type === 'checkListItem') {
      baseProps.checked = typeof newProps.checked !== 'undefined' ? newProps.checked : (oldProps.checked || false);
    }

    return { ...baseProps, ...newProps };
  };

  const applyBlockTypeToSelection = (type: string, props?: Record<string, any>) => {
    if (!editor) return;
    try {
      const blocks = getSelectedOrCursorBlocks(editor);
      if (blocks.length === 0) return;

      if (blocks.length === 1) {
        const b = blocks[0];
        const cleanProps = sanitizePropsForBlockType(type, b.props, props);
        editor.updateBlock(b, { type: type as any, props: cleanProps });
      } else {
        const newBlocks = blocks.map((b: any) => ({
          type: type as any,
          props: sanitizePropsForBlockType(type, b.props, props),
          content: b.content,
          children: b.children,
        }));
        editor.replaceBlocks(blocks, newBlocks);
      }
      editor.focus();
    } catch (err) {
      console.error('Failed to apply block type', err);
    }
  };

  const handleKeyDownCapture = (e: React.KeyboardEvent) => {
    if (!editor || isRawMode) return;

    // 한국어 등 IME 합성(입력 중) 상태에서는 단축키 이벤트를 가로채지 않음 (글자 씹힘 및 겹침 방지)
    if (e.nativeEvent.isComposing) return;

    // Cmd/Ctrl + Z / Y : 호스트 기반 Undo/Redo 통합
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.stopPropagation();
      lastUndoTimeRef.current = Date.now();
      if (e.shiftKey) {
        vscode.postMessage({ type: 'redo' });
      } else {
        vscode.postMessage({ type: 'undo' });
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      e.stopPropagation();
      lastUndoTimeRef.current = Date.now();
      vscode.postMessage({ type: 'redo' });
      return;
    }



    if (e.key === 'Tab') {
      try {
        const selection = editor.getSelection();
        const cursor = editor.getTextCursorPosition();
        
        if (cursor && cursor.block && cursor.block.type === 'codeBlock') {
          // 코드 블록 내부에서는 커스텀 목록 탭 제어를 건너뛰어 코드 들여쓰기 보장
          return;
        }
        
        let blocksToProcess: any[] = [];
        if (selection && selection.blocks && selection.blocks.length > 0) {
          blocksToProcess = selection.blocks;
        } else if (cursor && cursor.block) {
          blocksToProcess = [cursor.block];
        }

        if (blocksToProcess.length > 0) {
          if (!e.shiftKey) {
            // Tab (Indent)
            let preventDefault = false;
            for (const block of blocksToProcess) {
              if (block.type === 'paragraph' && (block.content?.length === 0 || (cursor && typeof cursor.prevCharacter === 'undefined'))) {
                // 빈 문단에서 Tab 시 불릿 리스트로 전환
                editor.updateBlock(block, { type: 'bulletListItem' });
                preventDefault = true;
              } else if (block.type === 'bulletListItem' || block.type === 'numberedListItem') {
                preventDefault = true; // 무조건 기본 동작(포커스 이동) 차단
                if (cursor && editor.canNestBlock()) {
                  editor.nestBlock();
                  if (block.type === 'numberedListItem') {
                    // 숫자 리스트에서 들여쓰기(Tab) 시 기본 들여쓰기 동작 후 불릿 리스트로 전환
                    setTimeout(() => {
                      try {
                        editor.updateBlock(block.id, { type: 'bulletListItem' });
                        const isBlockEmpty = !block.content || (Array.isArray(block.content) && block.content.every((c: any) => c.type === 'text' && !c.text));
                        if (isBlockEmpty) {
                          editor.setTextCursorPosition(block.id, 'end');
                        }
                      } catch {}
                    }, 0);
                  }
                }
              }
            }
            if (preventDefault) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          } else {
            // Shift-Tab (Outdent)
            let preventDefault = false;
            for (const block of blocksToProcess) {
              if (block.type === 'bulletListItem' || block.type === 'numberedListItem') {
                preventDefault = true; // 무조건 기본 동작 차단 (커서 이탈 방지)
                const findParent = (blocks: any[], id: string, parent: any = null): any => {
                  for (const b of blocks) {
                    if (b.id === id) return parent;
                    if (b.children && b.children.length > 0) {
                      const p = findParent(b.children, id, b);
                      if (p) return p;
                    }
                  }
                  return null;
                };
                const parentBlock = findParent(editor.document, block.id);
                if (parentBlock) { // 최상위(1레벨)에서는 아무 동작 안 함
                  if (cursor && editor.canUnnestBlock()) {
                    editor.unnestBlock();
                    if (parentBlock.type === 'numberedListItem' && block.type === 'bulletListItem') {
                      // 숫자 리스트 하위의 불릿 리스트를 내어쓰기할 경우 다시 숫자 리스트로 전환
                      setTimeout(() => {
                        try {
                          editor.updateBlock(block.id, { type: 'numberedListItem' });
                          const isBlockEmpty = !block.content || (Array.isArray(block.content) && block.content.every((c: any) => c.type === 'text' && !c.text));
                          if (isBlockEmpty) {
                            editor.setTextCursorPosition(block.id, 'end');
                          }
                        } catch {}
                      }, 0);
                    }
                  }
                }
              }
            }
            if (preventDefault) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }
        }
      } catch {
        // Ignored if no cursor position can be resolved
      }
      return;
    }

    // UpNote Shortcuts
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '6') {
      e.preventDefault();
      e.stopPropagation();
      applyBlockTypeToSelection('heading', { level: parseInt(e.key) });
      return;
    }
    
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === '7') {
      e.preventDefault();
      e.stopPropagation();
      applyBlockTypeToSelection('bulletListItem');
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === '8') {
      e.preventDefault();
      e.stopPropagation();
      applyBlockTypeToSelection('numberedListItem');
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === '9') {
      e.preventDefault();
      e.stopPropagation();
      applyBlockTypeToSelection('checkListItem');
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      e.stopPropagation();
      applyBlockTypeToSelection('quote');
      return;
    }

    // Cmd/Ctrl + Shift + C : Code Block
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      e.stopPropagation();
      applyBlockTypeToSelection('codeBlock', { language: 'text' });
      return;
    }

    // Cmd/Ctrl + Shift + M : Divider (inserted as '---' paragraph)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      e.stopPropagation();
      try {
        const cursor = editor.getTextCursorPosition();
        if (cursor) {
          editor.insertBlocks([{ type: 'paragraph', content: '---' }], cursor.block, 'after');
        }
      } catch {}
      return;
    }

    // Cmd/Ctrl + Shift + K : Inline Code
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      e.stopPropagation();
      try { editor.toggleStyles({ code: true }); } catch {}
      return;
    }

    // Cmd/Ctrl + Shift + X (or S) : Strikethrough
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key.toLowerCase() === 'x' || e.key.toLowerCase() === 's')) {
      e.preventDefault();
      e.stopPropagation();
      try { editor.toggleStyles({ strike: true }); } catch {}
      return;
    }

    // Cmd/Ctrl + Shift + H : Highlight
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      e.stopPropagation();
      try {
        const active = editor.getActiveStyles();
        if (active.backgroundColor === 'yellow') {
          editor.removeStyles({ backgroundColor: 'yellow' });
        } else {
          editor.addStyles({ backgroundColor: 'yellow' });
        }
      } catch {}
      return;
    }

    // Cmd/Ctrl + D : Duplicate Block
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      e.stopPropagation();
      try {
        const cursor = editor.getTextCursorPosition();
        if (cursor && cursor.block) {
          const block = editor.getBlock(cursor.block);
          if (block) {
            editor.insertBlocks([{ type: block.type, props: block.props, content: block.content }], block, "after");
          }
        }
      } catch {}
      return;
    }
  };

  const updateConfig = (key: string, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    vscode.postMessage({ type: 'updateConfig', key, value });
  };

  const [bodyClass, setBodyClass] = useState(document.body.className);
  
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setBodyClass(document.body.className);
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Resolve 'auto' to 'light' or 'dark' based on body class (VS Code sets vscode-light, vscode-dark, etc)
  const isVscodeDark = bodyClass.includes('vscode-dark') || bodyClass.includes('vscode-high-contrast');
  const activeTheme = config.theme === 'auto' ? (isVscodeDark ? 'dark' : 'light') : config.theme;
  
  // 테마 팔레트는 themes.ts에 중앙 정의 (THEMES 레코드에서 조회)
  const themePalette = resolveTheme(activeTheme);
  const isDark = themePalette.isDark;

  useEffect(() => {
    document.body.setAttribute('data-theme-dark', isDark ? 'true' : 'false');
    window.dispatchEvent(new Event('theme-changed'));
  }, [isDark]);

  // 주입 CSS는 테마·폰트 크기에만 의존 — 매 렌더(키 입력마다) 재생성하지 않음
  const editorCss = useMemo(
    () => buildEditorStyles(themePalette, config.fontSize),
    [themePalette, config.fontSize]
  );

  if (documentText === "loading") {
    return <div>Loading document...</div>;
  }

  const { bgColor, textColor, headerBg, blockNoteTheme, cmTheme, dropdownBg, dropdownBorder, inputBg, accentColor } = themePalette;


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: bgColor, color: textColor }}>
      
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
              id="search-input"
              placeholder="Find..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              style={{ padding: '4px', fontSize: '12px', background: inputBg, color: textColor, border: `1px solid ${dropdownBorder}`, borderRadius: '4px', width: '150px', outline: 'none' }} 
              onKeyDown={e => e.key === 'Enter' && handleFindNext()} 
              autoFocus
            />
            <button onMouseDown={e => e.preventDefault()} onClick={handleFindPrev} style={{ background: inputBg, color: textColor, border: `1px solid ${dropdownBorder}`, borderRadius: '4px', padding: '2px 6px', cursor: 'pointer' }}><ChevronUp size={14}/></button>
            <button onMouseDown={e => e.preventDefault()} onClick={handleFindNext} style={{ background: inputBg, color: textColor, border: `1px solid ${dropdownBorder}`, borderRadius: '4px', padding: '2px 6px', cursor: 'pointer' }}><ChevronDown size={14}/></button>
            <button onClick={() => setShowSearchReplace(false)} style={{ background: 'transparent', color: textColor, border: 'none', padding: '2px', cursor: 'pointer', marginLeft: '4px', opacity: 0.7 }}><X size={14}/></button>
          </div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <div style={{ width: '22px' }} />
            <input 
              id="replace-input"
              placeholder="Replace..." 
              value={replaceQuery} 
              onChange={e => setReplaceQuery(e.target.value)} 
              style={{ padding: '4px', fontSize: '12px', background: inputBg, color: textColor, border: `1px solid ${dropdownBorder}`, borderRadius: '4px', width: '150px', outline: 'none' }} 
              onKeyDown={e => e.key === 'Enter' && handleReplace()}
            />
            <button onMouseDown={e => e.preventDefault()} onClick={handleReplace} style={{ fontSize: '11px', background: inputBg, color: textColor, border: `1px solid ${dropdownBorder}`, borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}>Replace</button>
            <button onMouseDown={e => e.preventDefault()} onClick={handleReplaceAll} style={{ fontSize: '11px', background: inputBg, color: textColor, border: `1px solid ${dropdownBorder}`, borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}>Replace All</button>
          </div>
        </div>
      )}

      {/* TOC is rendered as Orca Left Sidebar Panel below */}

      {/* Top Action Header Bar */}
      <div style={{ padding: '6px 16px', backgroundColor: headerBg, borderBottom: `1px solid ${dropdownBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div 
          style={{ 
            fontSize: '12px', 
            opacity: 0.85, 
            fontFamily: 'monospace', 
            overflow: 'hidden', 
            textOverflow: 'ellipsis', 
            whiteSpace: 'nowrap', 
            maxWidth: '65%',
            flex: 1,
            marginRight: '12px'
          }}
          title={formatDocPath(docBaseUriRef.current)}
        >
          {formatDocPath(docBaseUriRef.current)}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <button
            onClick={() => vscode.postMessage({ type: 'openBuiltIn' })}
            className="tb-btn"
            data-tooltip="Open in VS Code built-in editor"
            data-tooltip-pos="left"
          >
            <ExternalLink size={12} style={{ marginRight: '3px' }} />
            Built-in
          </button>
          {!config.isReadOnly && (
            <>
              <div style={{ width: '1px', height: '14px', background: dropdownBorder, margin: '0 2px' }} />
              <div style={{ display: 'flex', borderRadius: '4px', overflow: 'hidden', border: `1px solid ${dropdownBorder}` }}>
                <button
                  onClick={() => { if (!isRawMode) toggleMode(); }}
                  style={{ 
                    padding: '2px 8px', 
                    cursor: 'pointer', 
                    border: 'none', 
                    borderRight: `1px solid ${dropdownBorder}`,
                    background: isRawMode ? textColor : 'transparent', 
                    color: isRawMode ? bgColor : textColor,
                    fontWeight: isRawMode ? 'bold' : 'normal',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                  data-tooltip="Raw Code Mode"
                >
                  <Code size={12} />
                  Raw
                </button>
                <button 
                  onClick={() => { if (isRawMode) toggleMode(); }} 
                  style={{ 
                    padding: '2px 8px', 
                    cursor: 'pointer', 
                    border: 'none', 
                    background: !isRawMode ? textColor : 'transparent', 
                    color: !isRawMode ? bgColor : textColor,
                    fontWeight: !isRawMode ? 'bold' : 'normal',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                  data-tooltip="WYSIWYG Rich Mode"
                >
                  <Edit3 size={12} />
                  WYSIWYG
                </button>
              </div>
              {isRawMode ? (
                <button
                  onClick={() => {
                    if (!isDiffMode && originalText === null) {
                      vscode.postMessage({ type: 'getOriginalContent' });
                    }
                    setIsDiffMode(!isDiffMode);
                  }}
                  className={`tb-btn ${isDiffMode ? 'tb-btn-active' : ''}`}
                  data-tooltip="Toggle Git Diff View"
                >
                  <GitCompare size={13} style={{ marginRight: '3px' }} />
                  Diff
                </button>
              ) : (
                <button 
                  onClick={() => updateConfig('showToc', !showToc)} 
                  className={`tb-btn ${showToc ? 'tb-btn-active' : ''}`}
                  style={showToc ? { background: textColor, color: bgColor, fontWeight: 'bold' } : {}}
                  data-tooltip="Toggle Table of Contents"
                  data-tooltip-pos="right"
                >
                  <List size={13} style={{ marginRight: '3px' }} />
                  <span>TOC</span>
                </button>
              )}
            </>
          )}
          <div style={{ width: '1px', height: '14px', background: dropdownBorder, margin: '0 2px' }} />
          <button
            onClick={() => {
              const editorEl = document.querySelector('.bn-container') || document.querySelector('.bn-editor');
              let html = editorEl?.outerHTML || editorEl?.innerHTML || '';

              const baseUri = docBaseUriRef.current;
              if (baseUri) {
                const cleanBase = baseUri.replace(/\\/g, '/');
                const folderUri = cleanBase.substring(0, cleanBase.lastIndexOf('/'));
                
                html = html.replace(/src=["'](assets\/[^"']+)["']/g, (_, relPath) => {
                  const fullPath = folderUri.startsWith('file://') ? `${folderUri}/${relPath}` : `file:///${folderUri.replace(/^[a-zA-Z]:/, (m) => m.toUpperCase())}/${relPath}`;
                  return `src="${fullPath}"`;
                });
                html = html.replace(/src=["']https:\/\/file%2B[^/]+\/([^"']+)["']/g, (_, pathPart) => {
                  const decoded = decodeURIComponent(pathPart);
                  return `src="file:///${decoded}"`;
                });
              }

              const styles = Array.from(document.querySelectorAll('style')).map(s => s.textContent || s.innerHTML).join('\n');
              vscode.postMessage({ type: 'exportPdf', html, styles });
            }}
            className="tb-btn"
            data-tooltip="Export Document as PDF"
            data-tooltip-pos="right"
          >
            <Printer size={13} style={{ marginRight: '3px' }} />
            <span>PDF</span>
          </button>
          {parsedFrontmatter && (
            <button 
              onClick={() => updateConfig('showProperties', !showProperties)} 
              className={`tb-btn ${showProperties ? 'tb-btn-active' : ''}`}
              data-tooltip="Toggle Properties"
              data-tooltip-pos="right"
            >
              <Info size={14} />
            </button>
          )}
          <button 
            onClick={() => vscode.postMessage({ type: 'refresh' })}
            className="tb-btn"
            data-tooltip="Refresh Editor"
            data-tooltip-pos="right"
          >
            <RefreshCw size={14} />
          </button>
          <button 
            onClick={() => {
              if (typeof documentText === 'string') {
                const broken = detectBrokenImageLinks(documentText);
                if (broken.length === 0) {
                  vscode.postMessage({ type: 'notify', message: 'Manual Validation Passed: All media relative paths are valid.' });
                } else {
                  vscode.postMessage({ type: 'notify', message: `Manual Validation Warning: Found ${broken.length} broken media link(s). (Line ${broken[0].line}: ${broken[0].url})` });
                }
              }
            }}
            className="tb-btn"
            data-tooltip="Validate Media Links"
            data-tooltip-pos="right"
          >
            <AlertTriangle size={14} />
          </button>
          <div style={{ position: 'relative' }} ref={settingsRef}>
            <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="tb-btn"
              data-tooltip="Settings"
              data-tooltip-pos="right"
            >
              <Settings size={14} />
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
                  className="settings-select"
                  value={config.theme}
                  onChange={(e) => updateConfig('theme', e.target.value)}
                >
                  <option value="auto">Auto (Match VS Code)</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="nord">Nord</option>
                  <option value="one-half-dark">One Half Dark</option>
                  <option value="solarized-dark">Solarized Dark</option>
                  <option value="vintage">Vintage</option>
                  <option value="gruvbox-dark">Gruvbox Dark</option>
                  <option value="tokyo-night-day">Tokyo Night Day</option>
                  <option value="orca">Orca</option>
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
      
      {/* 2층 Orca Rich Formatting Toolbar (WYSIWYG 모드일 때만 노출) */}
      {!isRawMode && !config.isReadOnly && editor && (
        <div style={{ padding: '3px 16px', backgroundColor: headerBg, borderBottom: `1px solid ${dropdownBorder}`, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', overflow: 'visible', flexWrap: 'wrap', userSelect: 'none' }}>
          <button onMouseDown={e => e.preventDefault()} onClick={() => applyBlockTypeToSelection('paragraph')} className="tb-btn" data-tooltip="Paragraph (¶)">
            <Pilcrow size={13} />
          </button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => applyBlockTypeToSelection('heading', { level: 1 })} className="tb-btn" data-tooltip="Heading 1 (Ctrl+1)" style={{ fontWeight: 'bold' }}>
            H1
          </button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => applyBlockTypeToSelection('heading', { level: 2 })} className="tb-btn" data-tooltip="Heading 2 (Ctrl+2)" style={{ fontWeight: 'bold' }}>
            H2
          </button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => applyBlockTypeToSelection('heading', { level: 3 })} className="tb-btn" data-tooltip="Heading 3 (Ctrl+3)" style={{ fontWeight: 'bold' }}>
            H3
          </button>
          <div style={{ width: '1px', height: '12px', background: dropdownBorder, margin: '0 2px' }} />
          <button onMouseDown={e => e.preventDefault()} onClick={() => { try { editor.toggleStyles({ bold: true }); editor.focus(); } catch {} }} className="tb-btn" data-tooltip="Bold (Ctrl+B)">
            <Bold size={13} />
          </button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => { try { editor.toggleStyles({ italic: true }); editor.focus(); } catch {} }} className="tb-btn" data-tooltip="Italic (Ctrl+I)">
            <Italic size={13} />
          </button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => { try { editor.toggleStyles({ strike: true }); editor.focus(); } catch {} }} className="tb-btn" data-tooltip="Strikethrough (Ctrl+Shift+X)">
            <Strikethrough size={13} />
          </button>
          <div style={{ width: '1px', height: '12px', background: dropdownBorder, margin: '0 2px' }} />
          <button onMouseDown={e => e.preventDefault()} onClick={() => applyBlockTypeToSelection('bulletListItem')} className="tb-btn" data-tooltip="Bullet List (Ctrl+7)">
            <List size={13} />
          </button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => applyBlockTypeToSelection('numberedListItem')} className="tb-btn" data-tooltip="Numbered List (Ctrl+8)">
            <ListOrdered size={13} />
          </button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => applyBlockTypeToSelection('checkListItem')} className="tb-btn" data-tooltip="Task List (Ctrl+9)">
            <CheckSquare size={13} />
          </button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => applyBlockTypeToSelection('quote')} className="tb-btn" data-tooltip="Blockquote (Ctrl+Shift+U)">
            <Quote size={13} />
          </button>
          <div style={{ width: '1px', height: '12px', background: dropdownBorder, margin: '0 2px' }} />
          <button onMouseDown={e => e.preventDefault()} onClick={() => {
            const url = prompt('Enter link URL:');
            if (url) {
              try { editor.createLink(url); editor.focus(); } catch {}
            } else {
              try { editor.focus(); } catch {}
            }
          }} className="tb-btn" data-tooltip="Insert Link">
            <Link size={13} />
          </button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async (e: any) => {
              const file = e.target?.files?.[0];
              if (file && editor) {
                try {
                  const url = await uploadFile(file);
                  const cur = editor.getTextCursorPosition();
                  if (cur && cur.block) {
                    editor.insertBlocks([{ type: 'paragraph', content: [{ type: 'text', text: `![${file.name || 'image'}](${url})`, styles: {} }] }], cur.block, 'after');
                  }
                  editor.focus();
                } catch {}
              }
            };
            input.click();
          }} className="tb-btn" data-tooltip="Insert Image">
            <ImageIcon size={13} />
          </button>
        </div>
      )}
      
      <div 
        style={{ flex: 1, display: 'flex', flexDirection: 'row', boxSizing: 'border-box', fontSize: `${config.fontSize}px`, overflow: 'hidden' }}
        onKeyDownCapture={handleKeyDownCapture}
      >
        <style>{editorCss}</style>

        {/* 좌측 사이드바 TOC 패널 (Orca 스타일) */}
        {!isRawMode && showToc && headings.length > 0 && (
          <div style={{
            width: '240px',
            flexShrink: 0,
            backgroundColor: headerBg,
            borderRight: `1px solid ${dropdownBorder}`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontSize: '12px',
            userSelect: 'none'
          }}>
            {/* TOC 패널 상단 헤더 툴바 */}
            <div style={{
              padding: '8px 12px',
              borderBottom: `1px solid ${dropdownBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '4px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '12px', opacity: 0.85 }}>
                <List size={14} />
                <span>TOC</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                {[1, 2, 3, 4, 5].map(lvl => (
                  <button
                    key={lvl}
                    onClick={() => {
                      const firstHead = headings.find(h => h.level === lvl);
                      if (firstHead) {
                        const el = document.querySelector(`[data-id="${firstHead.id}"]`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }}
                    className="tb-btn"
                    style={{ padding: '1px 4px', fontSize: '10px', fontWeight: 600 }}
                    data-tooltip={`Jump to H${lvl}`}
                  >
                    H{lvl}
                  </button>
                ))}
                <button
                  onClick={() => updateConfig('showToc', false)}
                  className="tb-btn"
                  style={{ padding: '2px', marginLeft: '2px' }}
                  data-tooltip="Close TOC"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* TOC 계층 목록 (Tree View) */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {headings.map(h => (
                <div
                  key={h.id}
                  style={{
                    paddingLeft: `${(h.level - 1) * 12 + 8}px`,
                    paddingRight: '8px',
                    paddingTop: '4px',
                    paddingBottom: '4px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    opacity: 0.78,
                    fontSize: '11.5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    transition: 'background-color 0.12s ease, opacity 0.12s ease'
                  }}
                  onClick={() => {
                    const el = document.querySelector(`[data-id="${h.id}"]`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--text-color) 8%, transparent)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.opacity = '0.78';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {h.level === 1 ? (
                    <ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.6 }} />
                  ) : (
                    <span style={{ width: '11px', display: 'inline-block', flexShrink: 0, opacity: 0.4 }}>•</span>
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 메인 에디터 영역 (오른쪽 패널) */}
        <div style={{ flex: 1, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
                      lastEditTimeRef.current = Date.now();
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
              className="raw-markdown-editor"
              extensions={[markdown({ base: markdownLanguage, codeLanguages: codeLanguages }), EditorView.lineWrapping]}
              onChange={(val) => {
                lastEditTimeRef.current = Date.now();
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
              {showProperties ? (
                <FrontmatterPanel
                  parsedFrontmatter={parsedFrontmatter}
                  fmData={fmData || { title: '', date: '', tags: [] }}
                  collapsed={fmCollapsed}
                  onToggleCollapsed={() => setFmCollapsed(!fmCollapsed)}
                  isDark={isDark}
                  textColor={textColor}
                  accentColor={accentColor}
                  onChange={handleFmChange}
                />
              ) : null}
              {editor && <div onCopy={async (e) => {
                const selection = editor.getSelection();
                if (selection && selection.blocks && selection.blocks.length > 0) {
                  e.preventDefault();
                  try {
                    let markdown = await editor.blocksToMarkdownLossy(selection.blocks as any);
                    markdown = normalizeOrderedListNumbers(markdown);
                    markdown = normalizeUnorderedListBullets(markdown);

                    e.clipboardData.setData('text/plain', markdown);
                  } catch (err) {
                    console.error("Failed to copy markdown", err);
                  }
                }
              }}><BlockNoteView editor={editor} onChange={handleWysiwygChange} theme={blockNoteTheme} formattingToolbar={false} slashMenu={false}>
                <SuggestionMenuController
                  triggerCharacter={"/"}
                  getItems={async (query) => {
                    const defaultItems = getDefaultReactSlashMenuItems(editor);
                    const customItem = insertDateItem(editor);
                    const mermaidItem = insertMermaidItem(editor);
                    const calloutItem = insertCalloutItem(editor);
                    const allItems = [...defaultItems, customItem, mermaidItem, calloutItem];
                    return allItems.filter(item => item.title.toLowerCase().includes(query.toLowerCase()) || (item.aliases && item.aliases.some((a: string) => a.toLowerCase().includes(query.toLowerCase()))));
                  }}
                />
              </BlockNoteView></div>}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* 코드블록 케밥(⋮) 메뉴 — UpNote식: 복사/잘라내기/삭제/언어/기본 코드 언어 */}
      {codeMenu && editor && (
        <CodeBlockMenu
          x={codeMenu.x}
          y={codeMenu.y}
          currentLanguage={String(editor.getBlock(codeMenu.blockId)?.props?.language || 'text')}
          defaultLanguage={config.defaultCodeLanguage}
          onSelectLanguage={(id) => {
            editor.updateBlock(codeMenu.blockId, { props: { language: id } });
            setCodeMenu(null);
            try { editor.focus(); } catch {}
          }}
          onSelectDefault={(id) => {
            updateConfig('defaultCodeLanguage', id);
            setCodeMenu(null);
            try { editor.focus(); } catch {}
          }}
          onCopy={() => {
            const b = editor.getBlock(codeMenu.blockId);
            const text = b?.content?.map((c: any) => c.text || '').join('') || '';
            navigator.clipboard.writeText(text);
            setCodeMenu(null);
            try { editor.focus(); } catch {}
          }}
          onCut={() => {
            const b = editor.getBlock(codeMenu.blockId);
            const text = b?.content?.map((c: any) => c.text || '').join('') || '';
            navigator.clipboard.writeText(text);
            editor.removeBlocks([codeMenu.blockId]);
            setCodeMenu(null);
            try { editor.focus(); } catch {}
          }}
          onDelete={() => {
            editor.removeBlocks([codeMenu.blockId]);
            setCodeMenu(null);
            try { editor.focus(); } catch {}
          }}
          onClose={() => {
            setCodeMenu(null);
            try { editor.focus(); } catch {}
          }}
        />
      )}
    </div>
  );
}

export default App;
