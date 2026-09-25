// 확장 호스트의 순수 로직. vscode 모듈에 기대지 않으므로 node:test로 바로 검사한다(hostLogic.test.ts).
import * as path from 'path';

/** 웹뷰의 roundtripCheck.ts DriftKind와 같은 목록이어야 한다. 호스트는 웹뷰 코드를 import하지 않는다. */
const DRIFT_KINDS = new Set(['fence_lang', 'link_form', 'blank_line', 'trailing_space', 'list_marker', 'heading', 'html', 'other']);

/** 문자열 필드는 값이 정해진 것만 받는다. 새 문자열 필드를 보내려면 여기에 값을 더한다. */
const ALLOWED_STRINGS: Record<string, ReadonlySet<string>> = {
    choice: new Set(['external', 'mine']),
};

const EV_RE = /^[a-z_]{1,64}$/;

export interface SanitizedDiag {
    ev: string;
    fields: Record<string, unknown>;
}

/**
 * 웹뷰가 보낸 진단 메시지에서 기록해도 되는 필드만 남긴다. 기록할 수 없는 메시지면 null.
 * 웹뷰는 신뢰 경계 밖이다. 호출 지점의 관례에 기대지 않고 여기서 "문서 내용은 기록하지 않는다"를 강제한다.
 * - 유한한 숫자와 불리언은 남긴다.
 * - 문자열은 ALLOWED_STRINGS에 있는 값만 남긴다.
 * - kinds는 DriftKind 이름을 키로, 유한한 숫자를 값으로 하는 항목만 남긴다.
 * - doc과 ts는 호스트 값을 쓰므로 웹뷰가 보내도 버린다.
 * 버린 필드는 이름과 값 없이 개수만 dropped로 남긴다.
 */
