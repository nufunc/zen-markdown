# 개선 계획

2026-09-23 기준으로 v0.7.1을 분석하고 세운 계획이다. 항목마다 문제와 근거, 설계, 완료 기준을 적는다.
구현은 이 문서를 승인받은 뒤 P0부터 차례로 한다.

## 출발점

아래 수치는 모두 2026-09-23에 직접 돌려서 얻었다.

| 항목 | 값 |
|---|---|
| 타입 검사 `tsc -b` | 에러 0건 |
| 단위 테스트 `npm test` | 22건 통과 |
| E2E `playwright test` | 27건 통과, 31초 |
| oxlint | 경고 2건 (`App.tsx:648`, `App.tsx:1089`) |
| 웹뷰 소스 | 6,152줄, 이 가운데 `App.tsx`가 2,446줄 |
| 확장 호스트 소스 | 919줄, 테스트 0건 |
| `webview/dist` | 파일 152개, 9.7MB, 엔트리 `index-*.js` 1.9MB |

이 PC에는 확장이 설치돼 있지 않아 진단 로그가 없다. 현장 빈도는 알 수 없고, 판단 근거는 코드와 재현 테스트다.

설정 저장 응답과 타자기 스크롤 수정은 이 계획보다 먼저 `605af4c`로 커밋했다.

## P0. 외부 변경이 로컬 편집을 지운다

### 문제

에디터에 입력한 내용이 아직 호스트로 전송되지 않았을 때 외부 변경이 도착하면, 외부 변경을 채택하면서 로컬 입력을 버린다.
사용자에게는 "The editor reloaded it." 알림 한 줄만 나간다. `useDocumentSync.ts`의 `consumeExternal` 주석이 이 한계를 이미 적고 있다.

이 확장은 `*.llm.md`를 연다. AI 에이전트가 파일을 고치는 동안 사람이 같은 문서를 열어 두고 편집하는 흐름에서
이 충돌이 가장 자주 난다.

### 재현

2026-09-23에 Playwright로 재현했다. 절차는 이렇다.

1. `# Title\n\nbody`를 연다.
2. 첫 문단 끝에 ` LOCAL`을 입력한다.
3. 100ms 뒤 `external_update`로 `...\n\nEXTERNAL`을 보낸다. 에디터에 포커스가 있으므로 보류된다.
4. 헤더의 Raw 버튼을 누른다.

결과: 호스트로 나간 마지막 `change`에 `EXTERNAL`은 있고 `LOCAL`은 없다. 버튼을 누를 때 난 `focusout`이 보류분을 채택했고,
그 시점에 ` LOCAL`은 디바운스(300~600ms) 안에 있어 전송되지 않은 상태였다.
Raw 버튼 대신 에디터 밖 아무 곳이나 눌러도 같은 경로를 탄다.

### 설계

채택하는 시점에 전송하지 않은 로컬 편집이 있는지를 먼저 본다.

- **없으면** 지금처럼 조용히 채택한다. 동작이 바뀌지 않는다.
- **있으면** 채택을 멈추고 에디터 위에 충돌 막대를 띄운다. 보기는 셋이다.
  - **외부 변경 채택**: 로컬 입력을 버리고 외부 내용으로 다시 그린다. 지금의 동작이다.
  - **내 편집 유지**: 로컬 전체 텍스트를 호스트로 보낸다. 외부 변경은 되살리지 않는다.
    에디터 안의 `Ctrl+Z`는 ProseMirror 실행 취소를 먼저 하므로 외부 변경을 되돌리지 못한다.
  - **차이 보기**: 외부 내용과 로컬 내용을 둘 다 읽기 전용으로 나란히 띄운다. 지금의 merge view는 Raw 모드 안에서
    git HEAD와 편집 가능한 현재 문서를 비교하므로 그대로 쓰지 않고 별도 오버레이로 둔다. P0 다음 커밋에 넣는다.

막대가 떠 있는 동안에는 보류 상태를 유지하므로 `canSend()`가 전송을 막는다. 규칙 1이 그대로 지켜진다.
`focusout`과 1.5초 타이머에 의한 자동 채택은 전송하지 않은 로컬 편집이 없을 때만 일어난다.

"전송하지 않은 로컬 편집"은 훅의 플래그 하나로 판정한다(`hasUnsentEdits()`). `postChange`나 `debouncedSerialize`를
부를 때 켜고, 실제로 `change`를 보냈거나 외부 변경을 채택했을 때만 끈다. 디바운스 대기 여부로는 판정할 수 없다.
보류 중에는 디바운스가 만료돼도 `canSend()`에 막혀 전송 없이 끝나므로, 대기 여부로 보면 편집이 없는 것처럼 보인다.

설계를 코드와 대조하면서 함께 막아야 할 경로 셋을 더 찾았다.

- **모드 전환**: `toggleMode`가 `canSend()`를 거치지 않고 `change`를 보냈다. 로컬 편집이 있으면 `focusout`이 더는
  채택하지 않으므로, 이대로 두면 Raw 버튼이 외부 변경을 조용히 덮어쓴다. 보류 중에는 전환하지 않고 전송은 `sendNow`를 거친다.
- **Raw 모드**: 보류 중 CodeMirror 입력도 1.5초 뒤에 버려졌다. Raw 모드에는 BlockNote 에디터가 없어 `buildDocumentText()`가
  null을 돌려주므로, "내 편집 유지"는 원문 텍스트(`documentText`)를 보낸다.
- **포커스 밖 외부 변경**: 에디터에 포커스가 없고 2초 넘게 입력이 없으면 `external_update`를 보류하지 않고 바로 채택했다.
  전송하지 않은 편집이 있거나 이미 보류 중이면 포커스와 무관하게 보류한다.

줄 단위 3방향 자동 병합은 이번에 넣지 않는다. 병합 결과가 틀리면 사용자가 알아채기 어렵기 때문이다.
충돌 막대를 실제로 써 보고 같은 문단을 건드리지 않는 충돌이 대부분이면 그때 다시 검토한다.

### 완료 기준

위 재현 절차를 `e2e/external-conflict.spec.ts`에 영구 테스트로 둔다.

| 경우 | 기대 |
|---|---|
| 로컬 편집 없이 외부 변경 | 막대 없이 채택되고 기존 E2E `external_update`가 통과한다 |
| 로컬 편집 후 Raw 버튼 | 막대가 뜨고 모드가 바뀌지 않으며 에디터에 `LOCAL`이 남는다 |
| 로컬 편집 후 1.5초 대기 | 막대가 뜨고 에디터에 `LOCAL`이 남는다 |
| 충돌 후 "내 편집 유지" | 마지막 `change`에 `LOCAL`이 있다 |
| 충돌 후 "외부 변경 채택" | 에디터에 `EXTERNAL`이 있고 `LOCAL`이 없으며, `LOCAL`이 담긴 `change`가 나가지 않는다 |
| 막대가 떠 있는 동안 입력 | `change`가 나가지 않는다 |
| Raw 모드에서 충돌 후 "내 편집 유지" | 마지막 `change`에 `LOCAL`이 있다 |

"외부 변경 채택"의 기대를 원안에서 바꿨다. 호스트가 이미 외부 내용을 갖고 있으므로 채택할 때는 `change`를 보내지 않는다.

