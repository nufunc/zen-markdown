# 테스트 자료 출처

`gfm-extensions.json`은 GitHub Flavored Markdown Spec 0.29(2019-04-06)의 확장 예제 21개(표 8, 취소선 2, 자동 링크 11)를 뽑은 것이다.

- 출처: https://github.com/github/cmark-gfm 의 `test/spec.txt`
- 라이선스: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). 저작자는 John MacFarlane과 GitHub이다.
- 바꾼 것: 예제의 마크다운 입력만 남겼고, 명세 표기의 `→`를 탭 문자로 바꿨다.

이 파일은 같은 라이선스(CC BY-SA 4.0)로 배포된다.
CommonMark 예제는 저장소에 넣지 않고 devDependency `commonmark-spec`에서 읽는다.
