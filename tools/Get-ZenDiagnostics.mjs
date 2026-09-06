#!/usr/bin/env node
// Zen Markdown 진단 로그를 일별·주별·월별로 집계한다.
//
// 사용:
//   node tools/Get-ZenDiagnostics.mjs                 기본 경로에서 읽어 마크다운 보고서 출력
//   node tools/Get-ZenDiagnostics.mjs --json          집계 결과를 JSON으로 출력
//   node tools/Get-ZenDiagnostics.mjs --dir <경로>    로그 디렉터리 지정
//   node tools/Get-ZenDiagnostics.mjs --since 30      최근 N일만
//
// 집계 규칙은 out/diagnosticsAggregate.js 하나에서 온다. 이 스크립트는 파일을 읽고
// 그 모듈에 넘기기만 한다. 규칙을 여기에 복제하지 않는다.
// 먼저 `npm run compile`로 out/을 만들어야 한다.

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir, platform } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const aggregatePath = join(here, '..', 'out', 'diagnosticsAggregate.js');

if (!existsSync(aggregatePath)) {
  console.error('out/diagnosticsAggregate.js가 없다. 먼저 `npm run compile`을 실행한다.');
  process.exit(2);
}
const { parseLogLines, aggregate, renderReport } = await import(pathToFileURL(aggregatePath).href);

const PUBLISHER_ID = 'nufunc.zen-markdown';
const LOG_NAME_RE = /^zen-\d{4}-\d{2}-\d{2}\.jsonl$/;

/** VS Code globalStorage 기본 경로 후보. 설치 종류마다 다르다. */
function defaultDirs() {
  const home = homedir();
  const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
  const bases = platform() === 'win32'
    ? [join(appData, 'Code'), join(appData, 'Code - Insiders')]
    : platform() === 'darwin'
      ? [join(home, 'Library', 'Application Support', 'Code'),
         join(home, 'Library', 'Application Support', 'Code - Insiders')]
      : [join(home, '.config', 'Code'), join(home, '.config', 'Code - Insiders')];
  return bases.map(b => join(b, 'User', 'globalStorage', PUBLISHER_ID, 'diagnostics'));
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function loadRecords(dir, sinceDays) {
  const names = (await readdir(dir)).filter(n => LOG_NAME_RE.test(n)).sort();
  const cutoff = sinceDays ? Date.now() - sinceDays * 86400000 : null;
  const records = [];
  for (const name of names) {
    const day = name.slice(4, 14);
    if (cutoff && new Date(day + 'T23:59:59Z').getTime() < cutoff) continue;
    records.push(...parseLogLines(await readFile(join(dir, name), 'utf8')));
  }
  return records;
}

const dirArg = arg('--dir');
const sinceDays = Number(arg('--since', '0')) || null;
const candidates = dirArg ? [dirArg] : defaultDirs();
const dir = candidates.find(d => existsSync(d));

if (!dir) {
  console.error('로그 디렉터리를 찾지 못했다. 다음 경로를 확인했다:');
  for (const d of candidates) console.error('  ' + d);
  console.error('');
  console.error('확장을 한 번도 실행하지 않았거나 zenMarkdown.diagnostics가 꺼져 있다.');
  console.error('경로를 직접 주려면: --dir <경로>');
  process.exit(2);
}

const records = await loadRecords(dir, sinceDays);

if (process.argv.includes('--json')) {
  const a = aggregate(records);
  console.log(JSON.stringify({
    dir,
    total: a.total,
    problems: a.problems,
    range: a.range,
    daily: Object.fromEntries(a.daily),
    weekly: Object.fromEntries(a.weekly),
    monthly: Object.fromEntries(a.monthly),
    problemEvents: a.problemEvents,
    lastSeen: a.lastSeen,
    driftKinds: a.driftKinds,
    repeatDocs: a.repeatDocs,
  }, null, 2));
} else {
  console.log(renderReport(records, dir, new Date().toISOString()));
}
