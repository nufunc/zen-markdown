import { createHighlighterCore, createCssVariablesTheme } from '@shikijs/core';
import { createJavaScriptRawEngine } from '@shikijs/engine-javascript';

// 토큰 색상을 CSS 변수(--shiki-token-*)로 내보내는 테마.
// 실제 색상 값은 App.tsx의 테마별 <style>에서 정의하므로 라이트/다크 전환 시 재파싱이 필요 없다.
const cssVariablesTheme = createCssVariablesTheme({
  name: 'css-variables',
  variablePrefix: '--shiki-',
  fontStyle: true,
});

// key는 shiki 언어 id 그대로 사용해야 함 (getLanguageId → getLoadedLanguages 매칭).
// aliases는 마크다운 펜스(```bash 등)에 쓰이는 표기를 흡수한다.
export const supportedLanguages: Record<string, { name: string; aliases?: string[] }> = {
  text: { name: 'Plain Text', aliases: ['txt', 'plaintext', 'none'] },
  shellscript: { name: 'Shell (Bash)', aliases: ['bash', 'sh', 'shell', 'zsh'] },
  powershell: { name: 'PowerShell', aliases: ['ps', 'ps1', 'pwsh'] },
  yaml: { name: 'YAML', aliases: ['yml'] },
  json: { name: 'JSON', aliases: [] },
  jsonc: { name: 'JSONC', aliases: [] },
  javascript: { name: 'JavaScript', aliases: ['js', 'jsx', 'mjs', 'cjs'] },
  typescript: { name: 'TypeScript', aliases: ['ts'] },
  tsx: { name: 'TSX', aliases: [] },
  python: { name: 'Python', aliases: ['py'] },
  sql: { name: 'SQL', aliases: [] },
  html: { name: 'HTML', aliases: ['htm'] },
  css: { name: 'CSS', aliases: [] },
  xml: { name: 'XML', aliases: ['svg'] },
  java: { name: 'Java', aliases: [] },
  c: { name: 'C', aliases: ['h'] },
  cpp: { name: 'C++', aliases: ['cc', 'hpp', 'c++'] },
  csharp: { name: 'C#', aliases: ['cs', 'c#'] },
  go: { name: 'Go', aliases: ['golang'] },
  rust: { name: 'Rust', aliases: ['rs'] },
  php: { name: 'PHP', aliases: [] },
  ruby: { name: 'Ruby', aliases: ['rb'] },
  docker: { name: 'Dockerfile', aliases: ['dockerfile'] },
  diff: { name: 'Diff', aliases: [] },
  ini: { name: 'INI', aliases: ['properties', 'conf'] },
  toml: { name: 'TOML', aliases: [] },
  markdown: { name: 'Markdown', aliases: ['md'] },
  kql: { name: 'KQL', aliases: ['kusto'] },
};

// 사전 컴파일 문법 + JS raw 엔진: WASM이 필요 없어 webview CSP에서 안전하게 동작.
// 문법 청크는 하이라이터 최초 생성 시(코드블록이 처음 보일 때)에만 로드된다.
export const createShikiHighlighter = () => {
  const promise = createHighlighterInternal();
  // BlockNote는 이 프라미스를 전역 심볼에 캐시하므로, 일시 오류로 거부되면
  // 세션 내내 하이라이팅이 죽는다 — 실패 시 캐시를 비워 다음 시도를 허용
  promise.catch(() => {
    const g = globalThis as any;
    const sym = Symbol.for('blocknote.shikiHighlighterPromise');
    if (g[sym] === promise) delete g[sym];
  });
  return promise;
};

const createHighlighterInternal = () =>
  createHighlighterCore({
    themes: [cssVariablesTheme],
    langs: [
      import('@shikijs/langs-precompiled/shellscript'),
      import('@shikijs/langs-precompiled/powershell'),
      import('@shikijs/langs-precompiled/yaml'),
      import('@shikijs/langs-precompiled/json'),
      import('@shikijs/langs-precompiled/jsonc'),
      import('@shikijs/langs-precompiled/javascript'),
      import('@shikijs/langs-precompiled/typescript'),
      import('@shikijs/langs-precompiled/tsx'),
      import('@shikijs/langs-precompiled/python'),
      import('@shikijs/langs-precompiled/sql'),
      import('@shikijs/langs-precompiled/html'),
      import('@shikijs/langs-precompiled/css'),
      import('@shikijs/langs-precompiled/xml'),
      import('@shikijs/langs-precompiled/java'),
      import('@shikijs/langs-precompiled/c'),
      import('@shikijs/langs-precompiled/cpp'),
      import('@shikijs/langs-precompiled/csharp'),
      import('@shikijs/langs-precompiled/go'),
      import('@shikijs/langs-precompiled/rust'),
      import('@shikijs/langs-precompiled/php'),
      import('@shikijs/langs-precompiled/ruby'),
      import('@shikijs/langs-precompiled/docker'),
      import('@shikijs/langs-precompiled/diff'),
      import('@shikijs/langs-precompiled/ini'),
      import('@shikijs/langs-precompiled/toml'),
      import('@shikijs/langs-precompiled/markdown'),
      import('@shikijs/langs-precompiled/kql'),
    ],
    engine: createJavaScriptRawEngine(),
  });
