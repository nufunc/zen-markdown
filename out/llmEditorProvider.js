"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMAssistEditorProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
class LLMAssistEditorProvider {
    static register(context) {
        const provider = new LLMAssistEditorProvider(context);
        return vscode.window.registerCustomEditorProvider('llmAssist.mdEditor', provider);
    }
    constructor(context) {
        this.context = context;
    }
    async resolveCustomTextEditor(document, webviewPanel, _token) {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist'))]
        };
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);
        function updateWebview() {
            webviewPanel.webview.postMessage({
                type: 'update',
                text: document.getText(),
            });
        }
        function sendConfig() {
            const config = vscode.workspace.getConfiguration('llmAssist');
            let theme = config.get('theme') || 'auto';
            if (theme === 'auto') {
                const kind = vscode.window.activeColorTheme.kind;
                theme = (kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast) ? 'dark' : 'light';
            }
            const fontSize = config.get('fontSize') || 16;
            const autoFix = config.get('autoFix') || false;
            const autoRefresh = config.get('autoRefresh') ?? true;
            const showToc = config.get('showToc') ?? false;
            const showProperties = config.get('showProperties') ?? false;
            const isReadOnly = document.uri.scheme !== 'file';
            webviewPanel.webview.postMessage({
                type: 'config',
                theme,
                fontSize,
                autoFix,
                autoRefresh,
                showToc,
                showProperties,
                isReadOnly
            });
        }
        let isInternalUpdate = false;
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                if (!isInternalUpdate) {
                    const currentConfig = vscode.workspace.getConfiguration('llmAssist');
                    const autoRefresh = currentConfig.get('autoRefresh') ?? true;
                    if (autoRefresh) {
                        webviewPanel.webview.postMessage({
                            type: 'external_update',
                            text: document.getText(),
                        });
                    }
                }
            }
        });
        const configSubscription = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('llmAssist')) {
                sendConfig();
            }
        });
        const themeSubscription = vscode.window.onDidChangeActiveColorTheme(() => {
            sendConfig();
        });
        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
            configSubscription.dispose();
            themeSubscription.dispose();
        });
        webviewPanel.webview.onDidReceiveMessage(e => {
            switch (e.type) {
                case 'change':
                    isInternalUpdate = true;
                    this.updateTextDocument(document, e.text).then(() => {
                        setTimeout(() => isInternalUpdate = false, 50);
                    });
                    return;
                case 'refresh':
                    webviewPanel.webview.postMessage({
                        type: 'external_update',
                        text: document.getText(),
                    });
                    return;
                case 'ready':
                    sendConfig();
                    updateWebview();
                    return;
                case 'updateConfig':
                    const config = vscode.workspace.getConfiguration('llmAssist');
                    // 타겟을 지정하지 않으면 가장 우선순위가 높은(현재 적용중인) 설정 위치를 업데이트함
                    config.update(e.key, e.value);
                    return;
                case 'getOriginalContent':
                    const dirname = path.dirname(document.uri.fsPath);
                    const basename = path.basename(document.uri.fsPath);
                    (0, child_process_1.exec)(`git show "HEAD:./${basename}"`, { cwd: dirname }, (err, stdout, stderr) => {
                        webviewPanel.webview.postMessage({
                            type: 'originalContent',
                            content: err ? `[Git History Not Found or File Untracked]\n\n${stderr || err.message}` : stdout
                        });
                    });
                    return;
            }
        });
    }
    getHtmlForWebview(webview) {
        const baseUri = webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist'))).toString() + '/';
        const scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist', 'assets', 'index.js')));
        const styleUri = webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist', 'assets', 'index.css')));
        // Use a nonce to whitelist which scripts can be run
        const nonce = getNonce();
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <base href="${baseUri}">
                <meta charset="UTF-8">
                <!--
                Use a content security policy to only allow loading images from https or from our extension directory,
                and only allow scripts that have a specific nonce.
                -->
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource} data:;">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet" />
                <title>Neat MD Editor</title>
            </head>
            <body>
                <div id="root"></div>
                <script nonce="${nonce}">
                    window.onerror = function(message, source, lineno, colno, error) {
                        document.body.innerHTML += '<div style="color:red; padding: 20px; font-family: monospace;"><b>FATAL ERROR:</b> ' + message + '<br>' + source + ':' + lineno + ':' + colno + '<br>' + (error ? error.stack : '') + '</div>';
                    };
                    window.addEventListener("unhandledrejection", function(event) {
                        document.body.innerHTML += '<div style="color:red; padding: 20px; font-family: monospace;"><b>UNHANDLED PROMISE REJECTION:</b> ' + event.reason + '</div>';
                    });
                </script>
                <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
    updateTextDocument(document, newContent) {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), newContent);
        return vscode.workspace.applyEdit(edit);
    }
}
exports.LLMAssistEditorProvider = LLMAssistEditorProvider;
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
//# sourceMappingURL=llmEditorProvider.js.map