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
exports.NeatMdEditorProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
class NeatMdEditorProvider {
    static register(context) {
        const provider = new NeatMdEditorProvider(context);
        return vscode.window.registerCustomEditorProvider('neatMdEditor.mdEditor', provider, {
            webviewOptions: { enableFindWidget: true }
        });
    }
    constructor(context) {
        this.context = context;
    }
    async resolveCustomTextEditor(document, webviewPanel, _token) {
        const docDir = document.uri.scheme === 'file' ? path.dirname(document.uri.fsPath) : undefined;
        const localResourceRoots = [vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'dist'))];
        if (docDir) {
            localResourceRoots.push(vscode.Uri.file(docDir));
        }
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            localResourceRoots.push(folder.uri);
        }
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots
        };
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);
        function updateWebview() {
            webviewPanel.webview.postMessage({
                type: 'update',
                text: document.getText(),
            });
        }
        function sendConfig() {
            const config = vscode.workspace.getConfiguration('neatMdEditor');
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
            const isReadOnly = !['file', 'untitled', 'vscode-vfs'].includes(document.uri.scheme);
            // 문서 폴더의 webview URI — 상대경로 이미지 미리보기용
            const docBaseUri = docDir
                ? webviewPanel.webview.asWebviewUri(vscode.Uri.file(docDir)).toString()
                : '';
            webviewPanel.webview.postMessage({
                type: 'config',
                theme,
                fontSize,
                autoFix,
                autoRefresh,
                showToc,
                showProperties,
                isReadOnly,
                docBaseUri
            });
        }
        // 웹뷰가 마지막으로 보낸 텍스트를 기억해 자기 echo를 걸러냄 (타이머 레이스 없음)
        let lastWebviewText;
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                const currentText = document.getText();
                if (currentText === lastWebviewText) {
                    return; // 웹뷰 편집이 문서에 반영된 echo — 되쏘지 않음
                }
                const currentConfig = vscode.workspace.getConfiguration('neatMdEditor');
                const autoRefresh = currentConfig.get('autoRefresh') ?? true;
                if (autoRefresh) {
                    webviewPanel.webview.postMessage({
                        type: 'external_update',
                        text: currentText,
                    });
                }
            }
        });
        const configSubscription = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('neatMdEditor')) {
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
                    lastWebviewText = e.text;
                    this.updateTextDocument(document, e.text);
                    return;
                case 'notify':
                    vscode.window.showInformationMessage(e.message);
                    return;
                case 'saveImage':
                    (async () => {
                        try {
                            if (!docDir) {
                                throw new Error('Save the document to disk before pasting images.');
                            }
                            const assetsDir = vscode.Uri.file(path.join(docDir, 'assets'));
                            await vscode.workspace.fs.createDirectory(assetsDir);
                            const safeName = String(e.name || 'image.png').replace(/[^\w.-]+/g, '_');
                            const ext = path.extname(safeName) || '.png';
                            const base = path.basename(safeName, ext) || 'image';
                            const fileName = `${base}-${Date.now()}${ext}`;
                            const fileUri = vscode.Uri.joinPath(assetsDir, fileName);
                            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(e.data, 'base64'));
                            webviewPanel.webview.postMessage({
                                type: 'imageSaved',
                                requestId: e.requestId,
                                relPath: `assets/${fileName}`
                            });
                        }
                        catch (err) {
                            webviewPanel.webview.postMessage({
                                type: 'imageSaved',
                                requestId: e.requestId,
                                error: err?.message || String(err)
                            });
                        }
                    })();
                    return;
                case 'openLink':
                    (async () => {
                        const href = String(e.href || '');
                        try {
                            if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
                                await vscode.env.openExternal(vscode.Uri.parse(href));
                                return;
                            }
                            if (!docDir)
                                return;
                            const targetPath = path.resolve(docDir, decodeURIComponent(href.split('#')[0]));
                            const targetUri = vscode.Uri.file(targetPath);
                            if (targetPath.toLowerCase().endsWith('.md')) {
                                await vscode.commands.executeCommand('vscode.openWith', targetUri, 'neatMdEditor.mdEditor');
                            }
                            else {
                                await vscode.commands.executeCommand('vscode.open', targetUri);
                            }
                        }
                        catch (err) {
                            vscode.window.showWarningMessage(`Cannot open link: ${href} (${err?.message || err})`);
                        }
                    })();
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
                    const config = vscode.workspace.getConfiguration('neatMdEditor');
                    // 타겟을 지정하지 않으면 가장 우선순위가 높은(현재 적용중인) 설정 위치를 업데이트함
                    config.update(e.key, e.value);
                    return;
                case 'getOriginalContent':
                    const dirname = path.dirname(document.uri.fsPath);
                    const basename = path.basename(document.uri.fsPath);
                    // execFile: 파일명에 따옴표/특수문자가 있어도 셸 해석 없이 안전
                    (0, child_process_1.execFile)('git', ['show', `HEAD:./${basename}`], { cwd: dirname }, (err, stdout, stderr) => {
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
exports.NeatMdEditorProvider = NeatMdEditorProvider;
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
//# sourceMappingURL=neatMdEditorProvider.js.map