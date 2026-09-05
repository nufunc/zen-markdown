// 마크다운 <-> 에디터 왕복 변환 체인. 두 함수는 정확히 역순 대칭이어야 한다.
//
// 이 파일이 존재하는 이유: 두 체인이 App.tsx 안에서 700줄 떨어져 있던 탓에
// 파싱 전처리 함수가 저장 경로에도 재적용되고 있었다. 그 결과 ```mermaid 펜스가
// ```text로, 일반 링크 [X](X.md)가 [[X]]로 조용히 바뀌었다.
// 한 파일에 나란히 두어 대칭이 깨지면 눈에 보이게 한다.
import {
  preserveMarkdownLineBreaks,
  preserveBlankLines,
  restoreBlankLines,
  protectHtml,
  restoreHtml,
  parseWikilinks,
  serializeWikilinks,
  toWebviewImageUrls,
  fromWebviewImageUrls,
} from './markdownTransforms';

export interface PipelineContext {
  /** 문서 폴더의 webview URI — 상대경로 이미지 미리보기용 */
  docBaseUri: string;
  /** parseWikilinks가 실제로 변환한 문서명. 저장 시 그것만 되돌린다. */
  wikilinkNames: Set<string>;
}

/** 디스크의 마크다운 -> 에디터가 파싱할 마크다운 */
export function toEditorMarkdown(markdown: string, ctx: PipelineContext): string {
  const normalized = markdown.replace(/\r\n/g, '\n');
  return parseWikilinks(
    preserveMarkdownLineBreaks(
      preserveBlankLines(
        protectHtml(
          toWebviewImageUrls(normalized, ctx.docBaseUri)
        )
      )
    ),
    ctx.wikilinkNames
  );
}

/** 에디터가 내놓은 마크다운 -> 디스크에 쓸 마크다운 (위 체인의 역순) */
export function fromEditorMarkdown(markdown: string, ctx: PipelineContext): string {
  return serializeWikilinks(
    restoreHtml(
      restoreBlankLines(
        fromWebviewImageUrls(markdown, ctx.docBaseUri)
      )
    ),
    ctx.wikilinkNames
  );
}