export function sanitizeDiag(msg: Record<string, unknown>): SanitizedDiag | null {
    const { type: _type, ev, ...rest } = msg;
    if (typeof ev !== 'string' || !EV_RE.test(ev)) return null;
    const fields: Record<string, unknown> = {};
    let dropped = 0;
    for (const [key, value] of Object.entries(rest)) {
        if (key === 'doc' || key === 'ts' || key === 'dropped') {
            dropped++;
        } else if ((typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean') {
            fields[key] = value;
        } else if (typeof value === 'string' && ALLOWED_STRINGS[key]?.has(value)) {
            fields[key] = value;
        } else if (key === 'kinds' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
            const kinds: Record<string, number> = {};
            for (const [k, n] of Object.entries(value)) {
                if (DRIFT_KINDS.has(k) && typeof n === 'number' && Number.isFinite(n)) kinds[k] = n;
                else dropped++;
            }
            fields.kinds = kinds;
        } else {
            dropped++;
        }
    }
    if (dropped > 0) fields.dropped = dropped;
    return { ev, fields };
}

/**
 * openLink가 받은 상대 링크를 파일 경로로 바꾼다. 조각(#헤딩)은 떼고, 퍼센트 인코딩과 공백이 든 경로를 그대로 받는다.
 * roots(문서 폴더와 워크스페이스 폴더) 밖이면 null. ../로 빠져나가는 링크를 막는다.
 */
export function resolveLinkPath(docDir: string, href: string, roots: string[]): string | null {
    // #헤딩처럼 경로가 비면 파일이 아니다(같은 문서 안 링크는 웹뷰가 처리한다). 예전에는 문서 폴더로 풀려 폴더가 열렸다
    const filePart = href.split('#')[0];
    if (!filePart) return null;
    const targetPath = path.resolve(docDir, decodeURIComponent(filePart));
    const inScope = roots.some(root => {
        const rel = path.relative(root, targetPath);
        return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    });
    return inScope ? targetPath : null;
}

/**
 * 붙여 넣은 이미지의 파일 이름에서 글자(모든 언어), 숫자, '.', '_', '-' 말고는 '_'로 바꾼다.
 * 한글 이름을 남기면서 경로 구분자, 제어 문자, Windows 예약 문자(<>:"/\|?*)와 공백은 걸러 낸다(추가 검토 25).
 */
export function safeImageName(name: string): string {
    return name.replace(/[^\p{L}\p{N}._-]+/gu, '_');
}

/** HTML 본문과 속성에 넣을 글자를 이스케이프한다. 파일 이름처럼 사용자가 정한 글자를 HTML에 넣을 때 쓴다 */
export function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * 웹뷰 HTML에 넣는 오류 표시 스크립트. 오류 메시지, 출처, 스택, 거부 사유는 HTML로 해석하지 않고 글자로 붙인다.
 * 예전에는 innerHTML에 이어 붙여, 메시지에 든 태그가 그대로 해석됐다.
 */
export const ERROR_REPORTER_SCRIPT = `
window.__zenShowError = function (title, text) {
    var box = document.createElement('div');
    box.style.cssText = 'color:red; padding: 20px; font-family: monospace; white-space: pre-wrap;';
    var head = document.createElement('b');
    head.textContent = title;
    box.appendChild(head);
    box.appendChild(document.createTextNode(' ' + text));
    document.body.appendChild(box);
};
window.onerror = function (message, source, lineno, colno, error) {
    window.__zenShowError('FATAL ERROR:', String(message) + '\\n' + source + ':' + lineno + ':' + colno + '\\n' + (error ? error.stack : ''));
};
window.addEventListener('unhandledrejection', function (event) {
    window.__zenShowError('UNHANDLED PROMISE REJECTION:', String(event.reason));
});
`;

/** 문서의 [start, end) 구간을 text로 바꾸는 치환 하나 */
export interface TextEdit { start: number; end: number; text: string }

const isHighSurrogate = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLowSurrogate = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/**
 * oldText를 newText로 만드는 치환 하나를 앞뒤 공통 부분을 떼고 계산한다. 같으면 null.
 * 서로게이트 쌍(이모지 등) 가운데에서 자르지 않는다. 전체 치환 대신 이 범위만 바꾸면
 * 실행 취소 한 번이 편집 한 번이고, 같은 파일을 연 텍스트 에디터의 커서도 튀지 않는다.
 */
export function minimalEdit(oldText: string, newText: string): TextEdit | null {
    if (oldText === newText) return null;
    let start = 0;
    const maxStart = Math.min(oldText.length, newText.length);
    while (start < maxStart && oldText.charCodeAt(start) === newText.charCodeAt(start)) start++;
    if (start > 0 && isHighSurrogate(oldText.charCodeAt(start - 1))) start--;
    let oldEnd = oldText.length;
    let newEnd = newText.length;
    while (oldEnd > start && newEnd > start && oldText.charCodeAt(oldEnd - 1) === newText.charCodeAt(newEnd - 1)) {
        oldEnd--;
        newEnd--;
    }
    if (oldEnd < oldText.length && isLowSurrogate(oldText.charCodeAt(oldEnd)) && oldEnd > start) {
        oldEnd++;
        newEnd++;
    }
    return { start, end: oldEnd, text: newText.slice(start, newEnd) };
}

/**
 * 웹뷰는 줄 끝을 LF로 보낸다. 문서가 CRLF면 치환 범위를 계산하기 전에 CRLF로 맞춘다.
 * 그러지 않으면 첫 줄 끝부터 두 텍스트가 달라져 편집할 때마다 문서 전체가 치환된다(P1-3).
 */
export function toDocumentEol(text: string, eol: '\n' | '\r\n'): string {
    return eol === '\r\n' ? text.replace(/\r?\n/g, '\r\n') : text;
}

/** 줄 끝과 앞뒤 공백을 무시하고 견준다. 에코 판별과 웹뷰의 같은 이름 함수가 같은 규칙을 쓴다 */
export const normalizeMd = (s: string) => s.replace(/\r\n/g, '\n').trim();

/**
 * 문서 변경이 웹뷰가 보낸 텍스트의 반영(에코)인지 본다. 보낸 텍스트 목록에서 지금 문서와 같은 항목의 위치를 돌려주고,
 * 없으면 -1이다. applyEdit이 비동기라 연속 편집이 쌓이므로, 호출한 쪽은 찾은 위치까지 소비한다.
 */
export function findEchoIndex(pending: readonly string[], documentText: string): number {
    const current = normalizeMd(documentText);
    return pending.findIndex(t => normalizeMd(t) === current);
}

/** webview/dist/assets의 파일 목록에서 해시가 붙은 엔트리 스크립트와 스타일을 찾는다. 없으면 해시 없는 이름 */
export function findEntryAssets(files: readonly string[]): { script: string; style: string } {
    return {
        script: files.find(f => /^index-[\w-]+\.js$/.test(f)) ?? 'index.js',
        style: files.find(f => /^index-[\w-]+\.css$/.test(f)) ?? 'index.css',
    };
}

/**
 * PDF 내보내기용 HTML. bundleCss는 빌드된 index-*.css 내용이고, capturedStyles는 웹뷰가 보낸 <style> 내용이다.
 * 빌드본은 BlockNote와 Mantine 스타일을 <link>로 불러오는 index-*.css에 담으므로, 웹뷰의 <style>만 모으면
 * 목록 들여쓰기, 불릿, 번호, 체크박스 배치가 빠진다(추가 검토 26). 번들 CSS를 먼저 넣고 웹뷰 스타일과 인쇄용 규칙을 뒤에 둔다.
 */
export function buildPrintHtml(o: { title: string; bundleCss: string; capturedStyles: string; bodyHtml: string }): string {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapeHtml(o.title)}</title>
<style>
${o.bundleCss}
</style>
<style>
${o.capturedStyles}
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
${o.bodyHtml}
<script>
window.onload = function() { window.print(); };
</script>
</body>
</html>`;
}

/**
 * 충돌 막대 Compare의 가상 문서 경로. .md로 끝나면 customEditors 선택자(*.md)에 걸려 Zen 편집기 두 개로 열리므로
 * .md.external, .md.mine으로 끝낸다(추가 검토 28). 언어는 호출한 쪽이 markdown으로 건다.
 */
export function comparePath(fileName: string, side: 'external' | 'mine'): string {
    return '/' + fileName + '.' + side;
}