진단에 `external_conflict` 이벤트를 더하고 고른 보기를 `choice` 필드로 남긴다. `docs/MONITORING.md`의 이벤트 표와
`PROBLEM_EVENTS`를 함께 고친다.

## P1. 구조와 검증

### P1-1. 전송 경로를 하나로 모은다

`App.tsx`에서 `change`를 직접 보내던 두 자리(모드 전환, blur 자동 포맷)는 P0에서 `sendNow(text)`로 옮겼다.
모드 전환은 P0 충돌 막대 없이는 외부 변경을 덮어쓰고, blur 자동 포맷은 편집 플래그를 끄지 않아 거짓 충돌을 띄우기 때문이다.
`grep "type: 'change'" webview/src/App.tsx`는 이미 0건이다.

남은 것은 `saveToHost`다. 프론트매터 편집이 `postChange`를 부르기 전에 `lastSentTextRef`를 먼저 바꿔서,
보류 중에 전송이 막히면 보내지 않은 텍스트가 "마지막으로 보낸 텍스트"로 남는다. 이 대입을 지우고 훅의 전송 경로에 맡긴다.

**완료 기준**: `App.tsx`에서 `lastSentTextRef.current =` 대입이 0건이다. 기존 E2E와 P0 테스트가 통과한다.

### P1-2. App.tsx를 나눈다

동기화(`useDocumentSync`)와 검색(`useSearchReplace`)은 이미 떼어냈다. 다음 순서로 이어간다.
앞의 것일수록 다른 코드와 얽힌 곳이 적다.

1. 이미지 붙여넣기와 업로드 대기열 → `useImagePaste.ts`
2. 설정 모달 → `SettingsPanel.tsx`
3. 헤더 툴바와 모드 전환 버튼 → `EditorHeader.tsx`
4. 모드 전환 시 스크롤 위치 보존 → `useModeScrollSync.ts`

한 단계가 한 커밋이고 동작을 바꾸지 않는다. oxlint 경고 2건은 해당 코드를 옮길 때 의존성 배열을 바로잡아 없앤다.

**완료 기준**: 단계마다 `npm run build`, `npm run lint`, `npm test`, E2E가 모두 통과한다. 마지막에 `App.tsx`가 1,500줄 아래이고 oxlint 경고가 0건이다.

### P1-3. 확장 호스트에 테스트를 붙인다

호스트 쪽에서 틀리면 파일이 망가지거나 워크스페이스 밖이 열리는 로직이 셋이다. 셋을 순수 함수로 떼어 `src/hostLogic.ts`에 두고
`node:test`로 검사한다. 새 의존성은 더하지 않는다.

| 함수 | 원래 자리 | 검사할 경우 |
|---|---|---|
| `minimalEdit(old, new)` | `updateTextDocument` | 앞만 다름, 뒤만 다름, 전부 같음, 빈 문자열, 서로게이트 쌍 경계 |
| `findEcho(pending, current)` | `onDidChangeTextDocument` | CRLF 차이, 중간 항목 일치 시 소비 범위 |
| `resolveLinkTarget(docDir, roots, href)` | `openLink` | `../` 탈출, `%2e%2e` 인코딩, 다른 드라이브 절대 경로, `#` 앵커 |

**완료 기준**: 루트 `package.json`에 `test` 스크립트가 생기고 위 경우가 모두 통과한다.

### P1-4. CI를 둔다

`.github/workflows/ci.yml` 하나를 둔다. 두 패키지의 `npm ci`, `npm run compile`, 웹뷰 `build`와 `lint`와 `test`, E2E를 돌린다.
이 파일은 원격에 푸시해야 동작하므로 푸시는 따로 승인받는다.

### P1-5. 엔트리 번들 구성을 잰다

처음 분석에서는 shiki 문법 파일을 줄이자고 적었으나 다시 보니 틀렸다. `shikiHighlighter.ts`가 이미 언어별 동적 import를 쓰고 있어
`cpp`(836KB)는 그 언어가 나올 때만 읽힌다.

실제로 매번 읽히는 것은 엔트리 1.9MB다. 무엇이 차지하는지 먼저 잰다. 후보는 `@uiw/codemirror-themes-all` 전체 import와
Raw 모드에서만 쓰는 CodeMirror 언어 패키지들이다. 잰 결과를 보고 줄일지 정한다.

**완료 기준**: 구성 측정 결과를 이 문서에 표로 남긴다. 줄이는 작업은 그 결과를 보고 따로 정한다.

## P2. 문서와 정리

한 커밋으로 묶는다.

| 대상 | 고칠 것 |
|---|---|
| `README.md` 24행 | "without holding the editor in memory"는 `retainContextWhenHidden: true`와 어긋난다. 문장을 사실대로 고친다 |
| `README.md` 테마 | 기능 목록이 테마를 4개로 적었다. 실제는 9개와 `auto`다 |
| `README.md` 설정 표 | `typewriterMode`, `diagnostics`, `defaultCodeLanguage`가 빠졌다 |
| `webview/src/vscode.ts` 주석 | "retainContextWhenHidden 없이"라는 주석이 현재 설정과 어긋난다 |
| 오류 오버레이 | `getHtmlForWebview`가 에러 메시지를 `innerHTML`에 넣는다. `textContent`로 바꾼다 |
| PDF 내보내기 | 파일명을 `<title>`에 이스케이프 없이 넣는다. HTML 이스케이프를 거친다 |

`MEMORY.md`와 `.agents/AGENTS.md`는 git이 추적하지 않는 로컬 파일이라 이 커밋에 들어가지 않는다. 따로 고친다.

- `MEMORY.md`: 이름이 예전 이름(Neat MD Editor)이고, `inlineDynamicImports: true` 서술이 현재 `vite.config.ts`와 다르다.
- `.agents/AGENTS.md`: 버전을 올리면 태그 푸시와 릴리스를 강제한다. 푸시는 요청받을 때만 한다는 전역 규약과 충돌한다.

저장소 루트에 vsix 20개(약 53MB)가 쌓여 있다. git이 추적하지 않으므로 이력에는 영향이 없다. 지울지는 사용자가 정한다.

## 추가 검토 1. 한 번만 편집해도 문서 전체가 다시 쓰인다

2026-09-23 정기 검토에서 더했다.

### 문제

웹뷰는 편집할 때마다 문서 전체를 BlockNote로 직렬화해서 보낸다. 호스트의 `updateTextDocument`는 앞뒤 공통 부분만 뺀 범위를 치환한다.
그래서 왕복 변환에서 원문과 달라지는 줄이 문서 앞쪽과 뒤쪽에 하나씩만 있어도 그 사이 전체가 다시 쓰인다.
한 글자를 고쳐도 git diff에 문서 대부분이 잡힌다.

달라지는 줄 가운데 일부는 표기만 바뀌지만, 일부는 문서의 뜻을 바꾼다.

### 근거

**실제 문서 모음 측정**: `D:\git` 아래 md 파일 5,350개 가운데 200KB 미만인 400개를 무작위로 뽑았다.
저장 경로(`generateMarkdownFromEditor`)와 같은 변환 체인으로 한 번 왕복시킨 뒤 `compareRoundtrip`으로 원문과 견줬다.

