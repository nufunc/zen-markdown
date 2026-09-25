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
    const targetPath = path.resolve(docDir, decodeURIComponent(href.split('#')[0]));
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
