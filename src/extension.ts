import * as vscode from 'vscode';
import { ZenMdEditorProvider } from './zenMdEditorProvider';
import { DiagnosticsLog } from './diagnosticsLog';
import { buildDiagnosticsReport } from './diagnosticsReport';

export function activate(context: vscode.ExtensionContext) {
    const log = new DiagnosticsLog(context);

    context.subscriptions.push(ZenMdEditorProvider.register(context, log));

    context.subscriptions.push(
        vscode.commands.registerCommand('zenMarkdown.openWithTextEditor', () => {
            vscode.commands.executeCommand('workbench.action.reopenTextEditor');
        }),
        vscode.commands.registerCommand('zenMarkdown.openWithZenEditor', (uri?: vscode.Uri) => {
            const target = uri ?? vscode.window.activeTextEditor?.document.uri;
            if (target) {
                vscode.commands.executeCommand('vscode.openWith', target, 'zenMarkdown.mdEditor');
            }
        }),
        vscode.commands.registerCommand('zenMarkdown.showDiagnostics', async () => {
            await log.flush();
            const report = await buildDiagnosticsReport(log.directory);
            const doc = await vscode.workspace.openTextDocument({ content: report, language: 'markdown' });
            // 진단 보고서는 읽기 위한 것이므로 기본 텍스트 에디터로 연다
            await vscode.window.showTextDocument(doc, { preview: false });
        }),
        vscode.commands.registerCommand('zenMarkdown.openDiagnosticsFolder', async () => {
            await log.flush();
            await vscode.commands.executeCommand('revealFileInOS', log.directory);
        })
    );

    // 창이 닫힐 때 대기 중인 이벤트를 배출한다
    context.subscriptions.push({ dispose: () => { void log.flush(); } });
}

export function deactivate() { }
