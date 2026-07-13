// WYSIWYG 코드블록 자동 포맷 — prettier가 파서를 제공하는 언어만 대상.
// bash/powershell 등 prettier 미지원 언어와 문법 오류 코드는 null을 반환해 원본을 유지한다.
// (이전의 중괄호 개수 기반 재들여쓰기와 달리 언어 문법을 실제로 파싱하므로 코드를 훼손하지 않음)

type ParserEntry = { parser: string; plugins: Array<() => Promise<any>> };

const estree = () => import('prettier/plugins/estree');
const babel = () => import('prettier/plugins/babel');
const postcss = () => import('prettier/plugins/postcss');

const PARSERS: Record<string, ParserEntry> = {
  javascript: { parser: 'babel', plugins: [babel, estree] },
  typescript: { parser: 'typescript', plugins: [() => import('prettier/plugins/typescript'), estree] },
  json: { parser: 'json', plugins: [babel, estree] },
  css: { parser: 'css', plugins: [postcss] },
  // html은 내장 <script>/<style> 포맷을 위해 babel/postcss도 함께 로드
  html: { parser: 'html', plugins: [() => import('prettier/plugins/html'), babel, estree, postcss] },
  yaml: { parser: 'yaml', plugins: [() => import('prettier/plugins/yaml')] },
};

const ALIASES: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  jsonc: 'json',
  scss: 'css', less: 'css',
  htm: 'html',
  yml: 'yaml',
};

export function isFormattableLanguage(language: string): boolean {
  const lang = (language || '').toLowerCase();
  return Boolean(PARSERS[ALIASES[lang] ?? lang]);
}

export async function formatCodeBlock(code: string, language: string): Promise<string | null> {
  const lang = (language || '').toLowerCase();
  const entry = PARSERS[ALIASES[lang] ?? lang];
  if (!entry || !code.trim()) return null;
  try {
    const mods = await Promise.all([
      import('prettier/standalone'),
      ...entry.plugins.map(p => p()),
    ]);
    const prettierMod: any = mods[0];
    const prettier = prettierMod.default ?? prettierMod;
    const plugins = mods.slice(1).map((m: any) => m.default ?? m);
    const formatted: string = await prettier.format(code, { parser: entry.parser, plugins });
    // prettier는 항상 후행 개행을 붙이므로 제거 (코드블록이 저장마다 한 줄씩 자라는 것 방지)
    return formatted.replace(/\n$/, '');
  } catch {
    return null; // 문법 오류 등 — 원본 유지
  }
}
