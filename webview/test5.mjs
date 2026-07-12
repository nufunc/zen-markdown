import { BlockNoteEditor } from '@blocknote/core';
import { JSDOM } from 'jsdom';
import fs from 'fs';

const dom = new JSDOM('', { url: 'http://localhost' });
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
Object.defineProperty(global, 'navigator', {
  value: { userAgent: 'node.js' },
  writable: true
});

const KNOWN_LANGUAGES = [
  "powershell", "ps1", "ps", "bash", "sh", "shell", "text", "txt"
];

function sanitize(markdown) {
  return markdown.replace(/^```([^\s\n]+)?(.*)$/gm, (match, lang, rest) => {
    if (!lang) return match; 
    const normalizedLang = lang.toLowerCase();
    if (KNOWN_LANGUAGES.includes(normalizedLang)) {
      return match;
    }
    return "```text" + rest;
  });
}

async function test() {
  const originalMd = fs.readFileSync('D:/git/my-stock-score/test.md', 'utf8');
  
  // Try with \r\n
  const editor1 = BlockNoteEditor.create();
  const safeContent1 = sanitize(originalMd);
  const blocks1 = await editor1.tryParseMarkdownToBlocks(safeContent1);
  console.log("=== WITH \\r\\n ===");
  let hasPowershell1 = false;
  blocks1.forEach(b => { if (b.type === 'codeBlock') hasPowershell1 = true; });
  console.log("Parsed as codeBlock:", hasPowershell1);

  // Try with \n
  const editor2 = BlockNoteEditor.create();
  const safeContent2 = sanitize(originalMd.replace(/\r\n/g, '\n'));
  const blocks2 = await editor2.tryParseMarkdownToBlocks(safeContent2);
  console.log("=== WITH \\n ===");
  let hasPowershell2 = false;
  blocks2.forEach(b => { if (b.type === 'codeBlock') hasPowershell2 = true; });
  console.log("Parsed as codeBlock:", hasPowershell2);
}

test().catch(console.error);
