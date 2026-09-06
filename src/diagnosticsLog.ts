import * as vscode from 'vscode';

// 로컬 진단 로그. 네트워크로 보내지 않고 사용자 전역 저장소에만 쌓는다.
//
// 문서 내용은 어떤 경우에도 기록하지 않는다. 남기는 것은 이벤트 코드와 수치,
// 그리고 변경의 '종류'뿐이다. 파일명도 남기지 않고 해시로 대체한다.
// 이 원칙이 깨지면 사용자의 원고가 로그로 새어 나간다.

const RETENTION_DAYS = 90;
/** 한 파일이 무한정 커지지 않게 하는 상한. 넘으면 그날 로그는 더 쌓지 않는다. */
const MAX_BYTES_PER_DAY = 2 * 1024 * 1024;

export type DiagEvent = {
    /** 이벤트 코드. 새 코드를 더할 때는 docs/MONITORING.md의 표에도 더한다. */
    ev: string;
    [key: string]: unknown;
};

export class DiagnosticsLog {
    private dir: vscode.Uri | undefined;
    private todayKey = '';
    private todayBytes = 0;
    private queue: string[] = [];
    private flushTimer: NodeJS.Timeout | undefined;

    constructor(private readonly context: vscode.ExtensionContext) { }

    private isEnabled(): boolean {
        return vscode.workspace.getConfiguration('zenMarkdown').get<boolean>('diagnostics') ?? true;
    }

    private dayKey(now: Date): string {
        // 로컬 날짜 기준. 사용자가 보는 '어제'와 로그의 '어제'가 같아야 한다.
        const p = (n: number) => String(n).padStart(2, '0');
        return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
    }

    private fileFor(key: string): vscode.Uri {
        if (!this.dir) {
            this.dir = vscode.Uri.joinPath(this.context.globalStorageUri, 'diagnostics');
        }
        return vscode.Uri.joinPath(this.dir, `zen-${key}.jsonl`);
    }

    /** 이벤트 하나를 기록한다. 실패해도 조용히 넘어간다: 로깅이 편집을 막아서는 안 된다. */
    record(event: DiagEvent): void {
        if (!this.isEnabled()) return;
        try {
            const now = new Date();
            const key = this.dayKey(now);
            if (key !== this.todayKey) {
                this.todayKey = key;
                this.todayBytes = 0;
                void this.prune();
            }
            if (this.todayBytes > MAX_BYTES_PER_DAY) return;

            const line = JSON.stringify({ ts: now.toISOString(), ...event }) + '\n';
            this.todayBytes += line.length;
            this.queue.push(line);
            // 이벤트마다 디스크를 때리지 않도록 모아서 쓴다
            if (!this.flushTimer) {
                this.flushTimer = setTimeout(() => void this.flush(), 2000);
            }
        } catch { /* 로깅 실패는 무시 */ }
    }

    async flush(): Promise<void> {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = undefined;
        }
        if (this.queue.length === 0) return;
        const chunk = this.queue.join('');
        this.queue = [];
        try {
            const dir = vscode.Uri.joinPath(this.context.globalStorageUri, 'diagnostics');
            await vscode.workspace.fs.createDirectory(dir);
            const file = this.fileFor(this.todayKey || this.dayKey(new Date()));
            let existing: Buffer = Buffer.alloc(0);
            try { existing = Buffer.from(await vscode.workspace.fs.readFile(file)); } catch { /* 첫 기록 */ }
            await vscode.workspace.fs.writeFile(file, Buffer.concat([existing, Buffer.from(chunk, 'utf8')]));
        } catch { /* 디스크 실패는 무시 */ }
    }

    /** 보존 기간이 지난 로그 파일을 지운다 */
    private async prune(): Promise<void> {
        try {
            const dir = vscode.Uri.joinPath(this.context.globalStorageUri, 'diagnostics');
            const entries = await vscode.workspace.fs.readDirectory(dir);
            const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
            for (const [name] of entries) {
                const m = name.match(/^zen-(\d{4}-\d{2}-\d{2})\.jsonl$/);
                if (!m) continue;
                if (new Date(m[1] + 'T00:00:00').getTime() < cutoff) {
                    await vscode.workspace.fs.delete(vscode.Uri.joinPath(dir, name));
                }
            }
        } catch { /* 정리 실패는 무시 */ }
    }

    /** 로그 디렉터리. 분석 스크립트와 명령이 이 경로를 쓴다. */
    get directory(): vscode.Uri {
        return vscode.Uri.joinPath(this.context.globalStorageUri, 'diagnostics');
    }
}

/** 파일 경로를 되돌릴 수 없는 짧은 식별자로 바꾼다. 같은 파일은 같은 값이 나오므로
 *  "특정 문서에서만 나는 문제"를 추적할 수 있으면서 경로 자체는 남지 않는다. */
export function docHash(uri: vscode.Uri): string {
    let h = 2166136261;
    const s = uri.toString();
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
}
