import { useEffect, useState, useRef, useMemo } from 'react';
import { BlockNoteEditor, BlockNoteSchema, defaultBlockSpecs, defaultStyleSpecs, createCodeBlockSpec, SyntaxHighlightingExtension } from '@blocknote/core';
import { MermaidBlock } from './MermaidBlock';
import { createShikiHighlighter } from './shikiHighlighter';
import type { WikilinkOccurrence, TableOriginal } from './markdownTransforms';
import { quoteJoinIds, tableOriginalIds, setLiteralVerifier, processBlocksFromMarkdown, preserveMarkdownLineBreaks, extractFrontmatter, parseTableFromClipboardText, normalizeWordLists, normalizeOrderedListNumbers, normalizeUnorderedListBullets } from './markdownTransforms';
import { toEditorMarkdown, fromEditorMarkdown, makeLiteralVerifier, blocksToMarkdown, expandQuoteStructures, markdownToBlocks } from './markdownPipeline';
import type { PipelineContext } from './markdownPipeline';
import { useSearchReplace } from './useSearchReplace';
import { SettingsPanel } from './SettingsPanel';
import { TocPanel } from './TocPanel';
import { EditorContextMenu } from './EditorContextMenu';
import { customSlashMenuItems } from './slashMenuItems';
import { useCodeBlockButtons } from './useCodeBlockButtons';
import type { EditorConfig } from './SettingsPanel';
import { FindReplaceWidget } from './FindReplaceWidget';
import { isEditorElement, isPlainInputTarget } from './domTargets';
import { createEditorKeymap } from './editorKeymap';
import { useDocumentSync, normalizeMd } from './useDocumentSync';
import { compareRoundtrip } from './roundtripCheck';
import { mergeLines } from './lineMerge';
import { resolveTheme } from './themes';
import { buildEditorStyles } from './editorStyles';
import { CodeBlockMenu } from './CodeBlockMenu';
import { createSearchPlugin, searchPluginKey, SearchHighlightExtension } from './searchPlugin';

// 마크다운으로 저장되지 않는 인라인 스타일(밑줄, 글자색, 배경색)은 스키마에서 뺀다. 단축키(Ctrl+U)와 붙여 넣기로도 들어오지 않는다(추가 검토 22)
const { underline: _underline, textColor: _textColor, backgroundColor: _backgroundColor, ...markdownStyleSpecs } = defaultStyleSpecs;

// 기본 코드 언어 설정(neatMdEditor.defaultCodeLanguage)을 반영하기 위해
// 스키마는 모듈 상수가 아니라 에디터 생성 시점에 만든다
const buildSchema = (defaultCodeLanguage: string) => BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec({
      indentLineWithTab: true,
      defaultLanguage: defaultCodeLanguage || 'text',
      // supportedLanguages를 넘기지 않는다. 0.54의 기본 언어 셀렉트는 목록에 없는 언어(js 같은 별칭 포함)에서
      // 예외를 던져 에디터 전체가 그려지지 않는다. 셀렉트는 CSS로 숨겨 왔고 언어 변경은 케밥 메뉴가 맡는다.
    }),
    mermaid: MermaidBlock(),
  },
  styleSpecs: markdownStyleSpecs,
});

