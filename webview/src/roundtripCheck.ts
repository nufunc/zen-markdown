// 왕복 자가검증. 문서를 연 직후 사용자 편집이 0인 상태에서 파싱 결과를 다시
// 직렬화해 원문과 비교한다. 이 시점의 차이는 전부 왕복 변환 손실이므로 오탐이 없다.
//
// v0.6.0에서 고친 결함(```mermaid -> ```text, [X](X.md) -> [[X]])이 정확히 이 부류였다.
// 같은 부류가 다시 생기면 사용자가 알아채기 전에 로그에 남는다.
//
// 문서 내용은 기록하지 않는다. 남기는 것은 달라진 줄의 개수와 '종류'뿐이다.

/** 달라진 줄이 어떤 부류인지. 이름만으로 원문을 되돌릴 수 없어야 한다. */
export type DriftKind =
  | 'fence_lang'      // 코드펜스 언어 태그가 바뀜
  | 'link_form'       // 링크 표기가 바뀜 ([x](y) <-> [[x]])
  | 'blank_line'      // 빈 줄 개수가 바뀜
  | 'trailing_space'  // 줄 끝 공백만 다름
  | 'list_marker'     // 목록 기호나 번호가 바뀜
  | 'heading'         // 헤딩 표기가 바뀜
  | 'html'            // HTML 태그나 주석이 바뀜
  | 'other';

export interface DriftReport {
  /** 원문에만 있는 줄 수 */
  removed: number;
  /** 결과에만 있는 줄 수 */
  added: number;
  /** 종류별 건수 */
  kinds: Partial<Record<DriftKind, number>>;
}

const FENCE_RE = /^\s*(?:`{3,}|~{3,})\s*\S/;
const LINK_RE = /\[\[[^\]]+\]\]|\[[^\]]*\]\([^)]*\)/;
const LIST_RE = /^\s*(?:[-*+]\s|\d+[.)]\s)/;
const HEADING_RE = /^\s*#{1,6}(?:\s|$)/;
const HTML_RE = /<!--|<\/?[a-zA-Z]/;

function classify(line: string): DriftKind {
  if (line.trim() === '' ) return 'blank_line';
  if (FENCE_RE.test(line)) return 'fence_lang';
  if (HEADING_RE.test(line)) return 'heading';
  if (LIST_RE.test(line)) return 'list_marker';
  if (HTML_RE.test(line)) return 'html';
  if (LINK_RE.test(line)) return 'link_form';
  if (line !== line.replace(/[ \t]+$/, '')) return 'trailing_space';
  return 'other';
}

/**
 * 원문과 왕복 결과를 줄 단위로 비교한다.
 * 정렬 없이 다중집합으로 견주므로 순서가 같은 대부분의 경우에 충분하고 비용이 낮다.
 * 완전히 같으면 null을 돌려준다.
 */
export function compareRoundtrip(original: string, result: string): DriftReport | null {
  const norm = (s: string) => s.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  const a = norm(original).split('\n');
  const b = norm(result).split('\n');

  const counts = new Map<string, number>();
  for (const line of a) counts.set(line, (counts.get(line) ?? 0) + 1);
  for (const line of b) counts.set(line, (counts.get(line) ?? 0) - 1);

  const kinds: Partial<Record<DriftKind, number>> = {};
  let removed = 0;
  let added = 0;
  for (const [line, n] of counts) {
    if (n === 0) continue;
    const kind = classify(line);
    kinds[kind] = (kinds[kind] ?? 0) + Math.abs(n);
    if (n > 0) removed += n;
    else added += -n;
  }

  if (removed === 0 && added === 0) return null;
  return { removed, added, kinds };
}
