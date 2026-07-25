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

const pendingLangs = new Set<string>();

const createHighlighterInternal = async () => {
  const highlighter = await createHighlighterCore({
    themes: [cssVariablesTheme],
    langs: [
      // 핵심 언어만 초기 로드
      import('@shikijs/langs-precompiled/shellscript'),
      import('@shikijs/langs-precompiled/powershell'),
      import('@shikijs/langs-precompiled/yaml'),
      import('@shikijs/langs-precompiled/json'),
      import('@shikijs/langs-precompiled/jsonc'),
      import('@shikijs/langs-precompiled/javascript'),
      import('@shikijs/langs-precompiled/typescript'),
      import('@shikijs/langs-precompiled/tsx'),
      import('@shikijs/langs-precompiled/python'),
      import('@shikijs/langs-precompiled/html'),
      import('@shikijs/langs-precompiled/css'),
      import('@shikijs/langs-precompiled/markdown'),
    ],
    engine: createJavaScriptRawEngine(),
  });

  const originalCodeToHtml = highlighter.codeToHtml.bind(highlighter);

  // 동기 호출되는 codeToHtml을 가로채서 로드되지 않은 언어는 동적 로드 시도 후 텍스트로 폴백
  highlighter.codeToHtml = (code: string, options: any) => {
    const lang = options.lang;
    const loaded = highlighter.getLoadedLanguages();
    
    if (lang && lang !== 'text' && !loaded.includes(lang)) {
      if (!pendingLangs.has(lang) && langLoaders[lang]) {
        pendingLangs.add(lang);
        langLoaders[lang]().then(mod => {
          highlighter.loadLanguage(mod).then(() => {
            // 언어 로드 완료 이벤트를 발생시켜 에디터가 재렌더링할 수 있도록 유도
            window.dispatchEvent(new CustomEvent('shiki-lang-loaded', { detail: lang }));
          }).catch(console.error);
        }).catch(console.error);
      }
      return originalCodeToHtml(code, { ...options, lang: 'text' });
    }

    try {
      return originalCodeToHtml(code, options);
    } catch {
      return originalCodeToHtml(code, { ...options, lang: 'text' });
    }
  };

  return highlighter;
};
