// 진단 로그 집계. vscode API에 의존하지 않는 순수 모듈이다.
//
// 확장 명령(Show Diagnostics)과 CLI 스크립트(tools/Get-ZenDiagnostics.mjs)가
// 이 파일 하나를 함께 쓴다. 집계 규칙을 두 곳에 복제하면 보고서를 믿을 수 없다.
// CLI는 컴파일 결과인 out/diagnosticsAggregate.js를 import한다.

export interface LogRecord {
    ts: string;
    ev: string;
    [key: string]: unknown;
}

/** 이상 신호로 보는 이벤트. 여기 없는 것은 정상 동작의 흔적이다.
 *  새 이벤트를 계측할 때 이상이면 이 집합에도 더한다. */
export const PROBLEM_EVENTS = new Set([
    'roundtrip_drift',
    'roundtrip_check_failed',
    'edit_failed',
    'flush_timeout',
    'serialize_failed',
    'autofix_failed',
    'mode_toggle_serialize_failed',
    'block_type_apply_failed',
    'table_paste_failed',
    'search_plugin_register_failed',
    'search_highlight_failed',
    'copy_markdown_failed',
]);

export function parseLogLines(text: string): LogRecord[] {
    const out: LogRecord[] = [];
    for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
            const rec = JSON.parse(line);
            if (rec && typeof rec.ts === 'string' && typeof rec.ev === 'string') out.push(rec);
        } catch { /* 깨진 줄은 건너뛴다 */ }
    }
    return out;
}

const pad = (n: number) => String(n).padStart(2, '0');

export const dayOf = (ts: string): string => ts.slice(0, 10);
export const monthOf = (ts: string): string => ts.slice(0, 7);

/** ISO 주 (월요일 시작). 주별 추세를 달력 주와 맞추기 위해 쓴다. */
export function weekOf(ts: string): string {
    const d = new Date(ts.slice(0, 10) + 'T00:00:00Z');
    const dayIdx = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayIdx + 3);
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(
        ((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
    );
    return d.getUTCFullYear() + '-W' + pad(week);
}

export interface Bucket {
    total: number;
    problems: number;
    byEvent: Record<string, number>;
    docs: number;
}

function tally(records: LogRecord[], keyOf: (ts: string) => string): Map<string, Bucket> {
    const raw = new Map<string, { total: number; problems: number; byEvent: Record<string, number>; docs: Set<string> }>();
    for (const r of records) {
        const key = keyOf(r.ts);
        let b = raw.get(key);
        if (!b) { b = { total: 0, problems: 0, byEvent: {}, docs: new Set() }; raw.set(key, b); }
        b.total++;
        if (PROBLEM_EVENTS.has(r.ev)) b.problems++;
        b.byEvent[r.ev] = (b.byEvent[r.ev] ?? 0) + 1;
        if (typeof r.doc === 'string') b.docs.add(r.doc);
    }
    const out = new Map<string, Bucket>();
    for (const [k, b] of raw) {
        out.set(k, { total: b.total, problems: b.problems, byEvent: b.byEvent, docs: b.docs.size });
    }
    return out;
}

export interface Aggregate {
    total: number;
    problems: number;
    range: [string, string] | null;
    daily: Map<string, Bucket>;
    weekly: Map<string, Bucket>;
    monthly: Map<string, Bucket>;
    /** 이상 이벤트별 건수 */
    problemEvents: Record<string, number>;
    /** 이상 이벤트별 최근 발생 시각 */
    lastSeen: Record<string, string>;
    /** 왕복 손실 종류별 줄 수 */
    driftKinds: Record<string, number>;
    /** 두 번 이상 문제가 난 문서 해시 */
    repeatDocs: Record<string, number>;
}

export function aggregate(records: LogRecord[]): Aggregate {
    const sorted = [...records].sort((a, b) => a.ts.localeCompare(b.ts));
    const problems = sorted.filter(r => PROBLEM_EVENTS.has(r.ev));

    const problemEvents: Record<string, number> = {};
    const lastSeen: Record<string, string> = {};
    for (const r of problems) {
        problemEvents[r.ev] = (problemEvents[r.ev] ?? 0) + 1;
        lastSeen[r.ev] = r.ts;
    }

    const driftKinds: Record<string, number> = {};
    for (const r of sorted) {
        if (r.ev !== 'roundtrip_drift') continue;
        const kinds = r.kinds as Record<string, number> | undefined;
        if (!kinds) continue;
        for (const [name, n] of Object.entries(kinds)) {
            if (typeof n === 'number') driftKinds[name] = (driftKinds[name] ?? 0) + n;
        }
    }

    const perDoc: Record<string, number> = {};
    for (const r of problems) {
        if (typeof r.doc === 'string') perDoc[r.doc] = (perDoc[r.doc] ?? 0) + 1;
    }
    const repeatDocs = Object.fromEntries(
        Object.entries(perDoc).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])
    );

    return {
        total: sorted.length,
        problems: problems.length,
        range: sorted.length ? [sorted[0].ts, sorted[sorted.length - 1].ts] : null,
        daily: tally(sorted, dayOf),
        weekly: tally(sorted, weekOf),
        monthly: tally(sorted, monthOf),
        problemEvents,
        lastSeen,
        driftKinds,
        repeatDocs,
    };
}

