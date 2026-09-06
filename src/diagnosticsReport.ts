import * as vscode from 'vscode';
import { parseLogLines, renderReport, LogRecord } from './diagnosticsAggregate';

// 로그 디렉터리를 읽어 보고서를 만든다. 집계 규칙 자체는 diagnosticsAggregate가 담는다.

const LOG_NAME_RE = /^zen-\d{4}-\d{2}-\d{2}\.jsonl$/;

export async function buildDiagnosticsReport(dir: vscode.Uri): Promise<string> {
    const records: LogRecord[] = [];
    try {
        const entries = await vscode.workspace.fs.readDirectory(dir);
        const names = entries.map(([name]) => name).filter(n => LOG_NAME_RE.test(n)).sort();
        for (const name of names) {
            const buf = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(dir, name));
            records.push(...parseLogLines(Buffer.from(buf).toString('utf8')));
        }
    } catch {
        return [
            '# Zen Markdown 진단 보고서',
            '',
            '로그 디렉터리를 읽지 못했다. 아직 기록이 없을 수 있다.',
            '',
            '경로: ' + dir.fsPath,
        ].join('\n');
    }
    return renderReport(records, dir.fsPath, new Date().toISOString());
}
