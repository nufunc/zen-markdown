import { BlockNoteEditor } from '@blocknote/core';
import { JSDOM } from 'jsdom';
import fs from 'fs';

const dom = new JSDOM();
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.navigator = dom.window.navigator;

const KNOWN_LANGUAGES = [
  "powershell", "ps1", "ps", "bash", "sh", "shell", "text", "txt"
];

function sanitizeMarkdownCodeBlocks(markdown) {
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
  
  const editor = BlockNoteEditor.create();
  
  const safeContent = sanitizeMarkdownCodeBlocks(originalMd);
  const blocks = await editor.tryParseMarkdownToBlocks(safeContent);
  
  // Find the block that should be the powershell codeblock
  // It's around line 153. Let's just print the blocks to see if there is any codeblock.
  
  let codeBlocksCount = 0;
  function traverse(b) {
    if (b.type === 'codeBlock') {
      codeBlocksCount++;
      console.log("Found code block, language:", b.props.language);
    }
    if (b.content && Array.isArray(b.content)) {
       // content of blocks is either inline content or nested blocks?
       // actually children are b.children. 
    }
    if (b.children) {
      b.children.forEach(traverse);
    }
  }
  
  blocks.forEach(traverse);
  console.log("Total codeBlocks found:", codeBlocksCount);
  
  // Also check if there is a paragraph block that contains "```powershell"
  blocks.forEach(b => {
    if (b.type === 'paragraph') {
      const text = b.content.map(c => c.text).join('');
      if (text.includes('```powershell')) {
        console.log("Found paragraph containing ```powershell!");
        console.log("Text:", text);
      }
    }
  });
}

test().catch(console.error);
