import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec, execFile } from 'child_process';

// 웹뷰가 설정을 바꿀 수 있는 키 허용목록 (임의 키 주입 방지)
const ALLOWED_CONFIG_KEYS = ['theme', 'fontSize', 'autoFix', 'autoRefresh', 'showToc', 'showProperties', 'defaultCodeLanguage'];
// openLink에서 외부로 여는 것을 허용하는 URL 스킴
const ALLOWED_LINK_SCHEMES = ['http', 'https', 'mailto', 'vscode'];

export class ZenMdEditorProvider implements vscode.CustomTextEditorProvider {
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new ZenMdEditorProvider(context);
        return vscode.window.registerCustomEditorProvider('zenMarkdown.mdEditor', provider, {
            webviewOptions: {
                enableFindWidget: false,
                // WYSIWYG 에디터 특성상 탭 전환 시 커서/스크롤/편집 상태 보존이 중요
                retainContextWhenHidden: true
            }
        });
    }

    constructor(
        private readonly context: vscode.ExtensionContext
    ) { }

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        const docDir = document.uri.scheme === 'file' ? path.dirname(document.uri.fsPath) : undefined;

        // 문서 폴더 + 문서가 속한 워크스페이스 폴더만 허용 (전체 워크스페이스 개방 지양)
        const localResourceRoots = [vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'dist')];
        if (docDir) {
            localResourceRoots.push(vscode.Uri.file(docDir));
        }
        const containingFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (containingFolder) {
            localResourceRoots.push(containingFolder.uri);
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
            const config = vscode.workspace.getConfiguration('zenMarkdown');
            let theme = config.get<string>('theme') || 'auto';
            if (theme === 'auto') {
                const kind = vscode.window.activeColorTheme.kind;
                theme = (kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast) ? 'dark' : 'light';
            }
            const fontSize = config.get<number>('fontSize') || 16;
            const autoFix = config.get<boolean>('autoFix') || false;
            const autoRefresh = config.get<boolean>('autoRefresh') ?? true;
            const showToc = config.get<boolean>('showToc') ?? false;
            const showProperties = config.get<boolean>('showProperties') ?? false;
            const defaultCodeLanguage = config.get<string>('defaultCodeLanguage') || 'text';
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
                defaultCodeLanguage,
                docBaseUri
            });
        }

        // 웹뷰가 보낸 미반영 텍스트들을 기억해 자기 echo를 걸러냄.
        // applyEdit이 비동기라 연속 편집 시 마지막 하나만 기억하면 이전 변경이
        // 외부 변경으로 오판되므로, 최근 목록을 유지하고 매칭 지점까지 소비한다.
        const pendingWebviewTexts: string[] = [];
        let externalUpdateTimer: NodeJS.Timeout | undefined;

        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() !== document.uri.toString()) {
                return;
            }
            const currentText = document.getText().replace(/\r\n/g, '\n');
            const echoIdx = pendingWebviewTexts.findIndex(t => t.replace(/\r\n/g, '\n') === currentText);
            if (echoIdx !== -1) {
                // 웹뷰 편집이 문서에 반영된 echo — 해당 지점까지 소비하고 되쏘지 않음
                pendingWebviewTexts.splice(0, echoIdx + 1);
                return;
            }
            const currentConfig = vscode.workspace.getConfiguration('zenMarkdown');
            const autoRefresh = currentConfig.get<boolean>('autoRefresh') ?? true;
            if (autoRefresh) {
                // 분할 뷰 타이핑 등 연속 외부 변경은 디바운스해서 웹뷰 재파싱 비용을 줄임
                if (externalUpdateTimer) {
                    clearTimeout(externalUpdateTimer);
                }
                externalUpdateTimer = setTimeout(() => {
                    externalUpdateTimer = undefined;
                    webviewPanel.webview.postMessage({
                        type: 'external_update',
                        text: document.getText(),
                    });
                }, 250);
            }
        });

        const configSubscription = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('zenMarkdown')) {
                sendConfig();
            }
        });

        const themeSubscription = vscode.window.onDidChangeActiveColorTheme(() => {
            sendConfig();
        });

        webviewPanel.onDidDispose(() => {
            if (externalUpdateTimer) {
                clearTimeout(externalUpdateTimer);
            }
            changeDocumentSubscription.dispose();
            configSubscription.dispose();
            themeSubscription.dispose();
        });

        webviewPanel.webview.onDidReceiveMessage(e => {
            switch (e.type) {
                case 'change': {
                    const text = String(e.text ?? '');
                    pendingWebviewTexts.push(text);
                    if (pendingWebviewTexts.length > 50) {
                        pendingWebviewTexts.shift();
                    }
                    this.updateTextDocument(document, text).then(ok => {
                        if (!ok) {
                            // 적용 실패(읽기 전용 등) — 웹뷰를 실제 문서 상태로 되돌려 어긋남 방지
                            webviewPanel.webview.postMessage({
                                type: 'external_update',
                                text: document.getText(),
                            });
                        }
                    });
                    return;
                }
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
                        } catch (err: any) {
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
                            const schemeMatch = href.match(/^([a-z][a-z0-9+.-]*):/i);
                            if (schemeMatch) {
                                const scheme = schemeMatch[1].toLowerCase();
                                if (ALLOWED_LINK_SCHEMES.includes(scheme)) {
                                    await vscode.env.openExternal(vscode.Uri.parse(href));
                                } else {
                                    vscode.window.showWarningMessage(`Blocked link with scheme "${scheme}:"`);
                                }
                                return;
                            }
                            if (!docDir) return;
                            const targetPath = path.resolve(docDir, decodeURIComponent(href.split('#')[0]));
                            // 문서 폴더 또는 워크스페이스 내부만 허용 (../ 탈출 차단)
                            const roots = [docDir, ...(vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath)];
                            const inScope = roots.some(root => {
                                const rel = path.relative(root, targetPath);
                                return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
                            });
                            if (!inScope) {
                                vscode.window.showWarningMessage(`Blocked link outside the workspace: ${href}`);
                                return;
                            }
                            const targetUri = vscode.Uri.file(targetPath);
                            if (targetPath.toLowerCase().endsWith('.md')) {
                                await vscode.commands.executeCommand('vscode.openWith', targetUri, 'zenMarkdown.mdEditor');
                            } else {
                                await vscode.commands.executeCommand('vscode.open', targetUri);
                            }
                        } catch (err: any) {
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
                case 'undo':
                    vscode.commands.executeCommand('undo');
                    return;
                case 'redo':
                    vscode.commands.executeCommand('redo');
                    return;
                case 'ready':
                    sendConfig();
                    updateWebview();
                    return;
                case 'openBuiltIn':
                    (async () => {
                        try {
                            // 'default' viewType은 커스텀 에디터가 priority:default로 등록돼 있으면
                            // 다시 이 에디터로 해석되므로, 활성 에디터를 텍스트 에디터로 다시 여는 명령을 사용
                            await vscode.commands.executeCommand('workbench.action.reopenTextEditor');
                        } catch (err: any) {
                            vscode.window.showWarningMessage(`Cannot open built-in editor: ${err?.message || err}`);
                        }
                    })();
                    return;
                case 'updateConfig': {
                    if (typeof e.key !== 'string' || !ALLOWED_CONFIG_KEYS.includes(e.key)) {
                        return;
                    }
                    const config = vscode.workspace.getConfiguration('zenMarkdown');
                    // 타겟을 지정하지 않으면 가장 우선순위가 높은(현재 적용중인) 설정 위치를 업데이트함
                    config.update(e.key, e.value).then(undefined, (err: any) => {
                        vscode.window.showWarningMessage(`Cannot save setting "${e.key}": ${err?.message || err}`);
                    });
                    return;
                }
                case 'getOriginalContent': {
                    if (document.uri.scheme !== 'file') {
                        webviewPanel.webview.postMessage({
                            type: 'originalContent',
                            content: '[Git diff is only available for files on disk]'
                        });
                        return;
                    }
                    const dirname = path.dirname(document.uri.fsPath);
                    const basename = path.basename(document.uri.fsPath);
                    // execFile: 파일명에 따옴표/특수문자가 있어도 셸 해석 없이 안전
                    execFile('git', ['show', `HEAD:./${basename}`], { cwd: dirname, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
                        webviewPanel.webview.postMessage({
                            type: 'originalContent',
                            content: err ? `[Git History Not Found or File Untracked]\n\n${stderr || err.message}` : stdout
                        });
                    });
                    return;
                }
                case 'exportPdf': {
                    (async () => {
                        try {
                            const docName = document.uri.scheme === 'file' ? path.basename(document.uri.fsPath, '.md') : 'document';
                            const tmpDir = os.tmpdir();
                            const tmpHtmlPath = path.join(tmpDir, `zen_md_pdf_${Date.now()}_${docName}.html`);
                            const bodyHtml = String(e.html || '');
                            const capturedStyles = String(e.styles || '');
                            const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${docName}</title>
<style>
${capturedStyles}
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 40px; max-width: 860px; margin: 0 auto; line-height: 1.6; color: #222; background: #ffffff; }
.bn-container, .bn-editor { background: transparent !important; color: inherit !important; font-size: inherit; }
pre, code { background: #f4f4f4; padding: 3px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #ddd; padding: 8px 12px; }
th { background: #f8f9fa; font-weight: 600; }
img { max-width: 100%; height: auto; }
@media print {
    body { padding: 0; max-width: 100%; color: #000; }
    @page { size: A4; margin: 15mm 15mm 20mm 15mm; }
    pre, table, blockquote, img, .bn-block-content, .bn-file-block { break-inside: avoid; page-break-inside: avoid; }
    h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; }
}
</style>
</head>
<body class="bn-container">
${bodyHtml}
<script>
window.onload = function() { window.print(); };
</script>
</body>
</html>`;
                            await vscode.workspace.fs.writeFile(vscode.Uri.file(tmpHtmlPath), Buffer.from(fullHtml, 'utf8'));
                            
                            const platform = process.platform;
                            let openCmd = '';
                            if (platform === 'win32') {
                                openCmd = `start "" "${tmpHtmlPath}"`;
                            } else if (platform === 'darwin') {
                                openCmd = `open "${tmpHtmlPath}"`;
                            } else {
                                openCmd = `xdg-open "${tmpHtmlPath}"`;
                            }

                            exec(openCmd, (err) => {
                                if (err) {
                                    vscode.env.openExternal(vscode.Uri.file(tmpHtmlPath)).then(undefined, (openErr) => {
                                        vscode.window.showWarningMessage(`PDF Export Error: ${openErr?.message || openErr}`);
                                    });
                                }
                            });

                            setTimeout(async () => {
                                try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpHtmlPath)); } catch {}
                            }, 120000);
                        } catch (err: any) {
                            vscode.window.showWarningMessage(`PDF Export Error: ${err?.message || err}`);
                        }
                    })();
                    return;
                }
            }
        });
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const distUri = vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'dist');
        const baseUri = webview.asWebviewUri(distUri).toString() + '/';

        // 엔트리 파일명은 콘텐츠 해시를 포함(index-<hash>.js)하므로 해시 자체가 캐시 버스터.
        // 쿼리 스트링(?t=) 방식은 동적 청크가 쿼리 없는 ./index.js를 다시 import할 때
        // 브라우저가 별개 모듈로 취급해 엔트리가 이중 실행됨 (acquireVsCodeApi 중복 오류)
        let scriptFile = 'index.js';
        let styleFile = 'index.css';
        try {
            const files = fs.readdirSync(path.join(this.context.extensionPath, 'webview', 'dist', 'assets'));
            scriptFile = files.find(f => /^index-[\w-]+\.js$/.test(f)) ?? scriptFile;
            styleFile = files.find(f => /^index-[\w-]+\.css$/.test(f)) ?? styleFile;
        } catch { /* dist 미존재 시 해시 없는 파일명 폴백 */ }

        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'assets', scriptFile)).toString();
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'assets', styleFile)).toString();

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
                <title>Zen Markdown</title>
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

    // 전체 치환 대신 공통 앞/뒤를 제외한 최소 범위만 교체해
    // undo 단위와 대용량 문서 성능을 개선함. 적용 성공 여부를 반환.
    private updateTextDocument(document: vscode.TextDocument, newContent: string): Thenable<boolean> {
        const oldContent = document.getText();
        if (oldContent === newContent) {
            return Promise.resolve(true);
        }
        let start = 0;
        const maxStart = Math.min(oldContent.length, newContent.length);
        while (start < maxStart && oldContent.charCodeAt(start) === newContent.charCodeAt(start)) {
            start++;
        }
        let oldEnd = oldContent.length;
        let newEnd = newContent.length;
        while (oldEnd > start && newEnd > start && oldContent.charCodeAt(oldEnd - 1) === newContent.charCodeAt(newEnd - 1)) {
            oldEnd--;
            newEnd--;
        }
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            document.uri,
            new vscode.Range(document.positionAt(start), document.positionAt(oldEnd)),
            newContent.slice(start, newEnd)
        );
        return vscode.workspace.applyEdit(edit);
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
