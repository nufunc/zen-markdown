// Word에서 붙여 넣은 목록(mso-list 문단)이 목록 블록이 되는지 본다(추가 검토 23).
// 실제 Word 클립보드가 아니라 Word가 내보내는 모양을 흉내 낸 HTML이다.
// 실행: npx tsx tests/paste.mts   (npm test에 들어 있다)
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { pretendToBeVisual: true });
for (const key of ['window','document','navigator','HTMLElement','Element','Node','DOMParser','MutationObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) {
  try { Object.defineProperty(globalThis, key, { value: (dom.window as any)[key] ?? (globalThis as any)[key], configurable: true, writable: true }); } catch {}
}
import fs from 'node:fs';
const { BlockNoteEditor } = await import('@blocknote/core');
const T = await import('../src/markdownTransforms.ts');
const editor = BlockNoteEditor.create() as any;

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail: string) => {
  if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + '\n  ' + detail); }
};
const tree = (bs: any[]): string => bs.map((b: any) => b.type + ':' + (Array.isArray(b.content) ? b.content.map((c: any) => c.text ?? '').join('') : '') + (b.children?.length ? '[' + tree(b.children) + ']' : '')).join(', ');
const blocksOf = (html: string) => tree(editor.tryParseHTMLToBlocks(T.normalizeWordLists(html)));

// Word가 내보내는 목록 문단 하나. marker는 기호나 번호, level은 중첩 깊이
const item = (text: string, marker = '·', level = 1, list = 'l0') =>
  `<p class=MsoListParagraph style="mso-list:${list} level${level} lfo1"><!--[if !supportLists]--><span style="mso-list:Ignore">${marker}<span style="font:7.0pt">&nbsp;&nbsp;</span></span><!--[endif]-->${text}<o:p></o:p></p>`;
const doc = (body: string) => `<html xmlns:o="urn:schemas-microsoft-com:office:office"><body>${body}</body></html>`;

ok('글머리 목록', blocksOf(doc(`<p class=MsoNormal>앞<o:p></o:p></p>${item('항목 하나')}${item('항목 둘')}<p class=MsoNormal>뒤<o:p></o:p></p>`))
  === 'paragraph:앞, bulletListItem:항목 하나, bulletListItem:항목 둘, paragraph:뒤', blocksOf(doc(`<p class=MsoNormal>앞</p>${item('항목 하나')}${item('항목 둘')}<p class=MsoNormal>뒤</p>`)));
ok('번호 목록', blocksOf(doc(`${item('하나', '1.')}${item('둘', '2.')}`)) === 'numberedListItem:하나, numberedListItem:둘', blocksOf(doc(`${item('하나', '1.')}${item('둘', '2.')}`)));
ok('중첩 목록(level)', blocksOf(doc(`${item('위')}${item('아래', 'o', 2)}${item('다시 위')}`)) === 'bulletListItem:위[bulletListItem:아래], bulletListItem:다시 위',
  blocksOf(doc(`${item('위')}${item('아래', 'o', 2)}${item('다시 위')}`)));
ok('번호 목록 안의 글머리 목록', blocksOf(doc(`${item('하나', '1.')}${item('세부', '§', 2)}${item('둘', '2.')}`)) === 'numberedListItem:하나[bulletListItem:세부], numberedListItem:둘',
  blocksOf(doc(`${item('하나', '1.')}${item('세부', '§', 2)}${item('둘', '2.')}`)));
ok('서식은 남는다', blocksOf(doc(item('<b>굵게</b> 항목'))) === 'bulletListItem:굵게 항목', blocksOf(doc(item('<b>굵게</b> 항목'))));
// 실제 Word(한국어판) 클립보드 자료(추가 검토 28). <style>의 @list 정의와 본문만 남겨 줄였다.
// 번호인지는 목록 정의(mso-level-number-format:bullet인지)로 정한다. 기호 글자(①, 가), 2.1, Wingdings l)로는 가를 수 없다
{
  const fixture = (name: string) => fs.readFileSync(new URL(`./fixtures/word-${name}.html`, import.meta.url), 'utf8');
  const listTree = (name: string) => tree(editor.tryParseHTMLToBlocks(T.normalizeWordLists(fixture(name))));
  const k = listTree('korean-numbering');
  ok('실제 Word: 원문자와 가나다는 번호 목록, Wingdings는 불릿',
    (k.match(/numberedListItem/g) ?? []).length === 4 && (k.match(/bulletListItem/g) ?? []).length === 2 && !k.includes('①') && !k.includes('가)'), k);
  const o = listTree('outline-nested');
  ok('실제 Word: 개요 번호 1, 2, 2.1, 3은 번호 목록 안에 번호 한 단계 중첩',
    /numberedListItem:[^,[]*\[numberedListItem:/.test(o) && !o.includes('bulletListItem'), o);
  const b = listTree('bullets-flat');
  ok('실제 Word: 불릿은 전처럼 불릿', (b.match(/bulletListItem/g) ?? []).length === 4 && !b.includes('numberedListItem'), b);
}
// 추가 검토 29: 하위 수준은 목록 ID가 달라도 같은 목록에 중첩한다(수준 1에서 ID가 바뀔 때만 끊는다)
ok('목록 ID가 다른 하위 수준도 중첩', blocksOf(doc(`${item('one', '1.', 1, 'l1')}${item('sub', 'o', 2, 'l0')}${item('two', '2.', 1, 'l1')}`))
  === 'numberedListItem:one[bulletListItem:sub], numberedListItem:two', blocksOf(doc(`${item('one', '1.', 1, 'l1')}${item('sub', 'o', 2, 'l0')}${item('two', '2.', 1, 'l1')}`)));
ok('수준 1에서 목록 ID가 바뀌면 따로 묶는다', blocksOf(doc(`${item('a', '1.', 1, 'l0')}${item('b', '·', 1, 'l1')}`))
  === 'numberedListItem:a, bulletListItem:b', blocksOf(doc(`${item('a', '1.', 1, 'l0')}${item('b', '·', 1, 'l1')}`)));
{
  const plain = '<p>웹 <b>페이지</b></p><ul><li>보통 목록</li></ul>';
  ok('mso-list가 없는 HTML은 그대로', T.normalizeWordLists(plain) === plain, T.normalizeWordLists(plain));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