| 결과 | 파일 수 |
|---|---|
| 원문과 같음 | 70 |
| 달라짐 | 330 (82.5%) |
| 변환 실패 | 0 |

측정 스크립트는 BlockNote 기본 스키마를 쓴다. 앱은 mermaid와 callout 블록을 더한 스키마를 쓰므로 그 두 블록이 든 문서에서는 결과가 다를 수 있다.

**유형별 최소 재현**: 아래는 합성한 입력으로 한 번 왕복시킨 결과다. 세 번 연속 왕복시켜 같은 결과로 수렴하는지도 확인했다.

| 입력 | 결과 | 뜻이 바뀌는가 | 수렴 |
|---|---|---|---|
| `see [init.md](init.md) now` | `see init.md now` | 링크가 사라진다 | 수렴 |
| `see [https://x.io](https://x.io)` | `see https://x.io` | 링크가 자동 링크 여부에 맡겨진다 | 수렴 |
| `> A\n>\n> B` | `> A\\\n> B` | 인용 안의 두 문단이 한 문단으로 합쳐진다 | **발산**: 왕복할 때마다 `> ` 뒤 공백이 늘어난다 |
| `<div>\n  <img src="x.png"/>\n</div>` | 줄마다 끝에 `\`가 붙는다 | HTML 블록 안에 `\` 문자가 그대로 보인다 | 수렴 |
| `line one\nline two` | `line one\\\n line two` | 부드러운 줄바꿈이 강제 줄바꿈이 되고 다음 줄 앞에 공백이 생긴다 | 수렴 |
| `- **x**: y` | `* **x**: y` | 표기만 바뀐다 | 수렴 |
| `- a\n  - b` | `- a\n  * b` | 표기만 바뀐다 | 수렴 |
| `---` | `***` | 표기만 바뀐다 | 수렴 |
| 표 | 열 너비를 공백으로 채운다 | 표기만 바뀐다 | 수렴 |
| 언어 없는 펜스 | `` ```text ``가 붙는다 | 표기만 바뀐다 | 수렴 |
| `__b__` | `**b**` | 표기만 바뀐다 | 수렴 |

부드러운 줄바꿈을 강제 줄바꿈으로 바꾸는 것은 `preserveMarkdownLineBreaks`가 의도한 동작이다. WYSIWYG에서 원문의 줄 구분을 그대로 보이려는 것이다.
결함은 두 가지다. 다음 줄 앞에 공백이 생기는 것, 그리고 편집하지 않은 문단까지 디스크에서 바뀌는 것이다.

### 설계

두 단계로 나눈다.

**1단계: 뜻이 바뀌는 손실 넷을 개별로 고친다.** 위 표에서 뜻이 바뀌는 행이 대상이다.
하나를 고칠 때마다 `test-roundtrip.mts`에 그 입력을 넣는다.

- 텍스트와 주소가 같은 링크: 파싱 전에 보호하고 직렬화 뒤에 되살린다. `protectHtml`과 같은 방식이다.
- 인용 안의 빈 줄: 원인이 `preserveMarkdownLineBreaks`의 `isStructural`인지 BlockNote 파서인지 먼저 가른다. 발산하는 유일한 항목이라 가장 먼저 한다.
- HTML 블록의 `\`: `restoreHtml`은 주석 안의 `\`만 걷어낸다. HTML 블록 안까지 넓힌다.
- 강제 줄바꿈 뒤의 앞 공백: 직렬화 결과에서 `\\\n ` 뒤의 공백 하나를 걷어낸다. 원문에 있던 들여쓰기와 구별되는지를 테스트로 확인한다.

**2단계: 편집하지 않은 블록은 원문 조각을 그대로 쓴다.** 표기만 바뀌는 행까지 없애는 근본 해법이다.
문서를 열 때 최상위 블록마다 원문 조각을 기억해 두고, 저장할 때 내용이 그대로인 블록은 원문 조각을 내보낸다.
변경 범위가 크므로 1단계를 마친 뒤 설계를 따로 검토한다. 이번 항목의 완료 기준에는 넣지 않는다.

### 완료 기준

- 위 표에서 뜻이 바뀌는 다섯 행이 모두 원문과 같게 나오거나, 뜻을 보존하는 표기로 나온다. 다섯 행 모두 `npm test`에 들어간다.
- 인용 입력은 세 번 연속 왕복해도 결과가 같다.
- 같은 400개 표본으로 다시 재서 전후 수치를 이 문서에 남긴다. 기준선은 330/400이다.

### 1단계 결과

2026-09-23에 code 세션이 고쳤다. 원인을 가르는 과정에서 설계의 가정 둘이 틀린 것을 확인했다.

- **강제 줄바꿈 뒤 공백과 인용 발산은 원인이 하나다.** `preserveMarkdownLineBreaks`가 아니라 BlockNote 파서가
  줄바꿈(`<br>`) 뒤에 공백 하나를 텍스트에 끼워 넣는다. `a  \nb`를 파싱하면 모델 텍스트가 `"a\n b"`가 된다.
  인용 안에서는 이 공백이 왕복마다 쌓여 발산했다. `processBlocksFromMarkdown`에서 코드 블록과 인라인 코드를 뺀 텍스트의
  `\n `을 `\n`으로 걷어낸다. 연속 줄의 앞 공백은 마크다운에서 뜻이 없으므로 잃는 정보가 없다.
  설계에 적은 "직렬화 결과에서 걷어내기"와 달리 모델에서 걷어내므로 WYSIWYG 화면의 둘째 줄 앞 공백도 함께 사라진다.
- **HTML 블록의 `\`는 `restoreHtml`의 주석 처리를 넓혀서는 없어지지 않는다.** `protectHtml`이 태그를 글자로 바꾼 뒤
  줄 보존이 줄마다 하드브레이크를 붙인 것이다. `restoreHtml`에서 보호한 태그만 있는 줄 끝의 `\`만 걷어낸다.
  `a <b>x</b>  \nc`처럼 글자로 시작하는 줄의 강제 줄바꿈은 그대로 둔다.
- **텍스트와 주소가 같은 링크**는 파싱 전에 보호하지 않는다. 직렬화하는 동안만 링크 텍스트 끝에 폭 없는 공백을 붙여
  `[..](..)` 형태를 강제하고, `fromEditorMarkdown`의 `restoreLinkText`가 그 공백을 지운다. 에디터 안에서는 계속 링크로 보인다.
  맨 URL과 `<https://..>`는 BlockNote가 링크로 파싱하지 않으므로 이 처리에 걸리지 않는다.

