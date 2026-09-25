import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import { sanitizeDiag, resolveLinkPath, safeImageName, escapeHtml, ERROR_REPORTER_SCRIPT, minimalEdit, toDocumentEol, findEchoIndex } from './hostLogic';

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
    // 인코딩한 ../와 문서 폴더 밖의 절대 경로도 막는다(P1-3)
    assert.equal(resolveLinkPath(dir, '%2e%2e/outside.md', roots), null);
    assert.equal(resolveLinkPath(dir, '%2E%2E%2Foutside.md', roots), null);
    assert.equal(resolveLinkPath(dir, path.resolve('/elsewhere/x.md'), roots), null);
    if (process.platform === 'win32') {
        const otherDrive = dir.toUpperCase().startsWith('Z:') ? 'Y:/x.md' : 'Z:/x.md';
        assert.equal(resolveLinkPath(dir, otherDrive, roots), null);
    }
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

/** 치환을 적용한 결과 */
const applyEdit = (text: string, e: { start: number; end: number; text: string } | null) =>
    e ? text.slice(0, e.start) + e.text + text.slice(e.end) : text;

test('치환 범위: 같음, 앞만 다름, 뒤만 다름, 가운데, 빈 문자열', () => {
    assert.equal(minimalEdit('abc', 'abc'), null);
    assert.deepEqual(minimalEdit('abc', 'Xbc'), { start: 0, end: 1, text: 'X' });
    assert.deepEqual(minimalEdit('abc', 'abX'), { start: 2, end: 3, text: 'X' });
    assert.deepEqual(minimalEdit('hello world', 'hello brave world'), { start: 6, end: 6, text: 'brave ' });
    assert.deepEqual(minimalEdit('', 'new'), { start: 0, end: 0, text: 'new' });
    assert.deepEqual(minimalEdit('old', ''), { start: 0, end: 3, text: '' });
    for (const [a, b] of [['aaa', 'aa'], ['aa', 'aaa'], ['abab', 'ab'], ['x\ny', 'x\n\ny']]) {
        assert.equal(applyEdit(a, minimalEdit(a, b)), b, a + ' -> ' + b);
    }
});

test('치환 범위: 서로게이트 쌍 가운데에서 자르지 않는다', () => {
    // 😀(U+1F600)와 😃(U+1F603)는 앞 절반(high surrogate)이 같다
    const e = minimalEdit('a😀b', 'a😃b')!;
    assert.deepEqual(e, { start: 1, end: 3, text: '😃' });
    // 뒤 절반(low surrogate)이 같은 쌍: 𝐀(U+1D400)와 🐀(U+1F400)
    const f = minimalEdit('x𝐀y', 'x🐀y')!;
    assert.deepEqual(f, { start: 1, end: 3, text: '🐀' });
    for (const [a, b] of [['a😀b', 'a😃b'], ['x𝐀y', 'x🐀y'], ['😀', ''], ['', '😀'], ['😀😀', '😀']]) {
        assert.equal(applyEdit(a, minimalEdit(a, b)), b);
    }
});

test('CRLF 문서에서 한 단어를 고치면 그 단어 근처만 치환한다', () => {
    const lines = Array.from({ length: 2000 }, (_, i) => `line ${i} some text here`);
    const doc = lines.join('\r\n') + '\r\n';
    const edited = lines.map((l, i) => (i === 1000 ? l.replace('some', 'more') : l)).join('\n') + '\n';
    // 줄 끝을 맞추지 않으면 문서 거의 전체가 치환된다
    const raw = minimalEdit(doc, edited)!;
    assert.ok(raw.end - raw.start > doc.length * 0.9);
    // 문서의 줄 끝에 맞추면 바뀐 글자만 치환된다
    const aligned = minimalEdit(doc, toDocumentEol(edited, '\r\n'))!;
    assert.ok(aligned.end - aligned.start <= 4, JSON.stringify(aligned));
    assert.equal(applyEdit(doc, aligned), doc.replace('line 1000 some', 'line 1000 more'));
    // LF 문서는 그대로
    assert.equal(toDocumentEol('a\nb', '\n'), 'a\nb');
    assert.equal(toDocumentEol('a\r\nb\nc', '\r\n'), 'a\r\nb\r\nc');
});

test('에코 판별: 줄 끝과 끝 공백을 무시하고, 중간 항목과 일치하면 그 위치를 돌려준다', () => {
    assert.equal(findEchoIndex(['a\nb'], 'a\r\nb'), 0);
    assert.equal(findEchoIndex(['one', 'two\n', 'three'], 'two'), 1);
    assert.equal(findEchoIndex(['text  \n\n'], 'text'), 0);
    assert.equal(findEchoIndex(['one', 'two'], 'other'), -1);
    assert.equal(findEchoIndex([], 'x'), -1);
    // CRLF로 맞춰 넣은 문서도 웹뷰가 보낸 LF 텍스트와 에코로 판별된다
    assert.equal(findEchoIndex(['# T\n\nbody\n'], toDocumentEol('# T\n\nbody\n', '\r\n')), 0);
});
