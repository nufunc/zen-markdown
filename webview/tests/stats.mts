// 머리 막대의 단어 수와 글자 수가 마크다운 기호를 세지 않는지 본다(추가 검토 31).
// 실행: npx tsx tests/stats.mts   (npm test에 들어 있다)
const { docStats } = await import('../src/docStats.ts');

let pass = 0, fail = 0;
const same = (name: string, md: string, words: number, chars: number) => {
  const s = docStats(md);
  if (s.words === words && s.chars === chars) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log(`FAIL ${name}\n  ${JSON.stringify(s)}`); }
};

same('헤딩 표식은 세지 않는다', '# Title\n\nbody text', 3, 15);
same('목록, 인용, 굵게', '- a **b**\n> c', 3, 5);
same('링크는 글자만', 'see [the docs](https://x.y/a.md)', 3, 12);
same('표의 칸 글자만', '| A | B |\n| --- | --- |\n| 1 | 2 |', 4, 7);
same('코드 펜스 줄은 세지 않는다', '```js\nconst x = 1;\n```', 4, 12);
same('프론트매터는 세지 않는다', '---\ntitle: t\n---\nhello', 1, 5);
same('빈 문서', '', 0, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
