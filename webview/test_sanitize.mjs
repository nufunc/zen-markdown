import { BlockNoteEditor } from '@blocknote/core';
import { JSDOM } from 'jsdom';

const dom = new JSDOM();
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;

const KNOWN_LANGUAGES = [
  "abap", "actionscript", "ada", "arduino", "bash", "basic", "c", "cpp", "csharp", "cs", "css", 
  "d", "dart", "delphi", "dockerfile", "docker", "elixir", "erlang", "fortran", "go", "golang", 
  "graphql", "groovy", "haskell", "html", "java", "javascript", "js", "jsx", "json", "julia", 
  "kotlin", "latex", "tex", "lisp", "lua", "makefile", "markdown", "md", "matlab", "objectivec", 
  "ocaml", "pascal", "perl", "php", "plaintext", "text", "txt", "powershell", "ps1", "ps", 
  "prolog", "python", "py", "r", "ruby", "rb", "rust", "rs", "scala", "scheme", "shell", "sh", 
  "sql", "swift", "tcl", "tsx", "typescript", "ts", "vbnet", "vhdl", "verilog", "xml", "yaml", "yml"
];

function sanitizeMarkdownCodeBlocks(markdown) {
  return markdown.replace(/^```([^\s\n]+)?(.*)$/gm, (match, lang, rest) => {
    if (!lang) return "```text" + rest;
    const normalizedLang = lang.toLowerCase();
    if (KNOWN_LANGUAGES.includes(normalizedLang)) {
      return match;
    }
    return "```text" + rest;
  });
}

async function test() {
  const editor = BlockNoteEditor.create();
  let originalMd = `\`\`\`powershell \\ \\ \\
 $sub = "92240270-baf3-4133-8ef0-c1d11b935b94" \\ \\ \\
 $g = "rg-caidentia-hub-krc-001" \\ \\ \\
 $p = "afd-caidentia-hub-krc-001" 

# 현재 security policy(도메인-WAF 바인딩) 재확인

az afd security-policy list --profile-name $p -g $g -o table 

# custom domain 리소스 ID 조회 (바인딩 대상 식별)

az afd custom-domain list --profile-name $p -g $g \` \\ \\ \\
 --query "[].{name:name, host:hostName}" -o table 
\`\`\`
`;

  console.log("=== ORIGINAL ===");
  console.log(originalMd);

  const safeContent = sanitizeMarkdownCodeBlocks(originalMd);
  const blocks = await editor.tryParseMarkdownToBlocks(safeContent);
  let outMd = await editor.blocksToMarkdownLossy(blocks);
  outMd = sanitizeMarkdownCodeBlocks(outMd);
  
  console.log("=== EXPORTED ===");
  console.log(outMd);
  
  if (originalMd !== outMd) {
    console.log("WARNING: Markdown was corrupted!");
  } else {
    console.log("SUCCESS: Markdown was preserved perfectly.");
  }
}

test().catch(console.error);
