import * as vscode from 'vscode';
import { LLMAssistEditorProvider } from './llmEditorProvider';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(LLMAssistEditorProvider.register(context));

    context.subscriptions.push(
        vscode.commands.registerCommand('llmAssist.openWithTextEditor', () => {
            vscode.commands.executeCommand('workbench.action.reopenTextEditor');
        }),
        vscode.commands.registerCommand('llmAssist.openWithNeatEditor', (uri?: vscode.Uri) => {
            const target = uri ?? vscode.window.activeTextEditor?.document.uri;
            if (target) {
                vscode.commands.executeCommand('vscode.openWith', target, 'llmAssist.mdEditor');
            }
        })
    );
}

export function deactivate() {}
