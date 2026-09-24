// 줄 단위 3방향 병합(src/lineMerge.ts) 단위 테스트.
// 실행: npx tsx tests/line-merge.mts   (npm test에 들어 있다)
import { mergeLines } from '../src/lineMerge.ts';

let pass = 0, fail = 0;
const check = (name: string, O: string, C: string, N: string, want: string, wantConflicts = 0) => {
  const r = mergeLines(O, C, N);
  if (r && r.text === want && r.conflicts === wantConflicts) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + '\n  want: ' + JSON.stringify([want, wantConflicts]) + '\n  got : ' + JSON.stringify(r && [r.text, r.conflicts])); }
};

// O는 원문, C는 편집 없이 직렬화한 기준, N은 편집 뒤 직렬화 결과다.
// 서식 차이: 원문의 '- a'를 BlockNote가 '* a'로, '---'를 '***'로 쓴다.
const O = '# T\n\n- a\n- b\n\npara one\n\n---\n\npara two\n';
const C = '# T\n\n* a\n* b\n\npara one\n\n***\n\npara two\n';

check('편집 없음은 원문 그대로', O, C, C, O);
check('한 줄 편집은 그 줄만 바뀐다', O, C,
  C.replace('para one', 'para one EDIT'),
  O.replace('para one', 'para one EDIT'));
check('줄 삽입', O, C,
  C.replace('para one\n', 'para one\n\nnew para\n'),
  O.replace('para one\n', 'para one\n\nnew para\n'));
check('줄 삭제', O, C,
  C.replace('\npara one\n', ''),
  O.replace('\npara one\n', ''));
check('서식 차이가 있는 줄을 고치면 그 구간은 편집 결과를 쓴다', O, C,
  C.replace('* b', '* b EDIT'),
  O.replace('- a\n- b', '* a\n* b EDIT'), 1);
check('문서 앞 편집', O, C, 'Intro\n\n' + C, 'Intro\n\n' + O);
check('문서 끝 편집', O, C, C + '\nend\n', O + '\nend\n');
check('빈 문서에 입력', '', '', 'hello\n', 'hello\n');
check('전부 지움은 서식 차이 줄과 겹친다', O, C, '', '', 1);
check('서식 차이 줄 가까이 넣은 줄은 그 서식 차이를 지우지 않는다', O, C,
  C.replace('para one\n\n***', 'para one\nmore\n\n***'),
  O.replace('para one\n\n---', 'para one\nmore\n\n---'));
check('서식 차이 줄 바로 뒤 줄을 고쳐도 서식 차이는 남는다', 'a\n- x\nb\n', 'a\n* x\nb\n', 'a\n* x\nb EDIT\n', 'a\n- x\nb EDIT\n');
check('같은 자리에 양쪽이 삽입하면 편집 결과를 쓴다', 'a\nFMT\nb\n', 'a\nb\n', 'a\nNEW\nb\n', 'a\nNEW\nb\n', 1);
check('떨어진 두 편집은 각각 적용된다', O, C,
  C.replace('# T', '# Title').replace('para two', 'para 2'),
  O.replace('# T', '# Title').replace('para two', 'para 2'));
check('같은 줄이 여러 번 나와도 위치가 맞는다', 'x\n- a\nx\n- a\nx\n', 'x\n* a\nx\n* a\nx\n', 'x\n* a\nx\n* a\nx EDIT\n', 'x\n- a\nx\n- a\nx EDIT\n');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