| 입력 | 수정 전 | 수정 후 |
|---|---|---|
| `see [init.md](init.md) now` | `see init.md now` | 원문과 같다 |
| `see [https://x.io](https://x.io)` | `see https://x.io` | 원문과 같다 |
| `> A\n>\n> B` | 왕복마다 공백이 는다 | `> A\\\n> B`로 수렴한다 |
| `<div>\n  <img src="x.png"/>\n</div>` | 줄마다 `\`가 붙는다 | `\`가 없다. 들여쓰기 두 칸은 빠진다 |
| `a  \nb` | `a\\\n b` | `a\\\nb` |

남은 것 둘:

- 인용 안의 두 문단이 줄바꿈 하나로 합쳐지는 것. BlockNote 인용 블록은 인라인 내용 하나만 담으므로 파싱 단계에서 이미 합쳐진다.
  발산은 멈췄지만 뜻의 차이는 남는다. 2단계(원문 조각 보존)에서 다룬다.
- HTML 블록의 들여쓰기가 빠지는 것. HTML의 뜻은 바뀌지 않는다.

`test-roundtrip.mts`의 체인을 앱과 같은 `markdownPipeline`으로 바꾸고, 위 입력을 세 번 왕복 검사로 넣었다.

같은 400개 표본으로 다시 쟀다. 파일 단위 수치는 거의 그대로다. 표기만 바뀌는 차이(불릿, 표 너비, 수평선 등)가 대부분이고,
그것은 2단계가 줄인다.

| 지표 | 수정 전 | 수정 후 |
|---|---|---|
| 원문과 달라진 파일 | 330 | 329 |
| 링크 표기가 달라진 줄 (파일) | 305 (45) | 262 (25) |
| HTML이 달라진 줄 (파일) | 450 (52) | 294 (41) |
| 분류되지 않은 줄 | 17,848 | 17,633 |

남은 링크 표기 차이는 표 안의 링크 줄이 열 너비 채우기로 바뀐 것이고, 남은 HTML 차이는 들여쓰기다. 둘 다 표기만 바뀐다.

## 추가 검토 2. 코드 블록이 많은 문서에서 입력이 끊긴다

2026-09-23 두 번째 정기 검토에서 더했다.

### 문제

코드 블록이 많은 문서에서는 코드 블록이 아닌 문단에 입력해도 키마다 메인 스레드가 수십에서 수백 ms 멈춘다.
원인은 BlockNote가 쓰는 `prosemirror-highlight`(0.15.3)의 플러그인 `apply`다. 문서가 바뀔 때마다 모든 코드 블록의 장식을
캐시에서 모은 뒤 `DecorationSet.create(doc, allDecorations)`로 장식 집합 전체를 새로 만든다.
캐시 덕분에 다시 하이라이트하지는 않지만, 장식 트리를 짜는 `buildTree`와 `takeSpansForNode`가 최상위 노드마다 장식 배열 전체를 훑는다.

### 근거

모두 2026-09-23에 Playwright(Chromium)로 dev 서버에 대고 쟀다. 문서는 합성했다.
한 단위는 헤딩과 문단, 목록, 코드 블록 하나, 표 하나다. 첫 문단에 20자를 50ms 간격으로 입력하는 동안 난 긴 작업(50ms 이상)을 셌다.

**크기별**

| 단위 수 | 줄 수 | 여는 시간 | 입력 중 긴 작업 | 최대 | 합계 |
|---|---|---|---|---|---|
| 50 | 801 | 0.6초 | 0건 | 0ms | 0ms |
| 250 | 4,001 | 2.2초 | 1건 | 84ms | 84ms |
| 1,000 | 16,001 | 15.6초 | 21건 | 346ms | 2,870ms |

**구성별 (1,000 단위)**: 블록 종류를 빼 가며 같은 측정을 했다.

| 구성 | 줄 수 | 여는 시간 | 입력 중 긴 작업 | 합계 |
|---|---|---|---|---|
| 전부 | 16,001 | 11.7초 | 20건 | 2,479ms |
| 코드 블록 뺌 | 12,001 | 8.4초 | 1건 | 81ms |
| 헤딩, 문단, 코드 블록 | 8,001 | 3.1초 | 20건 | 1,199ms |
| 헤딩과 문단만 | 4,001 | 1.5초 | 0건 | 0ms |

코드 블록을 빼면 입력 중 긴 작업이 사라지고, 코드 블록만 더하면 키마다 하나씩 생긴다.

**CPU 프로파일 (전부, 1,000 단위, 20자 입력)**: 자기 시간 상위는 `takeSpansForNode`(prosemirror-view) 1,396ms였다.
앱 소스(`src/`)의 함수가 포함 시간으로 차지한 몫은 모두 합쳐 3ms 아래였다. 검색 플러그인은 검색어가 없을 때 `DecorationSet.empty`를 돌려주므로 원인이 아니다.

**최신판 확인**: npm의 최신판 0.16.0을 받아 `dist/index.js`를 봤다. `apply`와 `calculateDecoration`이 0.15.3과 같아서 버전을 올려도 해결되지 않는다.

여는 시간도 문서가 커지면 크게 늘지만, 코드 블록을 빼도 8.4초가 걸리므로 원인이 따로 있다. 이번 항목에서는 다루지 않는다.

### 설계

바뀐 코드 블록의 장식만 갈아 끼운다. 이전 장식 집합을 `tr.mapping`으로 옮긴 뒤, 내용이 바뀐 코드 블록 범위의 장식만
`remove`하고 새로 계산한 장식만 `add`한다. `add`는 넘겨받은 장식만 훑으므로 비용이 바뀐 블록 크기에 비례한다.

적용 방법 후보는 둘이다. 리뷰할 때 하나를 고른다.

- **앱 플러그인으로 대체한다**: `createCodeBlockSpec`에 `createHighlighter`를 넘기지 않아 BlockNote가 하이라이트 플러그인을 만들지 않게 하고,
  같은 shiki 하이라이터를 쓰는 증분 플러그인을 앱에 둔다. 검색 플러그인을 등록하는 경로가 이미 있다. 새 의존성이 없다.
  대가는 BlockNote의 코드 블록 하이라이트 동작(언어 전환 시 갱신 등)을 다시 맞춰야 한다는 것이다.
- **라이브러리를 고친다**: `prosemirror-highlight`의 `apply`만 증분 방식으로 바꾼다. `patch-package` 같은 새 개발 의존성이 들고,
  BlockNote를 올릴 때마다 패치가 맞는지 확인해야 한다. 고친 내용은 업스트림에 제안할 수 있다.

### 완료 기준

- 위 측정을 `e2e/`에 성능 테스트로 둔다. 코드 블록 1,000개 문서에서 문단에 20자를 입력하는 동안 긴 작업 합계가 200ms 아래다.
  기준선은 2,479ms다. CI 기계마다 편차가 크므로 기준값은 처음 몇 번 돌려 보고 정한다.
- 코드 블록 안에 입력하면 그 블록의 하이라이트가 갱신된다. 언어를 바꾸면 다시 하이라이트된다. 기존 E2E가 모두 통과한다.
- 측정 스크립트는 `C:\Users\Administrator\AppData\Local\Temp\claude\D--git-my-md-editor\e8e7b238-ec9a-4e03-8e37-6f6529d68193\scratchpad\zz-perf`에 있다.
  `perf.spec.ts`는 크기별, `ablate.spec.ts`는 구성별, `prof.spec.ts`는 CPU 프로파일이다.
  webview 폴더에 복사한 뒤 `npx playwright test -c zz-perf/pw.config.ts`로 돌린다.

### 결과

2026-09-23에 code 세션이 고쳤다. 적용 방법은 두 후보 가운데 어느 것도 그대로 쓰지 않고 셋째 방법을 골랐다.

`prosemirror-highlight`의 `createHighlightPlugin`과 인자, parser 계약이 같은 증분판을 `src/incrementalHighlightPlugin.ts`에 두고,
`vite.config.ts`의 alias로 BlockNote가 가져가는 `prosemirror-highlight`만 이 파일로 돌린다. 하위 경로 `prosemirror-highlight/shiki`는 원본을 그대로 쓴다.
고른 이유는 셋이다.

- BlockNote의 parser(하이라이터 지연 생성, 언어 별칭 해석, 언어 모듈 지연 로딩)를 다시 짜지 않아도 된다. 앱 플러그인으로 대체하는 후보의 대가가 여기서 없어진다.
- 새 의존성이 없다. `patch-package`도 postinstall 스크립트도 필요 없다.
- BlockNote가 이 패키지에서 다른 이름을 가져가기 시작하면 빌드가 export 누락으로 실패하므로, 올릴 때 조용히 어긋나지 않는다.

증분 방식은 설계대로다. 이전 장식 집합을 `tr.mapping`으로 옮기고, 트랜잭션이 건드린 범위에 걸친 코드 블록만 장식을 `remove`하고 새로 계산해 `add`한다.
언어 모듈을 받은 뒤의 갱신(`prosemirror-highlight-refresh`)은 어느 블록이 기다렸는지 모르므로 원본처럼 전체를 다시 계산한다. 드물게 한 번 일어난다.

같은 측정 스크립트(`perf.spec.ts`, 1,000 단위)로 다시 쟀다.

| 지표 | 수정 전 | 수정 후 |
|---|---|---|
| 긴 작업 건수 | 21건 | 2건 |
| 긴 작업 합계 | 2,654ms | 462ms |

수정 후 남은 2건은 첫 클릭(91ms)과, 입력을 멈추고 600ms 뒤에 도는 전체 문서 직렬화(371ms)다. 직렬화 직후에 `change`가 나간 시각으로 확인했다.
직렬화는 코드 블록과 무관하게 문서 크기에 비례하는 비용이라 이번 항목에서 다루지 않는다. 입력하는 동안에는 긴 작업이 없다.

`e2e/perf-codeblocks.spec.ts`에 두 테스트를 두었다.

- 헤딩, 문단, 코드 블록 1,000 단위 문서에서 문단에 20자를 입력하는 구간(첫 키부터 마지막 키 뒤 200ms)의 긴 작업 합계가 200ms 아래다.
  수정본에서 0~63ms, alias를 끈 원본에서 1,235ms로 실패했다.
- 코드 블록에 입력한 키워드가 토큰으로 하이라이트되고, 언어를 Plain Text로 바꾸면 토큰이 사라지고 Python으로 바꾸면 다시 생긴다.
  원본과 수정본에서 각각 세 번씩 통과했다.

배포 번들(`dist/assets/index-*.js`)에는 수정본의 문자열만 있고 원본의 문자열은 없다.

BlockNote를 올릴 때마다 `perf-codeblocks.spec.ts`의 두 테스트(입력 성능, 하이라이트 갱신)를 돌려 alias 계약이 유지되는지 확인한다.
alias를 바꾼 뒤에는 `node_modules/.vite`를 지우고 잰다. Vite가 미리 번들한 의존성을 다시 만들지 않아 바뀌기 전 플러그인으로 재는 일이 있었다.

## 추가 검토 3. 큰 문서를 여는 시간이 블록 수의 제곱으로 는다

2026-09-23 세 번째 정기 검토에서 더했다.

### 문제

큰 문서는 여는 데 몇 초씩 걸리고, 블록 수가 두 배가 되면 여는 시간은 두 배보다 더 늘어난다.
원인은 `@blocknote/core` 0.51.4의 공통 node view 생성 코드다. 에디터 화면을 처음 그릴 때 블록마다 node view를 만든다.
그때마다 블록 ID로 `editor.getBlock(id)`를 부르고, `getBlock`은 문서 전체를 `descendants`로 처음부터 훑어 그 ID를 찾는다.
블록이 N개면 이 탐색이 N번 돌아 전체 비용이 N²에 비례한다.

### 근거

모두 2026-09-23에 Playwright(Chromium)로 dev 서버에 대고 쟀다. 문서는 합성했다.

**블록 수별 여는 시간 (헤딩과 문단만)**

| 블록 수 | 줄 수 | 여는 시간 | 앞 행 대비 |
|---|---|---|---|
| 500 | 1,001 | 311ms | |
| 1,000 | 2,001 | 486ms | 1.6배 |
| 2,000 | 4,001 | 1,059ms | 2.2배 |
| 4,000 | 8,001 | 2,674ms | 2.5배 |

블록 수가 두 배가 될 때 배율이 1.6배에서 2.5배로 커진다. 블록 수에 비례하는 비용 위에 제곱으로 느는 비용이 얹혀 있다.

**CPU 프로파일 (헤딩, 문단, 목록, 표 1,000 단위, 12,001줄, 여는 시간 8.1초)**: 모든 프레임의 포함 시간을 모았다.
`createView`(prosemirror-view) 아래의 호출 사슬에서 node view 생성 → `transact` → `getBlock` → `descendants` → `nodesBetween`이 4.5초였다.
앱 소스(`src/`)가 차지한 몫은 `initEditor` 0.7초와 열자마자 도는 왕복 자가검증 0.3초였다.

**최신판 확인**: npm에서 0.52.1, 0.53.0, 0.54.2, 0.55.0을 받아 같은 자리를 봤다. 네 버전 모두 `getBlock(id)`를 부르지 않는다.
대신 `getPos()`로 얻은 위치의 노드를 바로 블록으로 바꾼다(`t.resolve(n).node()`). 0.52.0(2026-07-20)부터 고쳐진 것으로 보인다.
0.52.0 자체는 받아 보지 않았다.

### 설계

`@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`을 같은 버전으로 함께 올린다.
0.55.0은 2026-09-22에 나와 하루밖에 지나지 않았으므로 0.54.2를 권한다. 리뷰할 때 정한다.

1.0 이전이라 부 버전 사이에도 호환되지 않는 변경이 있을 수 있다. 아래가 영향을 받을 수 있는 자리다.

- **왕복 변환**: `tryParseMarkdownToBlocks`와 `blocksToMarkdownLossy`의 출력이 바뀌면 `markdownTransforms.ts`의 전처리와 후처리가 어긋난다.
  `npm test`와 추가 검토 1의 400개 표본 측정으로 확인한다.
- **하이라이트 alias**: 0.54.2와 0.55.0 모두 `prosemirror-highlight ^0.15.3`에 의존하므로 `incrementalHighlightPlugin.ts`가 맞춰 둔 계약이 그대로다.
  그래도 하이라이트 갱신 E2E와 `perf-codeblocks.spec.ts`를 돌려 확인한다.
- **내부 API**: `App.tsx`가 `_tiptapEditor`, `clearUndoHistory`, 검색 플러그인 등록처럼 공개되지 않은 경로를 쓴다. 이름이 바뀌었는지 본다.
- **커스텀 블록**: mermaid와 callout 블록의 `createReactBlockSpec` 계약을 본다.

올려도 해결되지 않거나 올리는 비용이 크면, 0.51.4의 node view 생성 코드만 alias로 바꾸는 방법이 남는다. 추가 검토 2와 같은 방식이다.
다만 BlockNote 본체 코드를 대체하는 것이라 유지 비용이 크므로 두 번째 안으로 둔다.

### 완료 기준

- 헤딩과 문단 4,000블록 문서를 여는 시간이 1,000블록의 5배 아래다. 기준선은 5.5배(2,674ms / 486ms)다.
  배율로 판정하므로 기계 속도와 무관하다. 이 측정을 `e2e/`에 성능 테스트로 둔다.
- 12,001줄 혼합 문서의 여는 시간을 수정 전 8.1초와 나란히 이 문서에 남긴다.
- `npm test`, E2E 전체, 400개 표본 왕복 측정이 올리기 전과 같거나 낫다. 나빠진 항목이 있으면 커밋하기 전에 보고한다.
- 측정 스크립트는 `C:\Users\Administrator\AppData\Local\Temp\claude\D--git-my-md-editor\e8e7b238-ec9a-4e03-8e37-6f6529d68193\scratchpad\zz-open`에 있다.
  `scale.spec.ts`는 블록 수별 여는 시간이고 `open.spec.ts`는 CPU 프로파일이다. webview 폴더에 복사한 뒤 `npx playwright test -c zz-open/pw.config.ts`로 돌린다.

### 결과

2026-09-24에 code 세션이 `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`을 0.54.2로 올렸다.

**여는 시간**

| 지표 | 0.51.4 | 0.54.2 |
|---|---|---|
| 헤딩과 문단 4,000블록 | 2,563~2,647ms | 1,329~1,337ms |
| 4,000블록 ÷ 1,000블록 | 4.5~4.9배 | 2.7~3.3배 |
| 2,000블록 → 4,000블록 | 2.5배 | 1.9배 |
| 12,001줄 혼합 문서 | 8.1초 | 3.4~4.5초 |

4,000블록 대 1,000블록 배율은 이 환경에서 0.51.4도 4.5~4.9배라, 원래 완료 기준인 5배로는 퇴행을 가르지 못한다.
`e2e/perf-open.spec.ts`는 8,000블록 대 1,000블록 배율로 판정하고 기준을 9배로 두었다. 0.54.2에서 5.3~6.8배다.
0.51.4는 두 배마다 2.5배로 느는 추세를 외삽하면 12배를 넘는다. 이 값은 직접 재지 않았다.

**올리면서 고친 것 셋**

- **별칭 언어 코드 블록에서 에디터 전체가 그려지지 않았다.** 0.54.2의 코드 블록은 `supportedLanguages`를 받으면 기본 언어 셀렉트를 만든다.
  이때 블록 언어가 목록의 키가 아니면 예외를 던진다. ` ```js `처럼 별칭이나 목록에 없는 언어가 하나만 있어도 문서가 열리지 않는다.
  셀렉트는 원래 CSS로 숨겨 왔고 언어 변경은 케밥 메뉴가 맡으므로 `createCodeBlockSpec`에 `supportedLanguages`를 넘기지 않는다.
  별칭은 shiki가 직접 풀어서 `js`, `javascript`, `bash` 블록 모두 하이라이트된다.
