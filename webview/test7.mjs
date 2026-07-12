import { BlockNoteEditor } from '@blocknote/core';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('', { url: 'http://localhost' });
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;

async function test() {
  const editor = BlockNoteEditor.create();
  const md = `| Left | Center | Right |
| :--- | :---: | ---: |
| L1 | C1 | R1 |`;
  
  const blocks = await editor.tryParseMarkdownToBlocks(md);
  console.log(JSON.stringify(blocks, null, 2));
  
  const exported = await editor.blocksToMarkdownLossy(blocks);
  console.log("=== EXPORTED ===");
  console.log(exported);
}

test().catch(console.error);
