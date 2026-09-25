import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import { sanitizeDiag, resolveLinkPath, safeImageName, escapeHtml, ERROR_REPORTER_SCRIPT } from './hostLogic';

test('임의 문자열 필드는 기록하지 않고 개수만 남긴다', () => {
    const r = sanitizeDiag({ type: 'diag', ev: 'serialize_failed', message: '비밀 원고 첫 문단' });
    assert.deepEqual(r, { ev: 'serialize_failed', fields: { dropped: 1 } });
});

test('웹뷰가 보낸 doc과 ts는 버린다', () => {
    const r = sanitizeDiag({ ev: 'serialize_failed', doc: 'forged', ts: '1999-01-01T00:00:00Z' });
    assert.deepEqual(r, { ev: 'serialize_failed', fields: { dropped: 2 } });
});

test('허용한 문자열 값만 남긴다', () => {
    assert.deepEqual(sanitizeDiag({ ev: 'external_conflict', choice: 'mine' })?.fields, { choice: 'mine' });
    assert.deepEqual(sanitizeDiag({ ev: 'external_conflict', choice: '원고' })?.fields, { dropped: 1 });
});

test('유한한 숫자와 불리언은 남기고 NaN과 Infinity는 버린다', () => {
    const r = sanitizeDiag({ ev: 'open', bytes: 10, ok: true, bad: Number.NaN, inf: Infinity });
    assert.deepEqual(r?.fields, { bytes: 10, ok: true, dropped: 2 });
});

test('kinds는 DriftKind 키와 숫자 값만 남긴다', () => {
    const r = sanitizeDiag({ ev: 'roundtrip_drift', removed: 2, kinds: { html: 3, 원고: 1, other: '문장' } });
    assert.deepEqual(r?.fields, { removed: 2, kinds: { html: 3 }, dropped: 2 });
});

test('객체, 배열, null 필드는 버린다', () => {
    const r = sanitizeDiag({ ev: 'x', obj: { a: 1 }, arr: [1], nil: null });
    assert.deepEqual(r?.fields, { dropped: 3 });
});

test('ev 형식이 맞지 않으면 기록하지 않는다', () => {
    assert.equal(sanitizeDiag({ ev: 'Bad-Event' }), null);
    assert.equal(sanitizeDiag({ ev: '원고 조각' }), null);
    assert.equal(sanitizeDiag({ ev: 'a'.repeat(65) }), null);
    assert.equal(sanitizeDiag({ ev: 42 }), null);
});

test('지금의 호출 지점이 보내는 모양은 그대로 남는다', () => {
    // 코드만 보내는 11곳, choice를 보내는 external_conflict, 수치와 kinds를 보내는 roundtrip_drift
    assert.deepEqual(sanitizeDiag({ type: 'diag', ev: 'serialize_failed' }), { ev: 'serialize_failed', fields: {} });
    assert.deepEqual(sanitizeDiag({ type: 'diag', ev: 'external_conflict', choice: 'external' })?.fields, { choice: 'external' });
    const drift = { removed: 1, added: 2, kinds: { fence_lang: 2, blank_line: 1 }, lines: 142 };
    assert.deepEqual(sanitizeDiag({ type: 'diag', ev: 'roundtrip_drift', ...drift })?.fields, drift);
});

test('공백이 든 ev는 기록하지 않는다', () => {
    assert.equal(sanitizeDiag({ ev: 'a b' }), null);
});

test('openLink 경로: 공백과 폴더, 헤딩 조각, 퍼센트 인코딩을 받고 문서 폴더 밖은 막는다', () => {
    const dir = path.resolve('/vault/notes');
    const roots = [dir];
    assert.equal(resolveLinkPath(dir, 'my doc.md', roots), path.join(dir, 'my doc.md'));
    assert.equal(resolveLinkPath(dir, '폴더/한글 문서.md', roots), path.join(dir, '폴더', '한글 문서.md'));
    assert.equal(resolveLinkPath(dir, 'a.md#Heading Two', roots), path.join(dir, 'a.md'));
    assert.equal(resolveLinkPath(dir, 'my%20doc.md', roots), path.join(dir, 'my doc.md'));
    assert.equal(resolveLinkPath(dir, '../outside.md', roots), null);
});

test('붙여 넣은 이미지 이름: 한글과 숫자는 남기고 경로 구분자, 제어 문자, 예약 문자, 공백은 _로 바꾼다', () => {
    assert.equal(safeImageName('화면 캡처 2026.png'), '화면_캡처_2026.png');
    assert.equal(safeImageName('スクリーン.png'), 'スクリーン.png');
    assert.equal(safeImageName('../../etc/passwd'), '.._.._etc_passwd');
    assert.equal(safeImageName('a\\b/c.png'), 'a_b_c.png');
    assert.equal(safeImageName('x<>:"|?*y.png'), 'x_y.png');
    assert.equal(safeImageName('ctl\u0000\u001fname.png'), 'ctl_name.png');
    assert.ok(!/[\\/]/.test(safeImageName('..\\..\\x.png')));
});

test('PDF 제목의 파일 이름은 HTML 이스케이프를 거친다', () => {
    assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
    assert.equal(escapeHtml('a & "b" \'c\''), 'a &amp; &quot;b&quot; &#39;c&#39;');
});

test('오류 표시는 메시지를 HTML로 해석하지 않고 글자로 붙인다', () => {
    // 가짜 document: 만든 노드와 쓴 속성만 기록한다. innerHTML을 쓰면 실패한다
    const appended: any[] = [];
    const node = (tag: string) => {
        const el: any = { tag, style: {}, children: [] as any[], appendChild(c: any) { this.children.push(c); } };
        Object.defineProperty(el, 'innerHTML', { set() { throw new Error('innerHTML used'); } });
        return el;
    };
    const fakeDocument = {
        createElement: node,
        createTextNode: (text: string) => ({ text }),
        body: { appendChild: (el: any) => appended.push(el), set innerHTML(_v: string) { throw new Error('innerHTML used'); } },
    };
    const listeners: Record<string, (e: any) => void> = {};
    const fakeWindow: any = { addEventListener: (type: string, fn: any) => { listeners[type] = fn; } };
    new Function('window', 'document', ERROR_REPORTER_SCRIPT)(fakeWindow, fakeDocument);
    const evil = '<img src=x onerror=alert(1)>';
    fakeWindow.onerror(evil, 'app.js', 1, 2, { stack: evil });
    listeners.unhandledrejection({ reason: evil });
    assert.equal(appended.length, 2);
    for (const box of appended) {
        assert.ok(box.children[1].text.includes(evil), '메시지가 글자 노드로 들어간다');
    }
    assert.equal(appended[0].children[0].textContent, 'FATAL ERROR:');
});
