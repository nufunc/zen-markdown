// 머리 막대의 단어 수와 글자 수(추가 검토 31). 마크다운 기호(#, -, >, **, `, |, 링크 주소)는 세지 않는다
export function docStats(md: string): { words: number; chars: number } {
  const text = md.replace(/\r\n?/g, '\n')
    .replace(/^---\n[\s\S]*?\n---(?:\n|$)/, '')                 // 프론트매터
    .replace(/^[ \t]*(?:`{3,}|~{3,}).*$/gm, '')                  // 코드 펜스 줄
    .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm, '') // 표 구분 행, 구분선
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')               // 링크와 이미지는 글자만
    .replace(/^[ \t]*(?:>[ \t]?)*(?:#{1,6}[ \t]+|[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d+[.)][ \t]+)?/gm, '') // 줄 머리 표식
    .replace(/\*\*|__|~~|[*`|\\]/g, ' ');
  const words = text.split(/\s+/).filter(Boolean);
  return { words: words.length, chars: [...text.replace(/\s+/g, ' ').trim()].length };
}
