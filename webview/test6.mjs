import { BlockNoteEditor } from '@blocknote/core';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('', { url: 'http://localhost' });
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
Object.defineProperty(global, 'navigator', {
  value: { userAgent: 'node.js' },
  writable: true
});

async function test() {
  const editor = BlockNoteEditor.create();
  
  // Mixed nested list:
  // Numbered parent, bullet child
  const mdIn = `1. 넘버리스트
   - 불렛 차일드 1
   - 불렛 차일드 2
2. 넘버리스트 2
   - 불렛 차일드 3
`;
  
  const blocks = await editor.tryParseMarkdownToBlocks(mdIn);
  // console.log(JSON.stringify(blocks, null, 2));
  
  let mdOut = await editor.blocksToMarkdownLossy(blocks);
  
  // Apply our regex
  const lines = mdOut.split('\n');
  let inCodeBlock = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('\`\`\`')) {
      inCodeBlock = !inCodeBlock;
    } else if (!inCodeBlock) {
      lines[i] = lines[i].replace(/^(\s*)\*\s/, '$1- ');
    }
  }
  mdOut = lines.join('\n');
  
  console.log("=== EXPORTED ===");
  console.log(mdOut);
  
  // NOW parse it BACK
  const editor2 = BlockNoteEditor.create();
  const blocks2 = await editor2.tryParseMarkdownToBlocks(mdOut);
  console.log("=== RE-PARSED AST ===");
  console.log(JSON.stringify(blocks2, null, 2));
}

test().catch(console.error);