- **하이라이트 설정 자리가 바뀌었다.** `createCodeBlockSpec({ createHighlighter })`가 없어지고,
  에디터의 `extensions`에 `SyntaxHighlightingExtension({ createHighlighter })`를 넣는다. 이 확장도 `prosemirror-highlight`에서
  `createHighlightPlugin` 하나만 가져가므로 alias 계약은 그대로다.
- **언어를 바꿔도 하이라이트가 남았다.** 0.54.2는 블록 속성을 `AttrStep`으로 바꾸는데 이 step은 위치 맵이 비어 있다.
  `incrementalHighlightPlugin.ts`가 step 맵으로 바뀐 범위를 찾아서 언어 변경을 놓쳤다. 이제 이전 문서와 새 문서를
  `findDiffStart`와 `findDiffEnd`로 직접 비교해 범위를 구한다.

**확인한 것**

- `npm test`, E2E 37건, 400개 표본 왕복 측정: 400개 표본은 0.51.4와 줄 단위까지 같다(달라진 파일 329, 변환 실패 0).
- 공개되지 않은 내부 API(`_tiptapEditor`, undo 히스토리 비우기, 검색 플러그인 등록)와 mermaid, callout 블록: 타입 검사와 E2E가 통과했다.
- `npm audit`: 18건(moderate 14, high 4)에서 5건(moderate 2, high 3)으로 줄었다. 남은 5건(dompurify, mermaid, nanoid, postcss, undici)은 올리기 전에도 있었다.

