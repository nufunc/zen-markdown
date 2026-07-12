import * as vscode from 'vscode';
import { NeatMdEditorProvider } from './neatMdEditorProvider';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(NeatMdEditorProvider.register(context));

    context.subscriptions.push(
        vscode.commands.registerCommand('neatMdEditor.openWithTextEditor', () => {
            vscode.commands.executeCommand('workbench.action.reopenTextEditor');
        }),
        vscode.commands.registerCommand('neatMdEditor.openWithNeatEditor', (uri?: vscode.Uri) => {
            const target = uri ?? vscode.window.activeTextEditor?.document.uri;
            if (target) {
                vscode.commands.executeCommand('vscode.openWith', target, 'neatMdEditor.mdEditor');
            }
        })
    );
}

export function deactivate() {}
