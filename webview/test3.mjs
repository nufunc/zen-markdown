import { BlockNoteEditor } from '@blocknote/core';
import { JSDOM } from 'jsdom';
import fs from 'fs';

const dom = new JSDOM();
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
// Mock navigator to prevent TypeError
global.navigator = { userAgent: 'node.js' };

async function test() {
  const originalMd = fs.readFileSync('D:/git/my-stock-score/test.md', 'utf8');
  const editor = BlockNoteEditor.create();
  
  const blocks = await editor.tryParseMarkdownToBlocks(originalMd);
  
  let foundPowershell = false;
  blocks.forEach(b => {
    // Check for the heading
    if (b.type === 'heading') {
      const text = b.content.map(c => c.text).join('');
      if (text.includes('현재 security policy')) {
        console.log("Found heading:", text);
      }
    }
    
    // Check for codeBlock
    if (b.type === 'codeBlock') {
      console.log("Found codeBlock, language:", b.props.language);
    }

    // Check for paragraph containing ```powershell
    if (b.type === 'paragraph') {
      const text = b.content?.map(c => c.text).join('');
      if (text && text.includes('powershell')) {
        console.log("Found paragraph with powershell:", text);
      }
    }
  });
  
  console.log("Total blocks parsed:", blocks.length);
}

test().catch(console.error);
