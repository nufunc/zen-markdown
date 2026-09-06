import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { BlockNoteEditor, BlockNoteSchema, defaultBlockSpecs, createCodeBlockSpec } from '@blocknote/core';
import { MermaidBlock } from './MermaidBlock';
import { createShikiHighlighter, supportedLanguages } from './shikiHighlighter';
import { processBlocksFromMarkdown, processBlocksToMarkdown, preserveMarkdownLineBreaks, extractFrontmatter, detectBrokenImageLinks, parseTableFromClipboardText, extractTagsFromMarkdown, normalizeOrderedListNumbers, normalizeUnorderedListBullets, restoreHtml } from './markdownTransforms';
import { toEditorMarkdown, fromEditorMarkdown } from './markdownPipeline';
import { useSearchReplace } from './useSearchReplace';
import { isEditorElement, isPlainInputTarget } from './domTargets';
import { createEditorKeymap } from './editorKeymap';
import { useDocumentSync, normalizeMd } from './useDocumentSync';
import { compareRoundtrip } from './roundtripCheck';
import { resolveTheme } from './themes';
import { buildEditorStyles } from './editorStyles';
import { FrontmatterPanel } from './FrontmatterPanel';
import { CodeBlockMenu } from './CodeBlockMenu';
import { createSearchPlugin, searchPluginKey, SearchHighlightExtension } from './searchPlugin';

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
import { Settings, X, Info, ChevronDown, ChevronUp, ChevronRight, List, RefreshCw, GitCompare, ExternalLink, AlertTriangle, Bold, Italic, Strikethrough, ListOrdered, CheckSquare, Quote, Link, Image as ImageIcon, Code, Edit3, Pilcrow, Printer, Palette, Type, Wand2, Eye, RefreshCcw, FileText, Maximize2, Zap, Replace, ReplaceAll, Undo2, Redo2, Scissors, Copy, Clipboard, Search } from 'lucide-react';
import { undo as pmUndo, redo as pmRedo, undoDepth, redoDepth } from 'prosemirror-history';
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


// 진단 이벤트를 호스트로 보낸다. 문서 내용은 절대 싣지 않는다.
const diag = (ev: string, fields: Record<string, unknown> = {}) => {
  try { vscode.postMessage({ type: 'diag', ev, ...fields }); } catch { /* noop */ }
};

// ProseMirror undo 히스토리를 비운다. 문서 전체를 갈아치운 뒤에는 이전 스텝의
// 위치가 무의미해지므로 남겨두면 Ctrl+Z가 엉뚱한 곳을 되돌린다.
const clearUndoHistory = (editorInstance: any) => {
  try {
    const tiptap = editorInstance?._tiptapEditor;
    const view = tiptap?.editorView || tiptap?.view;
    const state = tiptap?.editorState || tiptap?.state;
    if (!view || !state) return;
    // EditorState를 같은 doc/plugins로 다시 만들면 history 플러그인 상태가 초기화된다.
    // prosemirror-history는 히스토리를 비우는 명령을 노출하지 않아 이 방식을 쓴다.
    view.updateState((state.constructor as any).create({
      doc: state.doc,
      schema: state.schema,
      plugins: state.plugins,
      selection: state.selection
    }));
  } catch { /* noop */ }
};


const CaseSensitiveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M3.2 12h1.24l.5-1.5h2.52l.5 1.5h1.24L6.75 4h-1.1L3.2 12zm2.08-2.5L6.2 6.33l.92 3.17H5.28zM12.8 12h-1.17l-.14-.52c-.37.38-.85.57-1.44.57-.6 0-1.07-.17-1.42-.51-.34-.34-.51-.81-.51-1.39 0-.64.22-1.12.67-1.43.45-.32 1.09-.48 1.93-.48h.77V7.8c0-.3-.08-.53-.25-.68-.17-.15-.43-.22-.78-.22-.32 0-.58.07-.79.2-.21.14-.33.34-.36.62H8.35c.03-.54.25-.96.67-1.25.41-.29 1-.44 1.75-.44.7 0 1.22.15 1.57.45.34.3.52.74.52 1.33V12zm-1.16-2.92h-.69c-.53 0-.92.09-1.18.26-.26.17-.38.44-.38.8 0 .32.09.56.28.71.18.15.43.23.76.23.36 0 .65-.11.87-.33.22-.22.34-.52.34-.91v-.76z"/>
  </svg>
);

const WholeWordIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M1 3h1.2v10H1V3zm12.8 0h1.2v10h-1.2V3zM4.5 11.5c-.7 0-1.3-.3-1.7-.8-.4-.5-.6-1.1-.6-1.9 0-.8.2-1.4.6-1.9.4-.5 1-.8 1.7-.8.5 0 .9.2 1.3.5V4h1.1v7.5H5.8v-.6c-.4.4-.8.6-1.3.6zm.5-1c.4 0 .7-.1 1-.4.2-.3.3-.6.3-1.1 0-.5-.1-.8-.3-1.1-.2-.3-.5-.4-1-.4-.4 0-.7.1-1 .4-.2.3-.3.6-.3 1.1 0 .5.1.8.3 1.1.2.3.5.4 1 .4zm4.7.9H8.6V6.6h1.1v.7c.4-.5.9-.7 1.6-.7.7 0 1.3.3 1.7.8.4.5.6 1.1.6 1.9 0 .8-.2 1.4-.6 1.9-.4.5-1 .8-1.7.8-.7 0-1.2-.2-1.6-.7v.1zm1.4-1c.4 0 .7-.1 1-.4.2-.3.3-.6.3-1.1 0-.5-.1-.8-.3-1.1-.2-.3-.5-.4-1-.4-.4 0-.7.1-1 .4-.2.3-.3.6-.3 1.1 0 .5.1.8.3 1.1.2.3.5.4 1 .4z"/>
  </svg>
);

const RegexIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M3.2 12.5a1.4 1.4 0 1 1-2.8 0 1.4 1.4 0 0 1 2.8 0zm7.8-4.2l2.3-1.3-.6-1-2.3 1.3V4.7H9.2v2.6L6.9 6l-.6 1 2.3 1.3-2.3 1.3.6 1 2.3-1.3v2.6h1.2V9.3l2.3 1.3.6-1-2.3-1.3z"/>
  </svg>
);

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
  const [config, setConfig] = useState<{
    theme: string,
    fontSize: number,
    autoFix: boolean,
    autoRefresh: boolean,
    showToc: boolean,
    showProperties: boolean,
    isReadOnly: boolean,
    defaultCodeLanguage: string,
    focusMode: boolean,
    spellCheck: boolean,
    contentWidth: string,
    defaultMode: string,
    showWordCount: boolean,
    showFormattingToolbar: boolean,
    typewriterMode: boolean
  }>({
    theme: "auto",
    fontSize: 16,
    autoFix: false,
    autoRefresh: true,
    showToc: false,
    showProperties: true,
    isReadOnly: false,
    defaultCodeLanguage: 'text',
    focusMode: false,
    spellCheck: false,
    contentWidth: 'standard',
    defaultMode: 'wysiwyg',
    showWordCount: true,
    showFormattingToolbar: true,
    typewriterMode: false
  });
  // 에디터 생성 시점(비동기)에 최신 설정을 읽기 위한 ref
  const configRef = useRef(config);
  configRef.current = config;
  // 코드블록 케밥(⋮) 메뉴 상태
  const [codeMenu, setCodeMenu] = useState<{ blockId: string, x: number, y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
  const [isRawMode, setIsRawMode] = useState(() => {
    const stateVal = vscode.getState()?.isRawMode;
    return typeof stateVal === 'boolean' ? stateVal : false;
  });
  const [isDiffMode, setIsDiffMode] = useState(false);
  const [originalText, setOriginalText] = useState<string | null>(null);
  const [editor, setEditor] = useState<any>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [parsedFrontmatter, setParsedFrontmatter] = useState<string>("");
  const [fmData, setFmData] = useState<Record<string, any> | null>(null);
  const [fmCollapsed, setFmCollapsed] = useState(false);
  const {
    showSearchReplace, setShowSearchReplace,
    isReplaceOpen, setIsReplaceOpen,
    searchQuery, setSearchQuery,
    replaceQuery, setReplaceQuery,
    matchCase, setMatchCase,
    wholeWord, setWholeWord,
    isRegex, setIsRegex,
    regexError, matchCount,
    activeIndex, setActiveIndex,
    searchInputRef, replaceInputRef,
    handleFindNext, handleFindPrev, handleReplace, handleReplaceAll,
    syncMatchesFromPlugin,
  } = useSearchReplace(editor, () => handleWysiwygChangeRef.current());

  const cmExtensions = useMemo(() => [
    markdown({ base: markdownLanguage, codeLanguages: codeLanguages }),
    EditorView.lineWrapping,
    EditorView.domEventHandlers({
      keydown(_event, view) {
        if (configRef.current.typewriterMode) {
          setTimeout(() => {
            try {
              const head = view.state.selection.main.head;
              view.dispatch({ effects: EditorView.scrollIntoView(head, { y: 'center' }) });
            } catch { /* noop */ }
          }, 10);
        }
        return false;
      }
    }),
    // 읽기 전용 문서에서는 입력 자체를 막는다. postChange 가드만으로는 입력이 들어갔다가
    // 되돌려져 사용자가 편집 가능하다고 오해한다.
    ...(config.isReadOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
    ...(config.typewriterMode ? [
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { paddingBottom: '50vh !important' },
        '.cm-content': { paddingBottom: '50vh !important' }
      })
    ] : [])
  ], [config.typewriterMode, config.isReadOnly]);
  const [headings, setHeadings] = useState<{id: string, text: string, level: number}[]>([]);
  const showToc = config.showToc;
  const showProperties = config.showProperties;
  
  const settingsRef = useRef<HTMLDivElement>(null);
  const hasEdited = useRef(false);
  const lastEditTimeRef = useRef(0);
  const lastUndoTimeRef = useRef(0);
  const isInitializing = useRef(false);
  const docBaseUriRef = useRef<string>("");
  // parseWikilinks가 실제로 변환한 문서명 — 저장 시 그것만 [[..]]로 되돌린다
  // 동기화 계층이 부를 최신 직렬화 함수 (선언 순서 역전 회피)
  const buildDocumentTextRef = useRef<() => Promise<string | null>>(async () => null);
  const {
    lastSentTextRef, lastInitializedTextRef,
    postChange, debouncedSerialize, flush,
    holdExternal, deferPending, isHolding,
  } = useDocumentSync({
    buildDocumentText: () => buildDocumentTextRef.current(),
    applyExternalText: (text) => setDocumentText(text),
    isReadOnly: () => configRef.current.isReadOnly,
  });
  const wikilinkNamesRef = useRef<Set<string>>(new Set());
  // 프론트매터 YAML 파싱 실패 여부 — 실패한 프론트매터에는 쓰기를 하지 않는다
  const fmParseFailedRef = useRef(false);
  const pendingUploads = useRef<Map<string, (v: { relPath?: string, error?: string }) => void>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cmViewRef = useRef<any>(null);
  // 모드 전환 시 기억할 헤딩. 같은 제목이 여러 번 나오는 문서를 위해 순번을 함께 담는다.
  const pendingHeadingRef = useRef<{ text: string, ordinal: number } | null>(null);



  // Focus Mode active block tracking
  useEffect(() => {
    const handleSelectionChange = () => {
      if (!configRef.current.focusMode || !editor) return;
      
      try {
        const cur = editor.getTextCursorPosition();
        const blockId = cur?.block?.id;
        
        document.querySelectorAll('.bn-block-outer.focus-active-block').forEach(el => {
          el.classList.remove('focus-active-block');
        });
        
        if (blockId) {
          const el = document.querySelector(`.bn-block-outer[data-id="${blockId}"]`);
          if (el) {
            el.classList.add('focus-active-block');
          }
        }
      } catch {
        // Ignore selection errors
      }
    };
    
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [editor]);

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
            defaultCodeLanguage: message.defaultCodeLanguage || 'text',
            focusMode: message.focusMode || false,
            spellCheck: message.spellCheck || false,
            contentWidth: message.contentWidth || 'standard',
            defaultMode: message.defaultMode || 'wysiwyg',
            showWordCount: message.showWordCount ?? true,
            showFormattingToolbar: message.showFormattingToolbar ?? true,
            typewriterMode: message.typewriterMode ?? false
          });
          if (message.isReadOnly) {
            setIsRawMode(true);
          } else if (vscode.getState()?.isRawMode === undefined && message.defaultMode) {
            setIsRawMode(message.defaultMode === 'raw');
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
          const incomingNormalized = normalizeMd(incoming);
          const lastSentNormalized = normalizeMd(lastSentTextRef.current);
          if (incomingNormalized === lastSentNormalized) return;
          
          // 위지윅 에디터 포커스 여부와 최근 로컬 편집 여부 검사
          const isEditorFocused = isEditorElement(document.activeElement);
          const isRecentlyEdited = (Date.now() - lastEditTimeRef.current) < 2000;
          const isUndoing = (Date.now() - lastUndoTimeRef.current) < 1000;
          if (!isUndoing && (isEditorFocused || isRecentlyEdited) && documentText !== "loading") {
            holdExternal(incoming);
            return;
          }

          // 진행 중인 로컬 debounce는 이전 문서 기준의 stale 상태이므로 취소하고 외부 내용 채택
          debouncedSerialize.cancel();
          postChange.cancel();
          setDocumentText(incoming);
          break;
        }
        case 'flush':
          // 저장 직전 호스트 요청 — 대기 중인 편집을 즉시 배출한 뒤 완료를 알린다
          (async () => {
            try {
              await flush();
            } finally {
              vscode.postMessage({ type: 'flushed' });
            }
          })();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentText]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
      setContextMenu(null);
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
      // 검색창·프론트매터 입력칸의 붙여넣기를 가로채지 않는다
      if (isPlainInputTarget(e.target)) return;
      // 코드블록 안에서는 CSV가 표가 아니라 코드다
      if ((e.target as HTMLElement)?.closest?.('[data-content-type="codeBlock"]')) return;
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
          diag('table_paste_failed');
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

  // 코드블록 포맷팅은 사용자의 명시적 조작(케밥 메뉴) 시에만 실행 (커서 이탈 시 자동 변이로 인한 튐 방지)

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
    // 내용이 같으면 같은 참조를 유지해 매 키입력마다의 전체 리렌더를 방지
    setHeadings(prev => {
      if (prev.length === newHeadings.length &&
          prev.every((h, i) => h.id === newHeadings[i].id && h.text === newHeadings[i].text && h.level === newHeadings[i].level)) {
        return prev;
      }
      return newHeadings;
    });
  };

  // Shiki 지연 로딩 완료 시 해당 언어를 사용하는 코드블록 재렌더링 (단, 현재 편집 중인 블록은 커서 보존을 위해 제외)
  useEffect(() => {
    const handleShikiLoaded = ((e: CustomEvent<string>) => {
      if (!editor) return;
      const lang = e.detail;
      const currentCursorBlockId = editor.getTextCursorPosition()?.block?.id;
      editor.forEachBlock((b: any) => {
        if (b.type === 'codeBlock' && b.props.language === lang && b.id !== currentCursorBlockId) {
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
          fmParseFailedRef.current = false;
          if (frontmatter) setFmData(YAML.parse(frontmatter));
        } catch {
          fmParseFailedRef.current = !!frontmatter;
          setFmData(null);
        }
        wikilinkNamesRef.current = new Set();
        const safeContent = toEditorMarkdown(content, {
          docBaseUri: docBaseUriRef.current,
          wikilinkNames: wikilinkNamesRef.current
        });

        isInitializing.current = true;
        if (!editor) {
          const newEditor = BlockNoteEditor.create({ 
            schema: buildSchema(configRef.current.defaultCodeLanguage), 
            uploadFile,
            _tiptapOptions: {
              extensions: [SearchHighlightExtension],
            },
            pasteHandler: ({ defaultPasteHandler }) => {
              return defaultPasteHandler({
                plainTextAsMarkdown: true,
                prioritizeMarkdownOverHTML: false
              });
            },
            editorProps: {
              attributes: {
                spellcheck: configRef.current.spellCheck ? "true" : "false"
              }
            }
          });
          let blocks = await newEditor.tryParseMarkdownToBlocks(safeContent);
          blocks = processBlocksFromMarkdown(blocks);
          newEditor.replaceBlocks(newEditor.document, blocks);
          // 초기 로드는 되돌릴 대상이 아니다 — undo 히스토리를 비워 첫 Ctrl+Z가
          // 문서를 빈 상태로 만드는 것을 막는다
          clearUndoHistory(newEditor);
          try {
            const tiptap = (newEditor as any)._tiptapEditor;
            if (tiptap) {
              const state = tiptap.editorState || tiptap.state;
              const view = tiptap.editorView || tiptap.view;
              if (typeof tiptap.registerPlugin === 'function') {
                tiptap.registerPlugin(createSearchPlugin());
              } else if (state && view) {
                const searchPlugin = createSearchPlugin();
                const existingPlugins = state.plugins || [];
                const filteredPlugins = existingPlugins.filter((p: any) => p.key !== (searchPluginKey as any).key);
                const newState = state.reconfigure({ plugins: [searchPlugin, ...filteredPlugins] });
                view.updateState(newState);
              }
            }
          } catch (err) {
            console.error("Failed to register searchPlugin", err);
            diag('search_plugin_register_failed');
          }
          (window as any).__editor = newEditor;
          setEditor(newEditor);

          // 왕복 자가검증: 편집이 0인 지금 직렬화해 원문과 견준다.
          // 여기서 나는 차이는 전부 왕복 변환 손실이므로 오탐이 없다.
          // 편집 흐름을 막지 않도록 다음 틱으로 미룬다.
          setTimeout(() => {
            try {
              const blocksForMd = processBlocksToMarkdown(newEditor.document);
              Promise.resolve(newEditor.blocksToMarkdownLossy(blocksForMd as any)).then((md: string) => {
                let out = normalizeOrderedListNumbers(md);
                out = normalizeUnorderedListBullets(out);
                out = preserveMarkdownLineBreaks(out);
                out = fromEditorMarkdown(out, {
                  docBaseUri: docBaseUriRef.current,
                  wikilinkNames: wikilinkNamesRef.current
                });
                const drift = compareRoundtrip(content, out);
                if (drift) {
                  diag('roundtrip_drift', {
                    removed: drift.removed,
                    added: drift.added,
                    kinds: drift.kinds,
                    lines: content.split('\n').length
                  });
                }
              }).catch(() => diag('roundtrip_check_failed'));
            } catch {
              diag('roundtrip_check_failed');
            }
          }, 0);
          extractHeadings(newEditor);
          // Reset edit flag after initialization
          hasEdited.current = false;

          // 모드 전환 시 기억한 헤딩 또는 저장된 스크롤 위치로 복원
          setTimeout(() => {
            const target = pendingHeadingRef.current;
            if (target) {
              pendingHeadingRef.current = null;
              // n번째 일치에서 멈춘다. 일치가 부족하면 마지막 일치로 떨어져 무해하다.
              let seen = 0;
              let lastMatchId: string | null = null;
              newEditor.forEachBlock((b: any) => {
                if (b.type === 'heading') {
                  const text = b.content?.map((c: any) => c.text || '').join('') || '';
                  if (text.trim() === target.text) {
                    lastMatchId = b.id;
                    if (seen === target.ordinal) return false;
                    seen++;
                  }
                }
                return true;
              });
              if (lastMatchId) {
                document.querySelector(`[data-id="${lastMatchId}"]`)?.scrollIntoView({ block: 'start' });
              }
            } else if (scrollRef.current) {
              // 헤딩이 없는 문서는 저장된 스크롤 위치로 돌아간다
              const saved = vscode.getState();
              if (saved?.scrollTop) scrollRef.current.scrollTop = saved.scrollTop;
            }
          }, 150);
        } else {
          // External update or refresh: replace existing blocks.
          // replaceBlocks는 커서를 문서 끝으로 보내므로, 블록 인덱스 기준으로 복원
          // (블록 id는 재파싱 시 재생성되어 id로는 복원 불가)
          let cursorIdx = -1;
          let tipTapSelection: any = null;
          try {
            const tiptap = (editor as any)._tiptapEditor;
            if (tiptap && tiptap.state && tiptap.state.selection) {
              tipTapSelection = {
                from: tiptap.state.selection.from,
                to: tiptap.state.selection.to
              };
            }
            const cur = editor.getTextCursorPosition();
            cursorIdx = editor.document.findIndex((b: any) => b.id === cur?.block?.id);
          } catch { /* noop */ }
          
          let blocks = await editor.tryParseMarkdownToBlocks(safeContent);
          blocks = processBlocksFromMarkdown(blocks);
          editor.replaceBlocks(editor.document, blocks);
          // 외부 변경으로 문서 전체가 갈렸다. 이 교체가 undo 스택에 남으면 Ctrl+Z 한 번이
          // 외부 변경을 통째로 되돌리고, 그 이전 스텝들은 위치가 어긋나 무의미하다.
          clearUndoHistory(editor);
          extractHeadings(editor);
          
          if (tipTapSelection) {
            try {
              const tiptap = (editor as any)._tiptapEditor;
              if (tiptap) {
                // DOM 업데이트 후 selection 복원
                setTimeout(() => {
                  try {
                    const docSize = tiptap.state.doc.content.size;
                    const safeFrom = Math.max(1, Math.min(tipTapSelection.from, docSize - 1));
                    const safeTo = Math.max(1, Math.min(tipTapSelection.to, docSize - 1));
                    tiptap.commands.setTextSelection({
                      from: safeFrom,
                      to: safeTo
                    });
                    if (document.activeElement && document.activeElement.closest('.bn-editor')) {
                      tiptap.commands.focus();
                    }
                  } catch {}
                }, 0);
              }
            } catch { /* noop */ }
          } else if (cursorIdx >= 0) {
            try {
              const doc = editor.document;
              const target = doc[Math.min(cursorIdx, doc.length - 1)];
              if (target) editor.setTextCursorPosition(target, 'end');
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

  // 현재 에디터 내용을 디스크에 쓸 전체 텍스트로 만든다.
  // 실제 전송과 디바운스·flush·경합 조정은 useDocumentSync가 맡는다.
  const buildDocumentText = async (): Promise<string | null> => {
    if (!editor) return null;
    extractHeadings(editor);
    const markdown = await generateMarkdownFromEditor(true);

    // 본문의 #태그를 프론트매터 tags에 반영.
    // YAML 파싱에 실패한 프론트매터는 건드리지 않는다 (전체 재직렬화가 주석과 미지의 키를 날림).
    let updatedFmString = parsedFrontmatter;
    const extractedTags = extractTagsFromMarkdown(markdown);
    if (extractedTags.length > 0 && parsedFrontmatter && !fmParseFailedRef.current) {
      const currentTags: string[] = Array.isArray(fmData?.tags) ? fmData.tags : [];
      const newTags = Array.from(new Set([...currentTags, ...extractedTags]));
      if (newTags.length !== currentTags.length) {
        try {
          // Document API로 tags 키만 갱신 — 주석·빈 줄·인용 스타일 보존
          const doc = YAML.parseDocument(parsedFrontmatter);
          doc.set('tags', newTags);
          updatedFmString = doc.toString().trim();
          setParsedFrontmatter(updatedFmString);
          setFmData({ ...(fmData || {}), tags: newTags });
        } catch {
          updatedFmString = parsedFrontmatter;
        }
      }
    }

    return updatedFmString ? `---
${updatedFmString}
---
${markdown}` : markdown;
  };
  buildDocumentTextRef.current = buildDocumentText;

  const saveToHost = (fmString: string, mdString: string) => {
    const fullText = fmString ? `---\n${fmString}\n---\n${mdString}` : mdString;
    lastSentTextRef.current = fullText;
    lastInitializedTextRef.current = fullText;
    setDocumentText(fullText);
    postChange(fullText);
  };

  const generateMarkdownFromEditor = async (skipAutoFix = false) => {
    if (!editor) return "";
    const blocksForMd = processBlocksToMarkdown(editor.document);
    let markdown = await editor.blocksToMarkdownLossy(blocksForMd as any);
    


    markdown = normalizeOrderedListNumbers(markdown);
    markdown = normalizeUnorderedListBullets(markdown);
    markdown = preserveMarkdownLineBreaks(markdown);
    
    if (config.autoFix && !skipAutoFix) {
      try {
        const prettier = await import('prettier/standalone');
        const prettierPluginMarkdown = await import('prettier/plugins/markdown');
        const formatted = await prettier.format(markdown, { parser: "markdown", plugins: [prettierPluginMarkdown.default || prettierPluginMarkdown] });
        if (formatted && typeof formatted === 'string' && formatted.trim().length > 0) {
          markdown = formatted;
        }
      } catch (e) {
        console.warn("Auto fix formatting skipped due to parser warning/error:", e);
      }
    }
    
    // 직렬화 체인. markdownPipeline.ts가 파싱 체인과 나란히 담는다.
    return fromEditorMarkdown(markdown, { docBaseUri: docBaseUriRef.current, wikilinkNames: wikilinkNamesRef.current });
  };

  useEffect(() => {
    if (editor) {
      const editorDom = document.querySelector('.bn-editor') as HTMLElement;
      if (editorDom) {
        editorDom.setAttribute('spellcheck', config.spellCheck ? "true" : "false");
      }
    }
  }, [config.spellCheck, editor]);

  // 타자기 스크롤링: 키보드 입력/이동 시 활성 커서 라인을 뷰포트 수직 중앙(~45%)에 정렬
  const handleTypewriterScroll = useCallback(() => {
    if (!configRef.current.typewriterMode || !scrollRef.current) return;
    requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container) return;

      let targetY: number | null = null;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect && rect.height > 0 && rect.top > 0) {
          targetY = rect.top + rect.height / 2;
        }
      }

      if (targetY === null && editor) {
        try {
          const cur = editor.getTextCursorPosition();
          if (cur?.block?.id) {
            const el = container.querySelector(`[data-id="${cur.block.id}"]`);
            if (el) {
              const elRect = el.getBoundingClientRect();
              targetY = elRect.top + 16;
            }
          }
        } catch { /* noop */ }
      }

      if (targetY !== null) {
        const containerRect = container.getBoundingClientRect();
        const relativeY = targetY - containerRect.top;
        const desiredY = containerRect.height * 0.45;
        const delta = relativeY - desiredY;
        if (Math.abs(delta) > 8) {
          container.scrollTop += delta;
        }
      }
    });
  }, [editor]);

  // 훅에서 최신 handleWysiwygChange를 부르기 위한 ref (선언 순서 역전 회피)
  const handleWysiwygChangeRef = useRef<() => void>(() => {});

  const handleWysiwygChange = () => {
    if (!editor || isInitializing.current) return;
    hasEdited.current = true;
    lastEditTimeRef.current = Date.now();
    // 편집으로 매치 위치가 바뀌었으니 검색 위젯의 개수를 다시 읽는다
    syncMatchesFromPlugin();
    // 아직 편집 중이면 보류한 외부 변경의 채택을 미룬다
    deferPending();
    debouncedSerialize();
    if (configRef.current.typewriterMode) {
      handleTypewriterScroll();
    }
  };
  handleWysiwygChangeRef.current = handleWysiwygChange;

  const handleFmChange = async (key: string, value: any) => {
    if (!editor) return;
    const currentData = fmData || {};
    const newData = { ...currentData };
    if (value === undefined) {
      delete newData[key];
    } else {
      newData[key] = value;
    }
    setFmData(newData);
    // Document API로 해당 키만 수정/삭제해 주석·빈 줄·인용 스타일을 보존
    // (전체 재직렬화는 frontmatter의 주석을 모두 날림)
    let newFmString: string;
    try {
      if (parsedFrontmatter) {
        const doc = YAML.parseDocument(parsedFrontmatter);
        if (value === undefined) {
          doc.delete(key);
        } else {
          doc.set(key, value);
        }
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
        if (isHolding() || configRef.current.isReadOnly) return;
        // 대기 중인 디바운스 직렬화가 나중에 도착해 autoFix 결과를 덮어쓰지 않게 취소
        debouncedSerialize.cancel();
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
          diag('autofix_failed');
        }
      }
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.autoFix, isRawMode, editor, parsedFrontmatter]);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 자체 Search/Replace 위젯을 Ctrl+F와 Ctrl+H 모두에 연동한다 (WYSIWYG 모드에서)
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'h')) {
        if (!isRawMode) {
          e.preventDefault();
          e.stopPropagation();

          // 에디터에서 드래그/선택된 텍스트가 있으면 검색어로 자동 반영
          let selectedText = '';
          if (editor) {
            const tiptap = (editor as any)?._tiptapEditor;
            if (tiptap) {
              const { from, to } = tiptap.state.selection;
              if (from !== to) {
                selectedText = tiptap.state.doc.textBetween(from, to, ' ');
              }
            }
          }
          if (selectedText) {
            setSearchQuery(selectedText);
            setActiveIndex(0);
          }

          setShowSearchReplace(true);
          if (e.key.toLowerCase() === 'h') {
            setIsReplaceOpen(true);
            setTimeout(() => {
              replaceInputRef.current?.focus();
              replaceInputRef.current?.select();
            }, 50);
          } else {
            setTimeout(() => {
              searchInputRef.current?.focus();
              searchInputRef.current?.select();
            }, 50);
          }
        }
      } else if (e.key === 'Escape' && showSearchReplace) {
        setShowSearchReplace(false);
        editor?.focus?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearchReplace, isRawMode, editor]);

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
        // 스크롤 위치를 디바운스 대기 없이 즉시 저장한다 (헤딩이 없는 문서의 폴백)
        if (scrollRef.current) {
          if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
          vscode.updateState({ scrollTop: scrollRef.current.scrollTop });
        }
        let current: { text: string, ordinal: number } | null = null;
        let seenSameText = 0;
        for (const h of headings) {
          const el = document.querySelector(`[data-id="${h.id}"]`);
          if (!el) continue;
          if ((el as HTMLElement).getBoundingClientRect().top <= 120) {
            seenSameText = headings.slice(0, headings.indexOf(h)).filter(x => x.text === h.text).length;
            current = { text: h.text, ordinal: seenSameText };
          } else break;
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
            if (!m) continue;
            const text = m[1].trim();
            // 이 헤딩이 같은 제목 가운데 몇 번째인지 위쪽에서 센다
            let ordinal = 0;
            for (let j = 0; j < i; j++) {
              const p = lines[j].match(/^#{1,6}\s+(.+)/);
              if (p && p[1].trim() === text) ordinal++;
            }
            pendingHeadingRef.current = { text, ordinal };
            break;
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
        diag('mode_toggle_serialize_failed');
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
      diag('block_type_apply_failed');
    }
  };

  const getCanUndo = () => {
    if (!editor || isRawMode) return false;
    const tiptap = (editor as any)?._tiptapEditor;
    const state = tiptap?.editorState || tiptap?.state;
    return state ? undoDepth(state) > 0 : false;
  };

  const getCanRedo = () => {
    if (!editor || isRawMode) return false;
    const tiptap = (editor as any)?._tiptapEditor;
    const state = tiptap?.editorState || tiptap?.state;
    return state ? redoDepth(state) > 0 : false;
  };

  const handleUndo = () => {
    if (!editor || isRawMode) return;
    lastUndoTimeRef.current = Date.now();
    const tiptap = (editor as any)?._tiptapEditor;
    if (tiptap) {
      const view = tiptap.editorView || tiptap.view;
      const state = tiptap.editorState || tiptap.state;
      if (view && state) {
        const didUndo = pmUndo(state, view.dispatch);
        if (didUndo) {
          handleWysiwygChange();
          return;
        }
      }
    }
    vscode.postMessage({ type: 'undo' });
  };

  const handleRedo = () => {
    if (!editor || isRawMode) return;
    lastUndoTimeRef.current = Date.now();
    const tiptap = (editor as any)?._tiptapEditor;
    if (tiptap) {
      const view = tiptap.editorView || tiptap.view;
      const state = tiptap.editorState || tiptap.state;
      if (view && state) {
        const didRedo = pmRedo(state, view.dispatch);
        if (didRedo) {
          handleWysiwygChange();
          return;
        }
      }
    }
    vscode.postMessage({ type: 'redo' });
  };

  const handleKeyDownCapture = createEditorKeymap({ editor, isRawMode, handleUndo, handleRedo, applyBlockTypeToSelection });

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

  const { bgColor, textColor, headerBg, blockNoteTheme, cmTheme, dropdownBg, dropdownBorder, accentColor } = themePalette;


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: bgColor, color: textColor }}>
      
      {/* VS Code Style Find & Replace Widget */}
      {showSearchReplace && !isRawMode && (
        <div className="vscode-find-widget" role="search" aria-label="Find and Replace">
          {/* Find Row */}
          <div className="find-widget-row">
            <button 
              type="button"
              className="find-toggle-btn"
              onClick={() => setIsReplaceOpen(prev => !prev)}
              title={isReplaceOpen ? "Toggle Replace" : "Toggle Replace (Ctrl+H)"}
              aria-expanded={isReplaceOpen}
            >
              {isReplaceOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            <div className={`find-input-box-wrapper ${regexError ? 'has-error' : ''}`} title={regexError || undefined}>
              <input 
                ref={searchInputRef}
                id="search-input"
                className="find-native-input"
                placeholder="Find" 
                value={searchQuery} 
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setActiveIndex(0);
                }} 
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.shiftKey) handleFindPrev();
                    else handleFindNext();
                  } else if (e.key === 'Escape') {
                    setShowSearchReplace(false);
                    editor?.focus?.();
                  } else if (e.altKey && e.key.toLowerCase() === 'c') {
                    e.preventDefault();
                    setMatchCase(prev => !prev);
                  } else if (e.altKey && e.key.toLowerCase() === 'w') {
                    e.preventDefault();
                    setWholeWord(prev => !prev);
                  } else if (e.altKey && e.key.toLowerCase() === 'r') {
                    e.preventDefault();
                    setIsRegex(prev => !prev);
                  }
                }} 
                autoFocus
              />
              <div className="find-inline-options">
                <button 
                  type="button"
                  onMouseDown={e => e.preventDefault()} 
                  onClick={() => setMatchCase(prev => !prev)}
                  className={`find-option-btn ${matchCase ? 'active' : ''}`}
                  title="Match Case (Alt+C)"
                  aria-label="Match Case"
                  aria-pressed={matchCase}
                >
                  <CaseSensitiveIcon />
                </button>
                <button 
                  type="button"
                  onMouseDown={e => e.preventDefault()} 
                  onClick={() => setWholeWord(prev => !prev)}
                  className={`find-option-btn ${wholeWord ? 'active' : ''}`}
                  title="Match Whole Word (Alt+W)"
                  aria-label="Match Whole Word"
                  aria-pressed={wholeWord}
                >
                  <WholeWordIcon />
                </button>
                <button 
                  type="button"
                  onMouseDown={e => e.preventDefault()} 
                  onClick={() => setIsRegex(prev => !prev)}
                  className={`find-option-btn ${isRegex ? 'active' : ''}`}
                  title="Use Regular Expression (Alt+R)"
                  aria-label="Use Regular Expression"
                  aria-pressed={isRegex}
                >
                  <RegexIcon />
                </button>
              </div>
            </div>

            <div className={`find-count-label ${searchQuery && matchCount === 0 ? 'no-results' : ''}`}>
              {searchQuery ? (matchCount > 0 ? `${activeIndex + 1} of ${matchCount}` : 'No results') : ''}
            </div>

            <button 
              type="button"
              className="find-action-btn"
              onMouseDown={e => e.preventDefault()} 
              onClick={handleFindPrev} 
              disabled={!searchQuery || matchCount === 0}
              title="Previous Match (Shift+Enter)"
            >
              <ChevronUp size={14} />
            </button>
            <button 
              type="button"
              className="find-action-btn"
              onMouseDown={e => e.preventDefault()} 
              onClick={handleFindNext} 
              disabled={!searchQuery || matchCount === 0}
              title="Next Match (Enter)"
            >
              <ChevronDown size={14} />
            </button>
            <button 
              type="button"
              className="find-action-btn"
              onClick={() => {
                setShowSearchReplace(false);
                editor?.focus?.();
              }} 
              title="Close (Escape)"
            >
              <X size={14} />
            </button>
          </div>

          {/* Replace Row */}
          {isReplaceOpen && (
            <div className="find-widget-row">
              <div className="find-toggle-placeholder" />
              <div className="find-input-box-wrapper">
                <input 
                  ref={replaceInputRef}
                  id="replace-input"
                  className="find-native-input"
                  placeholder="Replace" 
                  value={replaceQuery} 
                  onChange={e => setReplaceQuery(e.target.value)} 
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (e.ctrlKey && e.altKey) {
                        handleReplaceAll();
                      } else {
                        handleReplace();
                      }
                    } else if (e.key === 'Escape') {
                      setShowSearchReplace(false);
                      editor?.focus?.();
                    } else if (e.altKey && e.key.toLowerCase() === 'c') {
                      e.preventDefault();
                      setMatchCase(prev => !prev);
                    } else if (e.altKey && e.key.toLowerCase() === 'w') {
                      e.preventDefault();
                      setWholeWord(prev => !prev);
                    } else if (e.altKey && e.key.toLowerCase() === 'r') {
                      e.preventDefault();
                      setIsRegex(prev => !prev);
                    }
                  }} 
                />
              </div>

              <div className="find-count-placeholder" />

              <button 
                type="button"
                className="find-action-btn"
                onMouseDown={e => e.preventDefault()} 
                onClick={handleReplace} 
                disabled={!searchQuery || matchCount === 0}
                title="Replace (Enter)"
              >
                <Replace size={14} />
              </button>
              <button 
                type="button"
                className="find-action-btn"
                onMouseDown={e => e.preventDefault()} 
                onClick={handleReplaceAll} 
                disabled={!searchQuery || matchCount === 0}
                title="Replace All (Ctrl+Alt+Enter)"
              >
                <ReplaceAll size={14} />
              </button>
              <div className="find-action-placeholder" />
            </div>
          )}
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
              <div style={{ width: '1px', height: '14px', background: dropdownBorder, margin: '0 4px' }} />
              
              {/* Segmented View Mode Toggle */}
              <div className="segmented-control">
                <button
                  onClick={() => { if (isRawMode) toggleMode(); }}
                  className={`segmented-btn ${!isRawMode ? 'active' : ''}`}
                  data-tooltip="WYSIWYG Rich Mode"
                >
                  <Edit3 size={13} />
                  <span>WYSIWYG</span>
                </button>
                <button
                  onClick={() => { if (!isRawMode) toggleMode(); }}
                  className={`segmented-btn ${isRawMode ? 'active' : ''}`}
                  data-tooltip="Raw Markdown Mode"
                >
                  <Code size={13} />
                  <span>Raw</span>
                </button>
              </div>

              {/* Quick Stats Badge */}
              {config.showWordCount && (
                <div className="quick-stats-badge" style={{ marginLeft: '6px', marginRight: '6px' }}>
                  <span className="quick-stat-item">
                    {typeof documentText === 'string' && documentText.trim() ? documentText.trim().split(/\s+/).length : 0} words
                  </span>
                  <span>•</span>
                  <span className="quick-stat-item">
                    {typeof documentText === 'string' ? documentText.length : 0} chars
                  </span>
                </div>
              )}

              {isRawMode ? (
                <button
                  onClick={() => {
                    if (!isDiffMode && originalText === null) {
                      vscode.postMessage({ type: 'getOriginalContent' });
                    }
                    setIsDiffMode(!isDiffMode);
                  }}
                  className={`tb-btn action-icon-btn ${isDiffMode ? 'tb-btn-active' : ''}`}
                  data-tooltip="Toggle Git Diff View"
                >
                  <GitCompare size={13} style={{ marginRight: '3px' }} />
                  Diff
                </button>
              ) : (
                <button 
                  onClick={() => updateConfig('showToc', !showToc)} 
                  className={`tb-btn action-icon-btn ${showToc ? 'tb-btn-active' : ''}`}
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
            className="tb-btn action-icon-btn"
            data-tooltip="Export Document as PDF"
            data-tooltip-pos="right"
          >
            <Printer size={13} style={{ marginRight: '3px' }} />
            <span>PDF</span>
          </button>
          {parsedFrontmatter && (
            <button 
              onClick={() => updateConfig('showProperties', !showProperties)} 
              className={`tb-btn action-icon-btn ${showProperties ? 'tb-btn-active' : ''}`}
              data-tooltip="Toggle Properties"
              data-tooltip-pos="right"
            >
              <Info size={14} />
            </button>
          )}
          <button 
            onClick={() => vscode.postMessage({ type: 'refresh' })}
            className="tb-btn action-icon-btn"
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
            className="tb-btn action-icon-btn"
            data-tooltip="Validate Media Links"
            data-tooltip-pos="right"
          >
            <AlertTriangle size={14} />
          </button>
          <div style={{ position: 'relative' }} ref={settingsRef}>
            <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="tb-btn action-icon-btn"
              data-tooltip="Settings"
              data-tooltip-pos="right"
            >
              <Settings size={14} />
            </button>

          {isSettingsOpen && (
            <div className="glass-panel" style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              backgroundColor: dropdownBg,
              border: `1px solid ${dropdownBorder}`,
              borderRadius: '8px',
              padding: '16px',
              zIndex: 1000,
              minWidth: '350px',
              color: textColor,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Editor Settings</h3>
                <X size={16} cursor="pointer" onClick={() => setIsSettingsOpen(false)} style={{ opacity: 0.7 }} />
              </div>

              <div className="settings-group-title">Appearance</div>
              
              <div className="settings-item">
                <div className="settings-item-label">
                  <Palette size={14} opacity={0.7} />
                  <span>Theme</span>
                </div>
                <select
                  className="settings-select"
                  value={config.theme}
                  onChange={(e) => updateConfig('theme', e.target.value)}
                  style={{ fontSize: '12px', padding: '4px', borderRadius: '4px', background: bgColor, color: textColor, border: `1px solid ${dropdownBorder}` }}
                >
                  <option value="auto">Auto (VS Code)</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="nord">Nord</option>
                  <option value="one-half-dark">One Half Dark</option>
                  <option value="solarized-dark">Solarized</option>
                  <option value="vintage">Vintage</option>
                  <option value="gruvbox-dark">Gruvbox</option>
                  <option value="tokyo-night-day">Tokyo Night</option>
                  <option value="orca">Orca</option>
                </select>
              </div>

              <div className="settings-item">
                <div className="settings-item-label">
                  <Type size={14} opacity={0.7} />
                  <span>Font Size</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button 
                    onClick={() => updateConfig('fontSize', Math.max(10, config.fontSize - 1))}
                    style={{ padding: '2px 8px', borderRadius: '4px', border: `1px solid ${dropdownBorder}`, background: bgColor, color: textColor, cursor: 'pointer' }}
                  >-</button>
                  <span style={{ fontSize: '12px', minWidth: '24px', textAlign: 'center' }}>{config.fontSize}</span>
                  <button 
                    onClick={() => updateConfig('fontSize', Math.min(32, config.fontSize + 1))}
                    style={{ padding: '2px 8px', borderRadius: '4px', border: `1px solid ${dropdownBorder}`, background: bgColor, color: textColor, cursor: 'pointer' }}
                  >+</button>
                </div>
              </div>

              <div className="settings-item">
                <div className="settings-item-label">
                  <Maximize2 size={14} opacity={0.7} />
                  <span>Content Width</span>
                </div>
                <select
                  className="settings-select"
                  value={config.contentWidth}
                  onChange={(e) => updateConfig('contentWidth', e.target.value)}
                  style={{ fontSize: '12px', padding: '4px', borderRadius: '4px', background: bgColor, color: textColor, border: `1px solid ${dropdownBorder}` }}
                >
                  <option value="narrow">Narrow</option>
                  <option value="standard">Standard</option>
                  <option value="full">Full Width</option>
                </select>
              </div>

              <div className="settings-item">
                <div className="settings-item-label">
                  <Edit3 size={14} opacity={0.7} />
                  <span>Default Mode</span>
                </div>
                <select
                  className="settings-select"
                  value={config.defaultMode}
                  onChange={(e) => updateConfig('defaultMode', e.target.value)}
                  style={{ fontSize: '12px', padding: '4px', borderRadius: '4px', background: bgColor, color: textColor, border: `1px solid ${dropdownBorder}` }}
                >
                  <option value="wysiwyg">WYSIWYG</option>
                  <option value="raw">Raw Markdown</option>
                </select>
              </div>

              <div className="settings-group-title">Behavior</div>

              <div className="settings-item">
                <label className="settings-item-label">
                  <Zap size={14} opacity={0.7} />
                  <span>Auto Fix on Edit</span>
                </label>
                <label className="toggle-switch">
                  <input type="checkbox" checked={config.autoFix} onChange={(e) => updateConfig('autoFix', e.target.checked)} />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="settings-item">
                <label className="settings-item-label">
                  <RefreshCcw size={14} opacity={0.7} />
                  <span>Auto Refresh File</span>
                </label>
                <label className="toggle-switch">
                  <input type="checkbox" checked={config.autoRefresh} onChange={(e) => updateConfig('autoRefresh', e.target.checked)} />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="settings-item">
                <label className="settings-item-label">
                  <Eye size={14} opacity={0.7} />
                  <span>Focus Mode</span>
                </label>
                <label className="toggle-switch">
                  <input type="checkbox" checked={config.focusMode} onChange={(e) => updateConfig('focusMode', e.target.checked)} />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="settings-item">
                <label className="settings-item-label">
                  <Wand2 size={14} opacity={0.7} />
                  <span>Spell Check</span>
                </label>
                <label className="toggle-switch">
                  <input type="checkbox" checked={config.spellCheck} onChange={(e) => updateConfig('spellCheck', e.target.checked)} />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="settings-item">
                <label className="settings-item-label">
                  <FileText size={14} opacity={0.7} />
                  <span>Show Word Count</span>
                </label>
                <label className="toggle-switch">
                  <input type="checkbox" checked={config.showWordCount} onChange={(e) => updateConfig('showWordCount', e.target.checked)} />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="settings-item">
                <label className="settings-item-label">
                  <Pilcrow size={14} opacity={0.7} />
                  <span>Formatting Toolbar</span>
                </label>
                <label className="toggle-switch">
                  <input type="checkbox" checked={config.showFormattingToolbar} onChange={(e) => updateConfig('showFormattingToolbar', e.target.checked)} />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="settings-item">
                <label className="settings-item-label">
                  <Type size={14} opacity={0.7} />
                  <span>Typewriter Mode</span>
                </label>
                <label className="toggle-switch">
                  <input type="checkbox" checked={config.typewriterMode} onChange={(e) => updateConfig('typewriterMode', e.target.checked)} />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="settings-group-title">Document</div>

              <div className="settings-item">
                <label className="settings-item-label">
                  <List size={14} opacity={0.7} />
                  <span>Show Table of Contents</span>
                </label>
                <label className="toggle-switch">
                  <input type="checkbox" checked={config.showToc} onChange={(e) => updateConfig('showToc', e.target.checked)} />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="settings-item">
                <label className="settings-item-label">
                  <FileText size={14} opacity={0.7} />
                  <span>Show Document Properties</span>
                </label>
                <label className="toggle-switch">
                  <input type="checkbox" checked={config.showProperties} onChange={(e) => updateConfig('showProperties', e.target.checked)} />
                  <span className="toggle-slider"></span>
                </label>
              </div>

            </div>
          )}
          </div>
        </div>
      </div>
      
      {/* 2층 Orca Rich Formatting Toolbar (WYSIWYG 모드일 때만 노출) */}
      {!isRawMode && !config.isReadOnly && editor && config.showFormattingToolbar && (
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
                    // image 블록으로 넣는다. 마크다운 문자열을 문단에 넣으면
                    // 리터럴 텍스트로 남아 미리보기가 되지 않는다.
                    editor.insertBlocks([{ type: 'image', props: { url, name: file.name || 'image' } }], cur.block, 'after');
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
              extensions={cmExtensions}
              onChange={(val) => {
                lastEditTimeRef.current = Date.now();
                setDocumentText(val);
                postChange(val);
                if (config.typewriterMode && cmViewRef.current) {
                  setTimeout(() => {
                    try {
                      const view = cmViewRef.current;
                      if (view) {
                        const head = view.state.selection.main.head;
                        view.dispatch({ effects: EditorView.scrollIntoView(head, { y: 'center' }) });
                      }
                    } catch { /* noop */ }
                  }, 10);
                }
              }}
              onCreateEditor={(view: any) => {
                cmViewRef.current = view;
                // WYSIWYG에서 기억한 헤딩 위치로 스크롤 복원
                const target = pendingHeadingRef.current;
                if (target && typeof documentText === 'string') {
                  pendingHeadingRef.current = null;
                  const lines = (documentText as string).split('\n');
                  let pos = 0;
                  let seen = 0;
                  let lastMatchPos: number | null = null;
                  for (const line of lines) {
                    const m = line.match(/^#{1,6}\s+(.+)/);
                    if (m && m[1].trim() === target.text) {
                      lastMatchPos = pos;
                      if (seen === target.ordinal) break;
                      seen++;
                    }
                    pos += line.length + 1;
                  }
                  if (lastMatchPos !== null) {
                    const at = lastMatchPos;
                    setTimeout(() => {
                      try { view.dispatch({ effects: EditorView.scrollIntoView(at, { y: 'start' }) }); } catch { /* noop */ }
                    }, 50);
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
            onKeyDown={(e) => {
              if (config.typewriterMode && !['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
                setTimeout(handleTypewriterScroll, 10);
              }
            }}
            onScroll={(e) => {
              const top = e.currentTarget.scrollTop;
              if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
              scrollSaveTimer.current = setTimeout(() => vscode.updateState({ scrollTop: top }), 200);
            }}
          >
            <div style={{
              padding: '16px 32px',
              paddingBottom: config.typewriterMode ? '50vh' : '40px',
              maxWidth: config.contentWidth === 'narrow' ? '700px' : config.contentWidth === 'standard' ? '900px' : 'none',
              margin: '0 auto',
              width: '100%'
            }}>
              {showProperties ? (
                <FrontmatterPanel
                  parsedFrontmatter={parsedFrontmatter}
                  fmData={fmData || {}}
                  collapsed={fmCollapsed}
                  onToggleCollapsed={() => setFmCollapsed(!fmCollapsed)}
                  isDark={isDark}
                  textColor={textColor}
                  accentColor={accentColor}
                  onChange={handleFmChange}
                />
              ) : null}
              {editor && <div className={config.focusMode ? "focus-mode-active" : ""} onCopy={async (e) => {
                const selection = editor.getSelection();
                if (selection && selection.blocks && selection.blocks.length > 0) {
                  e.preventDefault();
                  try {
                    let markdown = await editor.blocksToMarkdownLossy(selection.blocks as any);
                    markdown = normalizeOrderedListNumbers(markdown);
                    markdown = normalizeUnorderedListBullets(markdown);
                    markdown = restoreHtml(markdown);

                    e.clipboardData.setData('text/plain', markdown);
                  } catch (err) {
                    console.error("Failed to copy markdown", err);
                    diag('copy_markdown_failed');
                  }
                }
              }}
              onContextMenu={(e) => {
                // 본문 영역 우클릭 시 VS Code 컨텍스트 메뉴 출력
                e.preventDefault();
                setContextMenu({
                  x: Math.min(e.clientX, window.innerWidth - 200),
                  y: Math.min(e.clientY, window.innerHeight - 240)
                });
              }}
              ><BlockNoteView editor={editor} onChange={handleWysiwygChange} theme={blockNoteTheme} formattingToolbar={false} slashMenu={false}>
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
      {/* VS Code Style Context Menu */}
      {contextMenu && (
        <div 
          className="vscode-context-menu" 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
          onMouseDown={e => e.stopPropagation()}
        >
          <div 
            className={`vscode-context-menu-item ${!getCanUndo() ? 'disabled' : ''}`}
            onClick={() => {
              if (getCanUndo()) {
                handleUndo();
                setContextMenu(null);
              }
            }}
          >
            <div className="menu-label">
              <Undo2 size={13} />
              <span>실행 취소</span>
            </div>
            <span className="menu-shortcut">Ctrl+Z</span>
          </div>

          <div 
            className={`vscode-context-menu-item ${!getCanRedo() ? 'disabled' : ''}`}
            onClick={() => {
              if (getCanRedo()) {
                handleRedo();
                setContextMenu(null);
              }
            }}
          >
            <div className="menu-label">
              <Redo2 size={13} />
              <span>다시 실행</span>
            </div>
            <span className="menu-shortcut">Ctrl+Y</span>
          </div>

          <div className="vscode-context-menu-divider" />

          <div 
            className="vscode-context-menu-item"
            onClick={() => {
              document.execCommand('cut');
              setContextMenu(null);
            }}
          >
            <div className="menu-label">
              <Scissors size={13} />
              <span>잘라내기</span>
            </div>
            <span className="menu-shortcut">Ctrl+X</span>
          </div>

          <div 
            className="vscode-context-menu-item"
            onClick={() => {
              document.execCommand('copy');
              setContextMenu(null);
            }}
          >
            <div className="menu-label">
              <Copy size={13} />
              <span>복사</span>
            </div>
            <span className="menu-shortcut">Ctrl+C</span>
          </div>

          <div 
            className="vscode-context-menu-item"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                if (text && editor) {
                  document.execCommand('insertText', false, text);
                }
              } catch {}
              setContextMenu(null);
            }}
          >
            <div className="menu-label">
              <Clipboard size={13} />
              <span>붙여넣기</span>
            </div>
            <span className="menu-shortcut">Ctrl+V</span>
          </div>

          <div className="vscode-context-menu-divider" />

          <div 
            className="vscode-context-menu-item"
            onClick={() => {
              setShowSearchReplace(true);
              setContextMenu(null);
            }}
          >
            <div className="menu-label">
              <Search size={13} />
              <span>찾기 / 바꾸기</span>
            </div>
            <span className="menu-shortcut">Ctrl+F</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
