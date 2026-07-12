import * as vscode from 'vscode';
import { LLMAssistEditorProvider } from './llmEditorProvider';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(LLMAssistEditorProvider.register(context));
}

export function deactivate() {}