import { BlockNoteView } from '@blocknote/mantine';
import { SuggestionMenuController, getDefaultReactSlashMenuItems } from '@blocknote/react';
import { Settings, List, ExternalLink, Bold, Italic, Strikethrough, ListOrdered, CheckSquare, Quote, Link, Image as ImageIcon, Pilcrow, Printer } from 'lucide-react';
import { undo as pmUndo, redo as pmRedo, undoDepth, redoDepth } from 'prosemirror-history';
import '@blocknote/mantine/style.css';
import { vscode } from './vscode';


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
    // tiptap.editorState 필드는 아래 view.updateState 뒤 낡은 채 남는다. state getter는 읽을 때 뷰 상태로 맞춘다(추가 검토 24)
    const state = tiptap?.state;
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
  const [config, setConfig] = useState<EditorConfig>({
    theme: "auto",
    fontSize: 16,
    autoRefresh: true,
    showToc: false,
    isReadOnly: false,
    defaultCodeLanguage: 'text',
    spellCheck: false,
    contentWidth: 'standard',
    showWordCount: true,
    showFormattingToolbar: true
  });
  // 에디터 생성 시점(비동기)에 최신 설정을 읽기 위한 ref
  const configRef = useRef(config);
  configRef.current = config;
  // 코드블록 케밥(⋮) 메뉴 상태
  const [codeMenu, setCodeMenu] = useState<{ blockId: string, x: number, y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
  const [editor, setEditor] = useState<any>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [parsedFrontmatter, setParsedFrontmatter] = useState<string>("");
  const search = useSearchReplace(editor, () => handleWysiwygChangeRef.current());
  const {
    showSearchReplace, setShowSearchReplace, setIsReplaceOpen,
    setSearchQuery, setActiveIndex,
    searchInputRef, replaceInputRef,
    syncMatchesFromPlugin,
  } = search;

  const [headings, setHeadings] = useState<{id: string, text: string, level: number}[]>([]);
  const showToc = config.showToc;
  
  const settingsRef = useRef<HTMLDivElement>(null);
  const lastEditTimeRef = useRef(0);
  const lastUndoTimeRef = useRef(0);
  const isInitializing = useRef(false);
  const docBaseUriRef = useRef<string>("");
  // parseWikilinks가 실제로 변환한 문서명 — 저장 시 그것만 [[..]]로 되돌린다
  // 동기화 계층이 부를 최신 직렬화 함수 (선언 순서 역전 회피)
  const buildDocumentTextRef = useRef<(final: boolean) => Promise<string | null>>(async () => null);
  // 원문 조각 보존: 연 때의 원문 본문 O와, O를 편집 없이 직렬화한 기준 C. 저장할 때 C→N 편집만 O에 적용한다.
  const baselineRef = useRef<{ original: string; base: string; conflictReported: boolean } | null>(null);
  // 검증하지 않은 병합 결과를 보냈는가. 그러면 저장 직전에 다시 만들어 검증한다.
  const unverifiedRef = useRef(false);
  // 앞 인용에 이어지는 인용 블록의 ID. 저장할 때 앞 인용과 `>` 빈 줄로 합치고, 화면에서는 한 인용처럼 붙여 보인다.
  const quoteJoinsRef = useRef<Set<string>>(new Set());
  // 표 블록 ID별 원문 표. 저장할 때 바뀌지 않은 행과 정렬(:-:)을 원문대로 쓴다
  const tableOriginalsRef = useRef<Map<string, TableOriginal>>(new Map());
  const [quoteJoinCss, setQuoteJoinCss] = useState('');
  const {
    lastSentTextRef, lastInitializedTextRef,
    postChange, debouncedSerialize, flush,
    holdExternal, deferPending, isHolding,
    hasUnsentEdits, conflict, resolveConflict,
  } = useDocumentSync({
    buildDocumentText: (final) => buildDocumentTextRef.current(final),
    needsFinalSerialize: () => unverifiedRef.current,
    applyExternalText: (text) => setDocumentText(text),
    isReadOnly: () => configRef.current.isReadOnly,
  });
  const wikilinkNamesRef = useRef<Set<string>>(new Set());
  // 연 문서의 [x](x.md) 모양 링크 차례. 저장할 때 원문이 [[x]]였던 차례의 링크만 되돌린다
  const wikilinkOrderRef = useRef<WikilinkOccurrence[]>([]);
  const pendingUploads = useRef<Map<string, (v: { relPath?: string, error?: string }) => void>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            autoRefresh: message.autoRefresh,
            showToc: message.showToc,
            isReadOnly: message.isReadOnly,
            defaultCodeLanguage: message.defaultCodeLanguage || 'text',
            spellCheck: message.spellCheck || false,
            contentWidth: message.contentWidth || 'standard',
            showWordCount: message.showWordCount ?? true,
            showFormattingToolbar: message.showFormattingToolbar ?? true
          });
          break;
        case 'configSaved':
          setSaveSuccess(true);
          setTimeout(() => {
            setIsSettingsOpen(false);
            setSaveSuccess(false);
            setIsSavingSettings(false);
          }, 900);
          break;
        case 'configSaveFailed':
          setIsSavingSettings(false);
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
          if (isHolding() || hasUnsentEdits() ||
              (!isUndoing && (isEditorFocused || isRecentlyEdited) && documentText !== "loading")) {
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
      if (!editor) return;
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
  }, [editor]);

  // 코드블록 호버 시 Copy 버튼과 케밥(⋮) 메뉴 버튼
  useCodeBlockButtons(setCodeMenu);


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

  useEffect(() => {
    async function initEditor() {
      if (documentText !== "loading") {
        // setEditor로 인한 이펙트 재실행에서 같은 내용을 다시 파싱하지 않음
        // (이중 파싱 + undo 스택에 replaceBlocks 중복 적재 방지)
        if (editor && lastInitializedTextRef.current === documentText) {
          return;
        }
        lastInitializedTextRef.current = documentText;
        const { frontmatter, content } = extractFrontmatter(documentText);
        setParsedFrontmatter(frontmatter);
        wikilinkNamesRef.current = new Set();
        wikilinkOrderRef.current = [];
        const quoteJoinFlags: boolean[] = [];
        const tableRows: TableOriginal[] = [];
        const openCtx: PipelineContext = {
          docBaseUri: docBaseUriRef.current,
          wikilinkNames: wikilinkNamesRef.current,
          wikilinkOrder: wikilinkOrderRef.current,
          quoteJoins: quoteJoinFlags,
          tables: tableRows
        };
        const safeContent = toEditorMarkdown(content, openCtx);
        const rememberQuoteJoins = (blocks: any[]) => {
          quoteJoinsRef.current = new Set([...quoteJoinIds(blocks, quoteJoinFlags), ...(openCtx.innerQuoteJoins ?? [])]);
          tableOriginalsRef.current = tableOriginalIds(blocks, tableRows);
          setQuoteJoinCss([...quoteJoinsRef.current].map(id =>
            `.bn-editor .bn-block-outer[data-id="${id}"] [data-content-type="quote"] blockquote { margin-top: -0.4em !important; padding-top: calc(2px + 0.4em) !important; }`
          ).join('\n'));
        };

        isInitializing.current = true;
        if (!editor) {
          const newEditor = BlockNoteEditor.create({ 
            schema: buildSchema(configRef.current.defaultCodeLanguage), 
            uploadFile,
            // 0.54부터 코드 블록 하이라이트는 스키마가 아니라 에디터 확장으로 켠다
            extensions: [SyntaxHighlightingExtension({ createHighlighter: createShikiHighlighter as any })],
            _tiptapOptions: {
              extensions: [SearchHighlightExtension],
            },
            pasteHandler: ({ event, editor: ed, defaultPasteHandler }) => {
              // Word 목록(mso-list 문단)은 ul/ol로 묶어 넘긴다
              const html = event.clipboardData?.getData('text/html');
              if (html && /mso-list/i.test(html)) {
                ed.pasteHTML(normalizeWordLists(html));
                return true;
              }
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
          setLiteralVerifier(makeLiteralVerifier(md => newEditor.tryParseMarkdownToBlocks(md)));
          let blocks = await newEditor.tryParseMarkdownToBlocks(safeContent);
          blocks = expandQuoteStructures(processBlocksFromMarkdown(blocks), openCtx, md => newEditor.tryParseMarkdownToBlocks(md));
          rememberQuoteJoins(blocks);
          newEditor.replaceBlocks(newEditor.document, blocks);
          const base = serializeBlocks(newEditor, newEditor.document);
          baselineRef.current = { original: content.replace(/\r\n/g, '\n'), base, conflictReported: false };
          unverifiedRef.current = false;
          // 초기 로드는 되돌릴 대상이 아니다 — undo 히스토리를 비워 첫 Ctrl+Z가
          // 문서를 빈 상태로 만드는 것을 막는다
          clearUndoHistory(newEditor);
          try {
            const tiptap = (newEditor as any)._tiptapEditor;
            if (tiptap) {
              const state = tiptap.state;
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
              // 연 직후 만든 기준 C가 곧 편집 없는 직렬화 결과다
              const drift = compareRoundtrip(content, base);
              if (drift) {
                diag('roundtrip_drift', {
                  removed: drift.removed,
                  added: drift.added,
                  kinds: drift.kinds,
                  lines: content.split('\n').length
                });
              }
            } catch {
              diag('roundtrip_check_failed');
            }
          }, 0);
          extractHeadings(newEditor);

          // 저장된 스크롤 위치로 복원
          setTimeout(() => {
            if (scrollRef.current) {
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
          blocks = expandQuoteStructures(processBlocksFromMarkdown(blocks), openCtx, md => editor.tryParseMarkdownToBlocks(md));
          rememberQuoteJoins(blocks);
          editor.replaceBlocks(editor.document, blocks);
          baselineRef.current = { original: content.replace(/\r\n/g, '\n'), base: serializeBlocks(editor, editor.document), conflictReported: false };
          unverifiedRef.current = false;
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
  }, [documentText, editor, lastInitializedTextRef]);

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
  const buildDocumentText = async (final = false): Promise<string | null> => {
    if (!editor) return null;
    extractHeadings(editor);
    const markdown = mergeWithOriginal(await generateMarkdownFromEditor(), final);

    // frontmatter는 연 때 떼어 둔 원문 그대로 다시 붙인다. 편집은 텍스트 에디터에서 한다.
    return parsedFrontmatter ? `---
${parsedFrontmatter}
---
${markdown}` : markdown;
  };
  buildDocumentTextRef.current = buildDocumentText;

  // 블록을 디스크에 쓸 마크다운 본문으로 만든다. 직렬화 체인은 markdownPipeline.ts가 파싱 체인과 나란히 담는다.
  const serializeBlocks = (ed: any, blocks: any[], wikilinkNames = wikilinkNamesRef.current, quoteJoins = quoteJoinsRef.current, wikilinkOrder = wikilinkOrderRef.current, tables = tableOriginalsRef.current) => {
    let markdown = blocksToMarkdown(blocks, bs => ed.blocksToMarkdownLossy(bs), quoteJoins, tables);
    markdown = normalizeOrderedListNumbers(markdown);
    markdown = normalizeUnorderedListBullets(markdown);
    markdown = preserveMarkdownLineBreaks(markdown);
    return fromEditorMarkdown(markdown, { docBaseUri: docBaseUriRef.current, wikilinkNames, wikilinkOrder });
  };

  const generateMarkdownFromEditor = async () => {
    if (!editor) return "";
    return serializeBlocks(editor, editor.document);
  };

  /** 병합 결과 R을 다시 열면 지금 에디터(N)와 같은 문서가 되는가 */
  const reopensAs = (merged: string, edited: string) => {
    const ctx: PipelineContext = { docBaseUri: docBaseUriRef.current, wikilinkNames: new Set<string>(), wikilinkOrder: [], quoteJoins: [], tables: [] };
    const blocks = markdownToBlocks(merged, ctx, md => editor!.tryParseMarkdownToBlocks(md));
    const joins = new Set([...quoteJoinIds(blocks, ctx.quoteJoins!), ...(ctx.innerQuoteJoins ?? [])]);
    return serializeBlocks(editor, blocks, ctx.wikilinkNames, joins, ctx.wikilinkOrder, tableOriginalIds(blocks, ctx.tables!)).replace(/\n+$/, '') === edited.replace(/\n+$/, '');
  };

  /** 이보다 긴 문서는 입력 중에는 검증하지 않고 저장 직전에만 검증한다. 15,000줄에서 검증 한 번이 약 0.9초다. */
  const VERIFY_EVERY_SEND_MAX_LINES = 2000;

  /** 편집 결과 N에서 사용자 편집만 원문 O에 적용한다. 병합할 수 없거나 검증에 실패하면 N을 쓴다. */
  const mergeWithOriginal = (edited: string, final: boolean): string => {
    const b = baselineRef.current;
    if (!b || !editor) return edited;
    try {
      const r = mergeLines(b.original, b.base, edited);
      if (!r) {
        diag('merge_fallback', { unmergeable: true });
        return edited;
      }
      if (r.conflicts > 0 && !b.conflictReported) {
        b.conflictReported = true;
        diag('merge_fallback', { conflicts: r.conflicts });
      }
      if (r.text === edited) {
        unverifiedRef.current = false;
        return edited;
      }
      if (final || b.original.split('\n').length <= VERIFY_EVERY_SEND_MAX_LINES) {
        unverifiedRef.current = false;
        if (!reopensAs(r.text, edited)) {
          diag('merge_fallback', { check_failed: true });
          return edited;
        }
      } else {
        unverifiedRef.current = true;
      }
      return r.text;
    } catch {
      diag('merge_fallback', { error: true });
      return edited;
    }
  };

  useEffect(() => {
    if (editor) {
      const editorDom = document.querySelector('.bn-editor') as HTMLElement;
      if (editorDom) {
        editorDom.setAttribute('spellcheck', config.spellCheck ? "true" : "false");
      }
    }
  }, [config.spellCheck, editor]);

  // 훅에서 최신 handleWysiwygChange를 부르기 위한 ref (선언 순서 역전 회피)
  const handleWysiwygChangeRef = useRef<() => void>(() => {});

  const handleWysiwygChange = () => {
    if (!editor || isInitializing.current) return;
    lastEditTimeRef.current = Date.now();
    // 편집으로 매치 위치가 바뀌었으니 검색 위젯의 개수를 다시 읽는다
    syncMatchesFromPlugin();
    // 아직 편집 중이면 보류한 외부 변경의 채택을 미룬다
    deferPending();
    debouncedSerialize();
  };
  handleWysiwygChangeRef.current = handleWysiwygChange;



  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 자체 Search/Replace 위젯을 Ctrl+F와 Ctrl+H 모두에 연동한다
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'h')) {
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
      } else if (e.key === 'Escape' && showSearchReplace) {
        setShowSearchReplace(false);
        editor?.focus?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearchReplace, editor, setSearchQuery, setActiveIndex, setShowSearchReplace, setIsReplaceOpen, searchInputRef, replaceInputRef]);

  useEffect(() => {
    const handleWindowScroll = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener('scroll', handleWindowScroll);
    return () => window.removeEventListener('scroll', handleWindowScroll);
  }, []);

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
    if (!editor) return false;
    const tiptap = (editor as any)?._tiptapEditor;
    const state = tiptap?.state;
    return state ? undoDepth(state) > 0 : false;
  };

  const getCanRedo = () => {
    if (!editor) return false;
    const tiptap = (editor as any)?._tiptapEditor;
    const state = tiptap?.state;
    return state ? redoDepth(state) > 0 : false;
  };

  const handleUndo = () => {
    if (!editor) return;
    lastUndoTimeRef.current = Date.now();
    const tiptap = (editor as any)?._tiptapEditor;
    if (tiptap) {
      const view = tiptap.editorView || tiptap.view;
      const state = tiptap.state;
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
    if (!editor) return;
    lastUndoTimeRef.current = Date.now();
    const tiptap = (editor as any)?._tiptapEditor;
    if (tiptap) {
      const view = tiptap.editorView || tiptap.view;
      const state = tiptap.state;
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

  const handleKeyDownCapture = createEditorKeymap({ editor, handleUndo, handleRedo, applyBlockTypeToSelection });

  const updateConfig = (key: string, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    vscode.postMessage({ type: 'updateConfig', key, value });
  };

  const handleSaveSettings = () => {
    setIsSavingSettings(true);
    vscode.postMessage({ type: 'saveAllConfig', config: configRef.current });
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

  const { bgColor, textColor, headerBg, blockNoteTheme, dropdownBg, dropdownBorder } = themePalette;


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: bgColor, color: textColor }}>
      
      {showSearchReplace && (
        <FindReplaceWidget search={search} onClose={() => { setShowSearchReplace(false); editor?.focus?.(); }} />
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
            data-tooltip="Open in VS Code text editor (view or edit the source)"
            data-tooltip-pos="left"
          >
            <ExternalLink size={12} style={{ marginRight: '3px' }} />
            Text Editor
          </button>
          {!config.isReadOnly && (
            <>
              <div style={{ width: '1px', height: '14px', background: dropdownBorder, margin: '0 4px' }} />

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
            <SettingsPanel
              config={config}
              updateConfig={updateConfig}
              colors={{ bgColor, textColor, dropdownBg, dropdownBorder }}
              onClose={() => setIsSettingsOpen(false)}
              onSave={handleSaveSettings}
              saving={isSavingSettings}
              saved={saveSuccess}
            />
          )}
          </div>
        </div>
      </div>
      
      {/* 2층 Orca Rich Formatting Toolbar */}
      {!config.isReadOnly && editor && config.showFormattingToolbar && (
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
        {quoteJoinCss && <style>{quoteJoinCss}</style>}

        {/* 좌측 사이드바 TOC 패널 (Orca 스타일) */}
        {showToc && headings.length > 0 && (
          <TocPanel headings={headings} colors={{ headerBg, dropdownBorder }} onClose={() => updateConfig('showToc', false)} />
        )}

        {/* 메인 에디터 영역 (오른쪽 패널) */}
        <div style={{ flex: 1, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {conflict && (
          <div className="external-conflict-bar" role="alert">
            <span>This file changed outside the editor while you had unsaved edits.</span>
            <button onMouseDown={e => e.preventDefault()} onClick={() => { void resolveConflict('mine'); }}>Keep my edits</button>
            <button onMouseDown={e => e.preventDefault()} onClick={() => { void resolveConflict('external'); }}>Use external version</button>
            <button onMouseDown={e => e.preventDefault()} onClick={async () => {
              // 보내지 않은 로컬 내용을 VS Code 비교 편집기에서 외부 내용과 나란히 본다. 막대와 보류 상태는 그대로다
              const text = await buildDocumentTextRef.current(true);
              if (text !== null) vscode.postMessage({ type: 'showDiff', text });
            }}>Compare</button>
          </div>
        )}
          <div
            ref={scrollRef}
            style={{ flex: 1, overflow: 'auto' }}
            onScroll={(e) => {
              const top = e.currentTarget.scrollTop;
              if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
              scrollSaveTimer.current = setTimeout(() => vscode.updateState({ scrollTop: top }), 200);
            }}
          >
            <div style={{
              padding: '16px 32px',
              paddingBottom: '40px',
              maxWidth: config.contentWidth === 'narrow' ? '700px' : config.contentWidth === 'standard' ? '900px' : 'none',
              margin: '0 auto',
              width: '100%'
            }}>
              {editor && <div onCopy={(e) => {
                // 선택이 없으면 브라우저 기본 복사에 맡긴다
                if (window.getSelection()?.isCollapsed) return;
                try {
                  // 선택 직후 곧바로 복사하면 ProseMirror가 화면 선택을 아직 읽지 않았을 수 있다. 먼저 읽어 들인다.
                  (editor as any)._tiptapEditor?.view?.domObserver?.flush?.();
                  // getSelection()은 선택이 걸친 블록을 통째로 돌려주므로, 선택한 부분만 잘라 주는 API를 쓴다.
                  // preventDefault와 setData가 같은 이벤트 처리 안에서 일어나도록 동기로 처리한다.
                  const { blocks } = editor.getSelectionCutBlocks();
                  if (blocks.length === 0) return;
                  const only: any = blocks.length === 1 ? blocks[0] : null;
                  let text: string;
                  if (only?.type === 'codeBlock') {
                    // 코드 블록 안의 선택은 코드 텍스트만 옮긴다
                    text = (only.content ?? []).map((c: any) => c.text ?? '').join('');
                  } else {
                    // 한 블록 안의 일부는 블록 표식(# > -) 없이 인라인만 옮긴다. 붙여 넣은 곳의 구조를 바꾸지 않기 위해서다.
                    const source = only && Array.isArray(only.content) && only.type !== 'table'
                      ? [{ type: 'paragraph', content: only.content }]
                      : blocks;
                    let markdown = blocksToMarkdown(source as any[], bs => editor.blocksToMarkdownLossy(bs as any), quoteJoinsRef.current, tableOriginalsRef.current);
                    markdown = normalizeUnorderedListBullets(normalizeOrderedListNumbers(markdown));
                    // 저장 경로와 같은 표기로 맞춘다
                    text = fromEditorMarkdown(markdown, { docBaseUri: docBaseUriRef.current, wikilinkNames: wikilinkNamesRef.current, wikilinkOrder: wikilinkOrderRef.current });
                    if (only) text = text.replace(/\n+$/, '');
                  }
                  e.preventDefault();
                  e.clipboardData.setData('text/plain', text);
                } catch (err) {
                  console.error("Failed to copy markdown", err);
                  diag('copy_markdown_failed');
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
              ><BlockNoteView editor={editor} editable={!config.isReadOnly} onChange={handleWysiwygChange} theme={blockNoteTheme} formattingToolbar={false} slashMenu={false}>
                <SuggestionMenuController
                  triggerCharacter={"/"}
                  getItems={async (query) => {
                    const defaultItems = getDefaultReactSlashMenuItems(editor);
                    const allItems = [...defaultItems, ...customSlashMenuItems(editor)];
                    return allItems.filter(item => item.title.toLowerCase().includes(query.toLowerCase()) || (item.aliases && item.aliases.some((a: string) => a.toLowerCase().includes(query.toLowerCase()))));
                  }}
                />
              </BlockNoteView></div>}
            </div>
          </div>
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
      {contextMenu && editor && (
        <EditorContextMenu
          at={contextMenu}
          canUndo={getCanUndo()}
          canRedo={getCanRedo()}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onFind={() => setShowSearchReplace(true)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export default App;
