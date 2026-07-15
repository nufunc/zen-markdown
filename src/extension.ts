import * as vscode from 'vscode';
import { ZenMdEditorProvider } from './zenMdEditorProvider';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(ZenMdEditorProvider.register(context));

    context.subscriptions.push(
        vscode.commands.registerCommand('zenMarkdown.openWithTextEditor', () => {
            vscode.commands.executeCommand('workbench.action.reopenTextEditor');
        }),
        vscode.commands.registerCommand('zenMarkdown.openWithZenEditor', (uri?: vscode.Uri) => {
            const target = uri ?? vscode.window.activeTextEditor?.document.uri;
            if (target) {
                vscode.commands.executeCommand('vscode.openWith', target, 'zenMarkdown.mdEditor');
            }
        })
    );
}

export function deactivate() {}