**아직 처리하지 않은 것**: 지연 로딩 언어(rust, go 등)는 하이라이트되지 않는다. parser가 언어 이름 문자열로 `loadLanguage`를 부르는데,
앱의 지연 로딩은 parser가 쓰지 않는 `codeToHtml`을 가로채 두었기 때문이다. 0.51.4에서도 같은 코드 경로였다.
이것은 코드를 읽고 내린 판단이고 0.51.4에서 직접 돌려 보지는 않았다. 이번 항목에 넣지 않았고 언제 처리할지 정하지 않았다. 추가 검토 5에서 고쳤다.

## 추가 검토 4. 진단 로그의 "내용을 기록하지 않는다"는 약속을 코드가 강제하지 않는다

2026-09-23 네 번째 정기 검토에서 더했다.

### 문제

`docs/MONITORING.md`와 `diagnosticsLog.ts`의 머리 주석은 "문서 내용은 어떤 경우에도 기록하지 않는다"고 약속한다.
그러나 호스트의 `diag` 분기(`zenMdEditorProvider.ts`의 `case 'diag'`)는 웹뷰가 보낸 필드를 거르지 않고 `{ ev, doc, ...rest }`로 그대로 넘긴다.
약속을 지키는 것은 웹뷰 호출 지점마다 코드와 수치만 보내는 관례뿐이다. 누가 `diag('x', { message: err.message })`를 한 줄만 더해도
오류 메시지에 섞인 원고 조각이 로그 파일에 남는다.

같은 줄에 문제가 둘 더 있다.

- `...rest`가 `doc` 뒤에 펼쳐지므로 웹뷰가 보낸 `doc`이 호스트가 계산한 경로 해시를 덮어쓴다.
- `DiagnosticsLog.record`도 `{ ts, ...event }` 순서라 이벤트의 `ts`가 기록 시각을 덮어쓴다. 집계 보고서는 `ts`로 일별, 주별, 월별 구간을 나눈다.

### 근거

**지금의 호출 지점**: 2026-09-23 HEAD 기준으로 웹뷰의 `diag` 호출은 13곳이다(`App.tsx` 9곳, `useDocumentSync.ts` 2곳, `useSearchReplace.ts` 1곳, 헬퍼 1곳).
모두 이벤트 코드와 수치만 보내거나, `choice`처럼 값이 정해진 문자열(`'external' | 'mine'`)만 보낸다.
**지금 내용이 새고 있지는 않다.** 이 항목은 앞으로 새는 것을 막는 것이다.

