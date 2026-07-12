import { BlockNoteEditor } from '@blocknote/core';
import { JSDOM } from 'jsdom';

const dom = new JSDOM();
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;

async function test() {
  const editor = BlockNoteEditor.create();
  const originalMd = `\`\`\`powershell \\ \\ \\
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

  const blocks = await editor.tryParseMarkdownToBlocks(originalMd);
  const outMd = await editor.blocksToMarkdownLossy(blocks);
  
  console.log("=== ORIGINAL ===");
  console.log(originalMd);
  console.log("=== EXPORTED ===");
  console.log(outMd);
}

test().catch(console.error);
