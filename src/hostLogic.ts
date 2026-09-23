// 확장 호스트의 순수 로직. vscode 모듈에 기대지 않으므로 node:test로 바로 검사한다(hostLogic.test.ts).

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