**실측**: 컴파일된 `out/diagnosticsLog.js`를 `vscode` 모듈만 흉내 낸 채 실행했다. 호스트 `diag` 분기와 같은 식으로 아래 메시지를 넣었다.

```json
{"type":"diag","ev":"serialize_failed","message":"비밀 원고 첫 문단","doc":"forged","ts":"1999-01-01T00:00:00Z"}
```

로그 파일에 기록된 줄은 이것이다.

```json
{"ts":"1999-01-01T00:00:00Z","ev":"serialize_failed","doc":"forged","message":"비밀 원고 첫 문단"}
```

문자열이 그대로 남았고, `doc`과 `ts`는 웹뷰가 보낸 값이 이겼다. 실행 스크립트는
`C:\Users\Administrator\AppData\Local\Temp\claude\D--git-my-md-editor\e8e7b238-ec9a-4e03-8e37-6f6529d68193\scratchpad\diagtest\run.cjs`다.
`node run.cjs <out/diagnosticsLog.js 절대 경로>`로 돌린다.

### 설계

웹뷰 메시지가 들어오는 신뢰 경계인 호스트에서 거른다.

- `ev`는 `^[a-z_]{1,64}$`만 받는다.
- 나머지 필드는 값이 유한한 숫자이거나 불리언인 것만 남긴다.
- 문자열은 필드별 허용 목록에 있는 값만 남긴다. 지금 필요한 것은 `choice`의 `external`과 `mine`뿐이다.
- `roundtrip_drift`의 `kinds`는 `DriftKind` 이름을 키로, 숫자를 값으로 하는 객체만 남긴다.
- `doc`과 `ts`는 웹뷰가 보내도 버리고 호스트 값을 쓴다. `record` 안에서 `{ ...event, ts }` 순서로 바꾼다.
- 걸러진 필드가 있으면 그 이름의 개수만 `dropped`로 남긴다. 이름과 값은 남기지 않는다.

거르는 함수는 순수 함수로 두어 P1-3의 `src/hostLogic.ts`에 함께 넣고 같은 `node:test`로 검사한다.
P1-3보다 먼저 하게 되면 이 함수가 그 파일의 첫 항목이 된다.

### 완료 기준

단위 테스트가 아래를 확인한다.

| 입력 | 기대 |
|---|---|
| `message: "원고"` 같은 임의 문자열 필드 | 기록에 없고 `dropped: 1`이 있다 |
| `doc: "forged"`, `ts: "1999-..."` | 호스트의 해시와 기록 시각이 남는다 |
| `choice: "mine"` | 그대로 남는다 |
| `choice: "원고"` | 버려진다 |
| `kinds: { fence_lang: 2, 원고: 1 }` | `fence_lang`만 남는다 |
| `ev: "a b"`, `ev`가 1,000자 | 기록하지 않는다 |
| 지금의 13개 호출 지점이 보내는 모양 | 전과 같게 기록된다 |

`docs/MONITORING.md`의 "무엇이 기록되는가"에 이 거름을 한 문단으로 적는다.

### 결과

2026-09-24에 code 세션이 설계대로 고쳤다. `src/hostLogic.ts`의 `sanitizeDiag`가 웹뷰 진단 메시지를 거르고,
호스트 `diag` 분기는 걸러진 필드 뒤에 `ev`와 호스트 `doc`을 둔다. `DiagnosticsLog.record`는 `{ ...event, ts }` 순서로 바꿨다.

설계와 다르게 한 것 하나: 허용할 `kinds` 키 목록을 호스트에 따로 두었다. `DriftKind`가 웹뷰의 `roundtripCheck.ts`에 있고
호스트는 웹뷰 코드를 import하지 않기 때문이다. 두 목록이 같아야 한다는 주석을 달았다.

루트 `package.json`에 `test` 스크립트(`npm run compile && node --test out/hostLogic.test.js`)를 두었다. 완료 기준 표의 일곱 경우를 모두 담아
단위 테스트 9건이 통과한다. 컴파일된 테스트 파일은 `.vscodeignore`로 vsix에서 뺐다. P1-3의 `hostLogic.ts`는 이 함수로 시작한다.

재현 스크립트의 `diag` 분기를 새 분기로 바꿔 같은 메시지를 넣으면 이렇게 기록된다.

```json
{"dropped":3,"ev":"serialize_failed","doc":"hash01","ts":"2026-09-23T15:02:14.682Z"}
```

## 추가 검토 5. 지연 로딩하는 코드 언어 15개가 하이라이트되지 않는다

2026-09-24 다섯 번째 정기 검토에서 더했다. 추가 검토 3의 결과 보고에서 "남은 것"으로 적힌 항목을 재현하고 원인을 확인했다.

### 문제

`shikiHighlighter.ts`가 초기에 싣지 않고 필요할 때 불러오도록 만든 15개 언어는 코드 블록에서 하이라이트가 되지 않는다.
대상은 `rust`, `go`, `java`, `sql`, `xml`, `c`, `cpp`, `csharp`, `php`, `ruby`, `docker`, `diff`, `ini`, `toml`, `kql`이다.

원인은 지연 로딩을 가로채는 자리가 잘못됐다는 데 있다.

- `shikiHighlighter.ts`는 `highlighter.codeToHtml`만 감싸서, 로드되지 않은 언어가 오면 `langLoaders`로 불러온다.
- BlockNote의 하이라이트 parser는 `codeToHtml`을 부르지 않는다. 로드된 언어면 `prosemirror-highlight/shiki`의 `createParser`로 `codeToTokens`를 부른다.
  로드되지 않은 언어면 `highlighter.loadLanguage("rust")`처럼 **언어 이름 문자열**로 부른다.
- `createHighlighterCore`로 만든 하이라이터는 이름만으로 문법을 찾을 수 없어 이 호출이 실패한다. BlockNote는 실패한 언어를 집합에 넣고
  그 뒤로는 그 언어에 빈 장식을 돌려준다. 한 번 실패하면 문서를 다시 열기 전까지 다시 시도하지 않는다.
- 그래서 `langLoaders`와 `shiki-lang-loaded` 이벤트, 그 이벤트를 받아 코드 블록을 다시 그리는 `App.tsx`의 효과는 한 번도 실행되지 않는다.

### 근거

**브라우저 재현 (2026-09-24, BlockNote 0.54.2, dev 서버)**: 19개 언어의 코드 블록을 한 문서에 넣었다.
문서를 열고 6초를 기다린 뒤, 블록마다 `.shiki` 토큰 span을 셌다.

| 언어 | 토큰 span |
|---|---|
| `javascript`, `python`, `shellscript`, `yaml` (초기 로드) | 14, 18, 2, 1 |
| 지연 로딩 15개 | 모두 0 |

콘솔 오류는 0건이었다. BlockNote가 `loadLanguage`의 실패를 `catch`로 삼키기 때문에 겉으로는 드러나지 않는다.

**0.51.4에서도 같았는가**: npm에서 `@blocknote/core@0.51.4`를 받아 같은 자리를 봤다.
`getLoadedLanguages().includes(o) ? ... : n.loadLanguage(o)`로 0.54.2와 같은 경로다. 따라서 이번 업그레이드 전부터 있던 결함이다.
0.51.4를 브라우저에서 돌려 보지는 않았다.

