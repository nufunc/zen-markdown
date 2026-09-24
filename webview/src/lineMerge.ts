// 원문 조각 보존(추가 검토 1의 2단계)을 위한 줄 단위 3방향 병합.
//
// 원문 O, O를 편집 없이 직렬화한 기준 C, 지금 직렬화한 결과 N을 받는다.
// C→N으로 바뀐 줄은 사용자 편집이고, C→O로 바뀐 줄은 BlockNote가 원문과 다르게 쓴 서식 차이다.
// 사용자 편집만 O에 적용해 돌려준다. 두 변경이 같은 줄에 겹치면 그 구간은 N을 쓴다.
import { diff } from '@codemirror/merge';

export interface MergeResult {
  text: string;
  /** 서식 차이와 편집이 겹쳐 N을 쓴 구간 수 */
  conflicts: number;
}

interface Hunk {
  side: 'O' | 'N';
  fromC: number;
  toC: number;
  /** 이 변경이 줄 수를 얼마나 바꾸는가 */
  delta: number;
}

/** 서로게이트 범위를 피한 BMP 문자로 줄마다 한 글자를 배정한다. 서로 다른 줄이 너무 많으면 null */
const makeEncoder = () => {
  const codes = new Map<string, string>();
  let next = 0x100;
  return (lines: string[]): string | null => {
    let out = '';
    for (const line of lines) {
      let ch = codes.get(line);
      if (ch === undefined) {
        if (next === 0xd800) next = 0xe000;
        if (next > 0xffff) return null;
        ch = String.fromCharCode(next++);
        codes.set(line, ch);
      }
      out += ch;
    }
    return out;
  };
};

const hunks = (side: 'O' | 'N', c: string, other: string): Hunk[] =>
  diff(c, other).map(ch => ({ side, fromC: ch.fromA, toC: ch.toA, delta: (ch.toB - ch.fromB) - (ch.toA - ch.fromA) }));

/** 병합할 수 없으면(서로 다른 줄이 6만 개를 넘는 등) null. 호출한 쪽은 N을 쓴다. */
export function mergeLines(original: string, base: string, edited: string): MergeResult | null {
  if (base === edited) return { text: original, conflicts: 0 };
  const O = original.split('\n'), C = base.split('\n'), N = edited.split('\n');
  const encode = makeEncoder();
  const eC = encode(C), eO = encode(O), eN = encode(N);
  if (eC === null || eO === null || eN === null) return null;

  const all = [...hunks('O', eC, eO), ...hunks('N', eC, eN)].sort((a, b) => a.fromC - b.fromC || a.toC - b.toC);
  // C의 같은 줄을 공유하거나 같은 자리에 둘 다 삽입한 변경을 한 구간으로 묶는다.
  // 맞닿기만 한 변경은 공유하는 줄이 없으므로 C에서의 위치 순서대로 각각 적용한다(삽입은 그 자리 줄 앞에 들어간다).
  const clusters: Hunk[][] = [];
  for (const h of all) {
    const last = clusters[clusters.length - 1];
    const end = last ? Math.max(...last.map(x => x.toC)) : -1;
    const sameInsertPoint = last?.some(x => x.fromC === x.toC && x.fromC === h.fromC) && h.fromC === h.toC;
    if (last && (h.fromC < end || sameInsertPoint)) last.push(h);
    else clusters.push([h]);
  }

  const out: string[] = [];
  let posC = 0, posO = 0, posN = 0, conflicts = 0;
  for (const cluster of clusters) {
    const start = cluster[0].fromC;
    const end = Math.max(...cluster.map(h => h.toC));
    // 변경이 없는 구간은 세 텍스트가 같다
    out.push(...C.slice(posC, start));
    posO += start - posC;
    posN += start - posC;
    const oLen = end - start + cluster.filter(h => h.side === 'O').reduce((s, h) => s + h.delta, 0);
    const nLen = end - start + cluster.filter(h => h.side === 'N').reduce((s, h) => s + h.delta, 0);
    const edited = cluster.some(h => h.side === 'N');
    if (edited && cluster.some(h => h.side === 'O')) conflicts++;
    out.push(...(edited ? N.slice(posN, posN + nLen) : O.slice(posO, posO + oLen)));
    posO += oLen;
    posN += nLen;
    posC = end;
  }
  out.push(...C.slice(posC));
  return { text: out.join('\n'), conflicts };
}
