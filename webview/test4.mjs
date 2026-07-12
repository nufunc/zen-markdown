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
  
  const md = `
1. 테스트
2. 테스트
3. 테스트
   * 된ㄱ
     * 거같기도하고
       * 후후
`;
  
  const blocks = await editor.tryParseMarkdownToBlocks(md);
  console.log(JSON.stringify(blocks, null, 2));
  
  const exported = await editor.blocksToMarkdownLossy(blocks);
  console.log("=== EXPORTED ===");
  console.log(exported);
}

test().catch(console.error);