재현 스크립트는 `C:\Users\Administrator\AppData\Local\Temp\claude\D--git-my-md-editor\e8e7b238-ec9a-4e03-8e37-6f6529d68193\scratchpad\zz-lang`에 있다.
webview 폴더에 복사한 뒤 `npx playwright test -c zz-lang/pw.config.ts`로 돌린다.

### 설계

가로채는 자리를 BlockNote가 실제로 부르는 `loadLanguage`로 옮긴다.

- `createHighlighterInternal`에서 `highlighter.loadLanguage`를 감싼다. 인수가 문자열이면 별칭을 언어 id로 바꾼다.
  별칭 표는 `supportedLanguages`의 `aliases`를 쓴다(`rs` → `rust`, `golang` → `go`). 그다음 `langLoaders[id]`로 모듈을 받아 원래의 `loadLanguage`에 넘긴다.
  문자열이 아니면 원래 함수를 그대로 부른다.
- `langLoaders`에 없는 이름이면 지금처럼 실패하게 둔다. BlockNote가 그 언어를 빈 장식으로 처리한다.
- BlockNote는 `loadLanguage`가 돌려준 Promise가 끝나면 하이라이트를 다시 계산한다. 그러면 앱 쪽의 재렌더링 장치가 필요 없다.
  `codeToHtml` 감싸기, `pendingLangs`, `shiki-lang-loaded` 이벤트와 `App.tsx`의 수신 효과를 지운다.
  지우기 전에, 로드가 끝난 뒤 다시 계산하는지를 아래 E2E로 먼저 확인한다. 다시 계산하지 않으면 이벤트 경로만 남기고 `loadLanguage` 쪽에서 쏜다.
- 불러오기가 네트워크나 청크 오류로 실패하면 BlockNote의 실패 집합에 들어가 문서를 다시 열 때까지 복구되지 않는다.
  이 동작은 이번에 바꾸지 않는다. 웹뷰 청크는 로컬 파일이라 실패할 일이 드물다.

### 완료 기준

- 위 19개 언어 문서를 E2E로 둔다. 지연 로딩 15개가 모두 토큰 span 1개 이상이다.
- 별칭 펜스(`rs`, `golang`, `cs`)도 하이라이트된다.
- 코드 블록의 언어를 `text`에서 `rust`로 바꾸면 하이라이트된다.
- 기존 하이라이트 E2E와 `perf-codeblocks.spec.ts`가 통과한다. 증분 플러그인이 비동기 로드 뒤의 갱신을 놓치지 않는지 이 둘로 확인한다.
- `grep "shiki-lang-loaded" webview/src`가 0건이다. 위 설계의 확인에서 이벤트 경로를 남기기로 했으면 이 조건은 빼고 그 이유를 적는다.

### 결과

2026-09-24에 code 세션이 고쳤다. `shikiHighlighter.ts`가 `loadLanguage`를 감싼다. 인수가 문자열이면 `supportedLanguages`의 별칭으로
대표 id를 풀고, `langLoaders`로 문법 모듈을 받아 원래 `loadLanguage`에 넘긴다.

BlockNote는 `loadLanguage`의 Promise가 끝나면 하이라이트 플러그인에 갱신 트랜잭션(`prosemirror-highlight-refresh`)을 보내고,
증분 플러그인은 이 트랜잭션에서 전체를 다시 계산한다. 앱 쪽 재렌더링 장치가 필요 없으므로 `codeToHtml` 가로채기,
`pendingLangs`, `shiki-lang-loaded` 이벤트, `App.tsx`의 수신 효과를 모두 지웠다.

설계에 하나를 더했다. 문법을 로드할 때 `supportedLanguages`의 별칭을 그 문법의 `aliases`에 합쳐 넘긴다(`withAliases`).
shiki는 로드된 문법의 `aliases`만 별칭으로 안다. 이것이 없으면 `golang`처럼 shiki 문법에 없는 별칭은 `go`를 로드한 뒤에도
미로드로 보여 하이라이트되지 않았다. shiki의 `langAlias` 옵션은 대상이 로드되지 않았어도 별칭을 로드된 언어로 보고하므로 지연 로딩과 맞지 않아 쓰지 않았다.
초기 로드 언어 12개에도 같은 처리를 한다.

| 확인 | 결과 |
|---|---|
| 재현 스크립트 19개 언어 | 수정 전 지연 로딩 15개가 모두 0, 수정 후 모두 하이라이트된다. 콘솔 오류 0건 |
| 별칭 `rs`, `golang`, `dockerfile` | 하이라이트된다 |
| 로드를 마친 뒤 3초 동안 스크립트 실행 시간 | 0초. 목록에 없는 `foo`가 섞여도 로드와 갱신이 되풀이되지 않는다 |
| `perf-codeblocks.spec.ts` | 기존 두 테스트와 새 테스트(지연 로딩 언어와 별칭 여섯 블록) 모두 통과 |

## 이번 계획에 넣지 않은 것

HTML 내보내기와 위키링크(`[[문서]]`) 자동완성은 `MEMORY.md`의 다음 단계 목록에 있다. P0과 P1을 마친 뒤 다시 정한다.

## 순서와 커밋

| 순서 | 항목 | 커밋 |
|---|---|---|
| 1 | P0 재현 테스트 추가 (실패 확인) | `test:` |
| 2 | P0 충돌 막대 (모드 전환과 blur 자동 포맷의 전송 경로 포함) | `fix:` |
| 3 | 추가 검토 1의 1단계: 뜻이 바뀌는 손실 | `fix:` |
| 4 | P0 차이 보기 오버레이 | `feat:` |
| 5 | P1-1 `saveToHost` 정리 | `refactor:` |
| 6 | P2 문서와 이스케이프 | `docs:`, `fix:` |
| 7 | P1-3 호스트 테스트 | `test:` |
| 8 | P1-2 App.tsx 분리 네 단계 | `refactor:` 네 개 |
| 9 | P1-5 번들 측정 | `docs:` |
| 10 | P1-4 CI | `chore:` |
| 11 | 추가 검토 2: 코드 블록 하이라이트 증분 갱신 (3번 다음에 처리함) | `perf:` |
| 12 | 추가 검토 3: BlockNote 0.54.2로 올리기 (11번 다음에 처리함) | `perf:` |
| 13 | 추가 검토 4: 진단 필드를 호스트에서 거르기 (12번 다음에 처리함) | `fix:` |
| 14 | 추가 검토 5: 지연 로딩 언어 하이라이트 (13번 다음에 처리함) | `fix:` |

추가 검토 1의 1단계는 데이터 손실 부류이고, 인용 입력은 저장할 때마다 문서가 커진다. 그래서 기능 추가인 차이 보기보다 앞인 3번으로 당겼다.
원인 셋(파서의 줄바꿈 공백, HTML 줄의 `\`, 같은 텍스트 링크)이 서로 얽혀 기대 출력이 함께 정해지므로 커밋 하나로 묶었다.

커밋마다 메시지와 파일 목록을 먼저 보이고 승인을 받는다. 버전은 2번을 마친 뒤 v0.7.2로 올린다.
