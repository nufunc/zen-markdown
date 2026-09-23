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

export const createShikiHighlighter = () => {
  const promise = createHighlighterInternal();
  promise.catch(() => {
    const g = globalThis as any;
    const sym = Symbol.for('blocknote.shikiHighlighterPromise');
    if (g[sym] === promise) delete g[sym];
  });
  return promise;
};

// 지연 로딩할 언어 목록
const langLoaders: Record<string, () => Promise<any>> = {
  c: () => import('@shikijs/langs-precompiled/c'),
  cpp: () => import('@shikijs/langs-precompiled/cpp'),
  csharp: () => import('@shikijs/langs-precompiled/csharp'),
  go: () => import('@shikijs/langs-precompiled/go'),
  rust: () => import('@shikijs/langs-precompiled/rust'),
  php: () => import('@shikijs/langs-precompiled/php'),
  ruby: () => import('@shikijs/langs-precompiled/ruby'),
  docker: () => import('@shikijs/langs-precompiled/docker'),
  diff: () => import('@shikijs/langs-precompiled/diff'),
  ini: () => import('@shikijs/langs-precompiled/ini'),
  toml: () => import('@shikijs/langs-precompiled/toml'),
  kql: () => import('@shikijs/langs-precompiled/kql'),
  java: () => import('@shikijs/langs-precompiled/java'),
  sql: () => import('@shikijs/langs-precompiled/sql'),
  xml: () => import('@shikijs/langs-precompiled/xml'),
};

// 별칭(rs, golang 등)을 supportedLanguages의 대표 id로 푼다
const resolveLanguageId = (name: string): string => {
  const n = name.toLowerCase();
  for (const [id, v] of Object.entries(supportedLanguages)) {
    if (id === n || v.aliases?.includes(n)) return id;
  }
  return n;
};

// 문법 모듈의 대표 문법에 supportedLanguages의 별칭을 더한다. shiki는 로드된 문법의 aliases만 별칭으로 알기 때문에,
// 이것이 없으면 golang처럼 shiki 문법에 없는 별칭은 로드한 뒤에도 미로드로 보여 로드가 되풀이된다.
const withAliases = async (mod: Promise<any>, id: string) => {
  const extra = supportedLanguages[id]?.aliases ?? [];
  const regs: any[] = (await mod).default;
  return regs.map(r => r.name === id ? { ...r, aliases: [...new Set([...(r.aliases ?? []), ...extra])] } : r);
};

const createHighlighterInternal = async () => {
  const highlighter = await createHighlighterCore({
    themes: [cssVariablesTheme],
    langs: [
      // 핵심 언어만 초기 로드
      withAliases(import('@shikijs/langs-precompiled/shellscript'), 'shellscript'),
      withAliases(import('@shikijs/langs-precompiled/powershell'), 'powershell'),
      withAliases(import('@shikijs/langs-precompiled/yaml'), 'yaml'),
      withAliases(import('@shikijs/langs-precompiled/json'), 'json'),
      withAliases(import('@shikijs/langs-precompiled/jsonc'), 'jsonc'),
      withAliases(import('@shikijs/langs-precompiled/javascript'), 'javascript'),
      withAliases(import('@shikijs/langs-precompiled/typescript'), 'typescript'),
      withAliases(import('@shikijs/langs-precompiled/tsx'), 'tsx'),
      withAliases(import('@shikijs/langs-precompiled/python'), 'python'),
      withAliases(import('@shikijs/langs-precompiled/html'), 'html'),
      withAliases(import('@shikijs/langs-precompiled/css'), 'css'),
      withAliases(import('@shikijs/langs-precompiled/markdown'), 'markdown'),
    ],
    engine: createJavaScriptRawEngine(),
  });

  // BlockNote parser는 로드되지 않은 언어에 loadLanguage("rust")처럼 이름 문자열을 넘긴다.
  // createHighlighterCore는 이름만으로 문법을 찾지 못하므로, 여기서 모듈을 받아 원래 loadLanguage에 넘긴다.
  // 로드가 끝나면 하이라이트 플러그인이 전체를 다시 계산한다(prosemirror-highlight-refresh).
  const originalLoadLanguage = highlighter.loadLanguage.bind(highlighter);
  highlighter.loadLanguage = (async (...langs: any[]) => {
    const resolved = await Promise.all(langs.map(async (lang) => {
      if (typeof lang !== 'string') return lang;
      const id = resolveLanguageId(lang);
      return langLoaders[id] ? withAliases(langLoaders[id](), id) : lang;
    }));
    return originalLoadLanguage(...resolved);
  }) as typeof highlighter.loadLanguage;

  return highlighter;
};