function renderTable(title: string, buckets: Map<string, Bucket>, limit: number): string[] {
    const keys = [...buckets.keys()].sort().reverse().slice(0, limit);
    if (keys.length === 0) return [];
    const out = [`### ${title}`, '', '| 기간 | 이벤트 | 이상 | 문서 수 | 이상률 |', '|---|---:|---:|---:|---:|'];
    for (const k of keys) {
        const b = buckets.get(k)!;
        const rate = b.total === 0 ? '0%' : Math.round((b.problems / b.total) * 100) + '%';
        out.push(`| ${k} | ${b.total} | ${b.problems} | ${b.docs} | ${rate} |`);
    }
    out.push('');
    return out;
}

/** 집계 결과를 사람이 읽는 마크다운 보고서로 만든다 */
export function renderReport(records: LogRecord[], source: string, now: string): string {
    const a = aggregate(records);
    const lines: string[] = ['# Zen Markdown 진단 보고서', ''];
    lines.push(`생성: ${now}`, `로그: ${source}`, '');

    if (a.total === 0) {
        lines.push('기록이 없다. 확장을 아직 쓰지 않았거나 `zenMarkdown.diagnostics`가 꺼져 있다.');
        return lines.join('\n');
    }

    lines.push(`기간: ${dayOf(a.range![0])} ~ ${dayOf(a.range![1])} · 이벤트 ${a.total}건 · 이상 ${a.problems}건`, '');
    if (a.problems === 0) {
        lines.push('이상 신호가 없다.', '');
    }

    lines.push('## 추세', '');
    lines.push(...renderTable('일별 (최근 30일)', a.daily, 30));
    lines.push(...renderTable('주별 (최근 12주)', a.weekly, 12));
    lines.push(...renderTable('월별 (최근 12개월)', a.monthly, 12));

    const evEntries = Object.entries(a.problemEvents).sort((x, y) => y[1] - x[1]);
    if (evEntries.length > 0) {
        lines.push('## 이상 이벤트', '', '| 이벤트 | 건수 | 최근 발생 |', '|---|---:|---|');
        for (const [ev, n] of evEntries) {
            lines.push(`| \`${ev}\` | ${n} | ${a.lastSeen[ev].slice(0, 16).replace('T', ' ')} |`);
        }
        lines.push('');
    }

    const kindEntries = Object.entries(a.driftKinds).sort((x, y) => y[1] - x[1]);
    if (kindEntries.length > 0) {
        lines.push('## 왕복 손실 종류', '');
        lines.push('문서를 연 직후 편집 없이 검증한 결과다. 건수가 있으면 그 부류의 마크다운이');
        lines.push('저장할 때 변형된다는 뜻이고, 사용자가 알아채기 전의 신호다.', '');
        lines.push('| 종류 | 줄 수 |', '|---|---:|');
        for (const [k, n] of kindEntries) {
            lines.push(`| \`${k}\` | ${n} |`);
        }
        lines.push('');
    }

    const repeatEntries = Object.entries(a.repeatDocs).slice(0, 10);
    if (repeatEntries.length > 0) {
        lines.push('## 반복해서 문제가 나는 문서', '');
        lines.push('식별자는 경로 해시라 되돌릴 수 없다. 같은 값이 반복되면 특정 문서의 내용이 원인이다.', '');
        lines.push('| 문서 | 이상 건수 |', '|---|---:|');
        for (const [d, n] of repeatEntries) {
            lines.push(`| \`${d}\` | ${n} |`);
        }
        lines.push('');
    }

    return lines.join('\n');
}
