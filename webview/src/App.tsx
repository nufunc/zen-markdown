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

const processBlocksFromMarkdown = (blocks: any[]): any[] => {
  return blocks.map((b: any) => {
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
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import { vscode } from './vscode';
import CodeMirror from '@uiw/react-codemirror';
import CodeMirrorMerge from 'react-codemirror-merge';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView } from 'codemirror';
import { EditorState } from '@codemirror/state';

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

function preserveMarkdownLineBreaks(markdown: string): string {
  const parts = markdown.split(/(```[\s\S]*?```)/);
  return parts.map((part, index) => {
    if (index % 2 === 0) {
      // Replace single newlines between text with two spaces + newline
      // This forces markdown parsers to treat them as hard breaks (<br>)
      return part.replace(/([^\n])\n(?=[^\n])/g, '$1  \n');
    }
    return part;
  }).join('');
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
  const [isRawMode, setIsRawMode] = useState(false);
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

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.type) {
        case 'config':
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
        const safeContent = preserveMarkdownLineBreaks(sanitizeMarkdownCodeBlocks(normalizedContent));
        
        isInitializing.current = true;
        if (!editor) {
          const newEditor = BlockNoteEditor.create({ schema });
          let blocks = await newEditor.tryParseMarkdownToBlocks(safeContent);
          blocks = processBlocksFromMarkdown(blocks);
          newEditor.replaceBlocks(newEditor.document, blocks);
          setEditor(newEditor);
          extractHeadings(newEditor);
          // Reset edit flag after initialization
          hasEdited.current = false;
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

  const saveToHost = (fmString: string, mdString: string) => {
    const fullText = fmString ? `---\n${fmString}\n---\n${mdString}` : mdString;
    vscode.postMessage({ type: 'change', text: fullText });
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
    saveToHost(parsedFrontmatter, markdown);
  };

  const handleFmChange = async (key: string, value: any) => {
    if (!fmData || !editor) return;
    const newData = { ...fmData, [key]: value };
    setFmData(newData);
    const newFmString = YAML.stringify(newData).trim();
    setParsedFrontmatter(newFmString);
    const md = await editor.blocksToMarkdownLossy(editor.document);
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
    
    // eslint-disable-next-line no-alert
    alert(`총 ${count}개의 항목이 바뀌었습니다.`);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
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
    if (!isRawMode && editor) {
      if (hasEdited.current) {
        let markdown = await editor.blocksToMarkdownLossy(editor.document);
        markdown = sanitizeMarkdownCodeBlocks(markdown);
        const fullText = parsedFrontmatter ? `---\n${parsedFrontmatter}\n---\n${markdown}` : markdown;
        setDocumentText(fullText);
      }
      setEditor(null);
    }
    setIsRawMode(!isRawMode);
  };

  const handleKeyDownCapture = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && !e.shiftKey && editor && !isRawMode) {
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

  if (activeTheme === 'dark') {
    bgColor = '#1e1e1e';
    textColor = '#d4d4d4';
    headerBg = '#2d2d2d';
    codeBg = '#252526';
    codeColor = '#d4d4d4';
    blockNoteTheme = "dark";
  } else if (activeTheme === 'nord') {
    bgColor = '#2e3440';
    textColor = '#d8dee9';
    headerBg = '#3b4252';
    codeBg = '#3b4252';
    codeColor = '#d8dee9';
    blockNoteTheme = "dark";
  } else if (activeTheme === 'one-half-dark') {
    bgColor = '#282c34';
    textColor = '#dcdfe4';
    headerBg = '#2c323c';
    codeBg = '#2c323c';
    codeColor = '#dcdfe4';
    blockNoteTheme = "dark";
  } else if (activeTheme === 'solarized-dark') {
    bgColor = '#002b36';
    textColor = '#839496';
    headerBg = '#073642';
    codeBg = '#073642';
    codeColor = '#839496';
    blockNoteTheme = "dark";
  } else if (activeTheme === 'vintage') {
    bgColor = '#f4ecd8';
    textColor = '#3a3a3a';
    headerBg = '#e8dcc3';
    codeBg = '#e8dcc3';
    codeColor = '#3a3a3a';
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
          <div 
            onMouseDown={handleTocMouseDown}
            style={{ 
              fontWeight: 'bold', 
              marginBottom: '8px', 
              opacity: 0.8, 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              cursor: 'grab',
              userSelect: 'none'
            }}
            title="Drag to move"
          >
            <span style={{ fontSize: '14px' }}>📑</span> Table of Contents
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
          .bn-editor { font-size: ${config.fontSize}px; background-color: transparent !important; }
          .bn-container { color: ${textColor} !important; }
          .cm-content { padding: 16px 32px !important; }
          
          /* Custom Code Block Theme Colors */
          .bn-editor .bn-block-content[data-content-type="codeBlock"] {
            background-color: ${codeBg} !important;
            color: ${codeColor} !important;
          }
          /* Override BlockNote default syntax highlighting background */
          .bn-editor .bn-block-content[data-content-type="codeBlock"] pre {
            background-color: transparent !important;
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
          .bn-editor [data-content-type="paragraph"],
          .bn-editor [data-content-type="bulletListItem"],
          .bn-editor [data-content-type="numberedListItem"],
          .bn-editor [data-content-type="codeBlock"],
          .bn-editor pre,
          .bn-editor code,
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

          /* Inline Code Styling */
          .bn-editor .bn-inline-content code {
            background-color: transparent !important;
            border: none !important;
            box-shadow: none !important;
            color: var(--vscode-textPreformat-foreground, #d16969) !important;
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
            background-color: ${headerBg} !important;
            font-weight: 600 !important;
          }
          .bn-editor [data-content-type="table"] td, 
          .bn-editor [data-content-type="table"] th {
            border: 1px solid ${dropdownBorder} !important;
            padding: 6px 12px !important;
            min-width: 100px;
          }
          
          /* Blockquote Styles */
          .bn-editor [data-content-type="blockQuote"] {
            background-color: ${isDark ? 'rgba(0, 122, 255, 0.1)' : 'rgba(0, 122, 255, 0.05)'} !important;
            border-left: 4px solid #007aff !important;
            padding: 12px 16px !important;
            border-radius: 0 4px 4px 0;
            margin: 8px 0;
          }
          
          /* Inline Code Styles */
          .bn-editor code, .bn-editor [data-inline-style="code"] {
            background-color: ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'} !important;
            padding: 2px 6px !important;
            border-radius: 4px !important;
            font-family: Consolas, 'Courier New', monospace !important;
            font-size: 0.9em !important;
            color: ${isDark ? '#e06c75' : '#d14'} !important;
            border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)'} !important;
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
                <CodeMirrorMerge orientation="a-b" className="cm-merge-root" theme={blockNoteTheme}>
                  <Original
                    value={originalText}
                    extensions={[markdown({ base: markdownLanguage, codeLanguages: languages }), EditorView.lineWrapping, EditorState.readOnly.of(true)]}
                  />
                  <Modified
                    value={documentText as string}
                    extensions={[markdown({ base: markdownLanguage, codeLanguages: languages }), EditorView.lineWrapping]}
                    onChange={(val) => {
                      setDocumentText(val);
                      vscode.postMessage({ type: 'change', text: val });
                    }}
                  />
                </CodeMirrorMerge>
                <style>{`
                  .cm-merge-root { flex: 1; height: 100%; overflow: hidden; }
                  .cm-merge-container .cm-editor { height: 100%; font-family: Consolas, 'Courier New', monospace; font-size: inherit; }
                  .cm-merge-container .cm-scroller { overflow: auto; }
                `}</style>
              </div>
            )
          ) : (
            <CodeMirror
              value={documentText as string}
              extensions={[markdown({ base: markdownLanguage, codeLanguages: languages }), EditorView.lineWrapping]}
              onChange={(val) => {
                setDocumentText(val);
                vscode.postMessage({ type: 'change', text: val });
              }}
              theme={blockNoteTheme}
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
          <div style={{ flex: 1, overflow: 'auto' }}>
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
