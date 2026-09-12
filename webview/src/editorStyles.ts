import type { ThemePalette } from './themes';

// WYSIWYG 에디터에 주입되는 전역 CSS.
// 테마와 폰트 크기에만 의존하므로 App에서 useMemo로 감싸 매 렌더 재생성을 피한다.
export function buildEditorStyles(t: ThemePalette, fontSize: number): string {
  const { isDark, bgColor, textColor, codeColor, codeTextColor, dropdownBg, dropdownBorder, inputBg, accentColor } = t;
  return `
          :root {
            --bg-color: ${bgColor};
            --text-color: ${textColor};
            /* MermaidBlock 등 서브컴포넌트가 참조하는 테마 파생 변수 */
            --dropdown-border: ${dropdownBorder};
            --input-bg: ${inputBg};
            --accent-color: ${accentColor};
          }

          /* Confluence Typography Base */
          .bn-editor {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
            font-size: ${fontSize}px;
            background-color: transparent !important;
          }

          /* Confluence Link Style */
          .bn-editor a {
            color: ${accentColor} !important;
            text-decoration: none;
          }
          .bn-editor a:hover {
            text-decoration: underline;
          }

          .bn-container { color: var(--text-color) !important; }
          .raw-markdown-editor .cm-content { padding: 16px 32px !important; }

          /* 
           * WYSIWYG Numbered List Override 
           * To match the Markdown export behavior (where numbers continue across paragraphs/bullets 
           * until a heading is encountered), we override the root level BlockNote CSS counters.
           */
          .bn-editor {
            counter-reset: root-bn-numbered-list;
          }
          .bn-editor > .bn-block-group > .bn-block[data-content-type="heading"] {
            counter-reset: root-bn-numbered-list;
          }
          .bn-editor > .bn-block-group > .bn-block[data-content-type="numberedListItem"] > .bn-block-content.bn-numbered-list-item {
            counter-increment: root-bn-numbered-list 1 !important;
          }
          .bn-editor > .bn-block-group > .bn-block[data-content-type="numberedListItem"] > .bn-block-content.bn-numbered-list-item::before {
            content: counter(root-bn-numbered-list) ". " !important;
          }

          /* Alternate Bullet Lists: - and * */
          .bn-editor .bn-bullet-list-item::before {
            content: "- " !important;
            font-weight: bold;
            color: color-mix(in srgb, var(--text-color) 70%, transparent);
          }
          .bn-editor .bn-block-group .bn-block-group .bn-bullet-list-item::before {
            content: "* " !important;
            font-weight: bold;
            font-size: 1.1em;
          }
          .bn-editor .bn-block-group .bn-block-group .bn-block-group .bn-bullet-list-item::before {
            content: "- " !important;
            font-weight: bold;
            font-size: 1em;
          }
          .bn-editor .bn-block-group .bn-block-group .bn-block-group .bn-block-group .bn-bullet-list-item::before {
            content: "* " !important;
            font-weight: bold;
            font-size: 1.1em;
          }

          /* Code Block (GitHub-style: background one step off the page, no border) */
          .bn-editor .bn-block-content[data-content-type="codeBlock"] {
            color: ${codeColor} !important;
            background-color: color-mix(in srgb, var(--text-color) 5%, transparent) !important;
            border: none !important;
            border-radius: 6px !important;
            padding: 14px 16px !important;
            font-family: ui-monospace, SFMono-Regular, "SF Mono", "Cascadia Code", Consolas, "Liberation Mono", monospace !important;
            font-size: 0.875em !important;
            line-height: 1.5 !important;
          }
          .bn-editor .bn-block-content[data-content-type="codeBlock"] pre,
          .bn-editor .bn-block-content[data-content-type="codeBlock"] code {
            background-color: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            text-indent: 0 !important;
            font-family: inherit !important;
            font-size: inherit !important;
            line-height: inherit !important;
            /* 인라인 코드 규칙(.bn-editor code)의 액센트색이 코드블록 안으로 새지 않게 차단 */
            color: inherit !important;
            border-radius: 0 !important;
          }
          /* BlockNote 기본 언어 셀렉트는 숨김 — 언어 변경은 케밥(⋮) 메뉴가 담당 */
          .bn-editor .bn-block-content[data-content-type="codeBlock"] > div > select {
            display: none !important;
          }

          /* Shiki syntax token colors — GitHub ${isDark ? 'Dark' : 'Light'} palette via CSS variables */
          .bn-editor .bn-block-content[data-content-type="codeBlock"] {
            --shiki-foreground: var(--text-color);
            --shiki-background: transparent;
            --shiki-token-constant: ${isDark ? '#79c0ff' : '#0550ae'};
            --shiki-token-string: ${isDark ? '#a5d6ff' : '#0a3069'};
            --shiki-token-comment: ${isDark ? '#8b949e' : '#59636e'};
            --shiki-token-keyword: ${isDark ? '#ff7b72' : '#cf222e'};
            --shiki-token-parameter: ${isDark ? '#ffa657' : '#953800'};
            --shiki-token-function: ${isDark ? '#d2a8ff' : '#6639ba'};
            --shiki-token-string-expression: ${isDark ? '#a5d6ff' : '#0a3069'};
            --shiki-token-punctuation: var(--text-color);
            --shiki-token-link: ${isDark ? '#a5d6ff' : '#0a3069'};
          }

          /* Floating Copy Button — 툴팁과 같은 시각 언어 (은은한 보더 + 필 형태) */
          .bn-floating-copy-btn {
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 3px 10px;
            background-color: ${dropdownBg} !important;
            color: color-mix(in srgb, var(--text-color) 75%, transparent) !important;
            border: 1px solid color-mix(in srgb, var(--text-color) 16%, transparent) !important;
            border-radius: 6px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 11px;
            font-weight: 500;
            letter-spacing: 0.02em;
            box-shadow: 0 2px 8px rgba(0,0,0,${isDark ? '0.35' : '0.1'});
            transition: opacity 0.2s, color 0.12s ease, border-color 0.12s ease;
          }
          .bn-floating-copy-btn:hover {
            color: var(--text-color) !important;
            border-color: color-mix(in srgb, var(--text-color) 30%, transparent) !important;
          }
          .bn-floating-copy-btn.copied {
            color: ${isDark ? '#86efac' : '#16a34a'} !important;
            border-color: color-mix(in srgb, ${isDark ? '#86efac' : '#16a34a'} 40%, transparent) !important;
          }
          .bn-floating-menu-btn {
            padding: 3px 5px;
          }

          /* Code Block 케밥 메뉴 (UpNote식) — 패널/항목/서브메뉴 */
          .cbm-panel {
            position: fixed;
            z-index: 4000;
            min-width: 168px;
            background: ${dropdownBg};
            color: ${textColor};
            border: 1px solid ${dropdownBorder};
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0,0,0,${isDark ? '0.45' : '0.15'});
            padding: 5px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 12px;
          }
          .cbm-item {
            position: relative;
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 10px;
            border-radius: 5px;
            cursor: pointer;
            white-space: nowrap;
            user-select: none;
          }
          .cbm-item:hover {
            background: color-mix(in srgb, var(--text-color) 7%, transparent);
          }
          .cbm-divider {
            height: 1px;
            background: color-mix(in srgb, var(--text-color) 10%, transparent);
            margin: 5px 4px;
          }
          .cbm-arrow {
            opacity: 0.5;
            font-size: 13px;
          }
          /* 서브메뉴: 케밥이 우측 끝이므로 왼쪽으로 펼침 */
          .cbm-sub {
            display: none;
            position: absolute;
            top: -6px;
            right: calc(100% - 2px);
            min-width: 150px;
            max-height: 300px;
            overflow-y: auto;
            background: ${dropdownBg};
            border: 1px solid ${dropdownBorder};
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0,0,0,${isDark ? '0.45' : '0.15'});
            padding: 5px;
          }
          .cbm-has-sub:hover > .cbm-sub {
            display: block;
          }
          .cbm-radio {
            width: 12px;
            height: 12px;
            flex-shrink: 0;
            border-radius: 50%;
            border: 1.5px solid color-mix(in srgb, var(--text-color) 35%, transparent);
            box-sizing: border-box;
          }
          .cbm-radio.selected {
            border-color: ${accentColor};
            background: radial-gradient(circle, ${accentColor} 0 3px, transparent 3.5px);
          }

          /* Uniform Bullet Icons - Elegant Design */
          .bn-editor .bn-block-content[data-content-type="bulletListItem"]::before {
            font-family: "Inter", "Segoe UI", "Apple Color Emoji", sans-serif !important;
            font-size: 0.9em !important;
            transform: translateY(0.05em);
          }

          /* Level 1: Standard Bullet (Solid) */
          .bn-editor .bn-block-content[data-content-type="bulletListItem"]::before {
            content: "•" !important;
          }

          /* Level 2: Hollow Bullet */
          .bn-editor .bn-block-group .bn-block-group .bn-block-content[data-content-type="bulletListItem"]::before {
            content: "◦" !important;
            font-size: 1.1em !important;
            transform: translateY(-0.02em);
          }

          /* Level 3: Small Solid Square */
          .bn-editor .bn-block-group .bn-block-group .bn-block-group .bn-block-content[data-content-type="bulletListItem"]::before {
            content: "▪" !important;
            font-size: 0.8em !important;
            transform: translateY(0.1em);
          }

          /* Level 4+: Small Hollow Square */
          .bn-editor .bn-block-group .bn-block-group .bn-block-group .bn-block-group .bn-block-content[data-content-type="bulletListItem"]::before {
            content: "▫" !important;
            font-size: 0.8em !important;
            transform: translateY(0.1em);
          }

          /* Single Bullet/Item: Hide left indent guide line if it's the only child */
          .bn-block-group .bn-block-group > .bn-block-outer:only-child::before {
            border-left: none !important;
            display: none !important;
          }

          /* Disable distracting block shift animations during typing/indenting */
          .bn-editor .bn-block-content::before,
          .bn-editor .bn-block-group .bn-block-group > .bn-block-outer::before {
            transition: none !important;
          }

          /* Disable BlockNote internal scroll to prevent double scrollbars */
          .bn-editor, .bn-container {
            overflow: visible !important;
          }

          /* Global Block Spacing Reduction - Aggressive Zero Gap */
          .bn-editor .bn-block-outer,
          .bn-editor .bn-block-group,
          .bn-editor .bn-block,
          .bn-editor .bn-block-content,
          .bn-editor p,
          .bn-editor h1, .bn-editor h2, .bn-editor h3, .bn-editor h4, .bn-editor h5, .bn-editor h6,
          .bn-editor ul, .bn-editor ol, .bn-editor li,
          .bn-editor [data-content-type="heading"],
          .bn-editor .bn-inline-content {
            margin-top: 0 !important;
            margin-bottom: 0 !important;
            padding-top: 0 !important;
            padding-bottom: 0 !important;
          }

          /* Heading Margins — 위 여백을 아래의 2배 내외로 (Tailwind/Notion 패턴).
             em 값은 제목 자신의 크기 기준 (BlockNote가 content div에 font-size 지정) */
          .bn-editor [data-content-type="heading"][data-level="1"] {
            margin-top: 1em !important;
            margin-bottom: 0.4em !important;
          }
          .bn-editor [data-content-type="heading"][data-level="2"] {
            margin-top: 1.2em !important;
            margin-bottom: 0.5em !important;
          }
          .bn-editor [data-content-type="heading"][data-level="3"] {
            margin-top: 1.3em !important;
            margin-bottom: 0.4em !important;
          }
          .bn-editor [data-content-type="heading"][data-level="4"],
          .bn-editor [data-content-type="heading"][data-level="5"],
          .bn-editor [data-content-type="heading"][data-level="6"] {
            margin-top: 0.8em !important;
            margin-bottom: 0.25em !important;
          }

          /* Notion식 자간 — 큰 제목만 살짝 좁힘 */
          .bn-editor [data-content-type="heading"][data-level="1"],
          .bn-editor [data-content-type="heading"][data-level="2"] {
            letter-spacing: -0.01em;
          }

          /* GitHub식 h1/h2 구분선 */
          .bn-editor [data-content-type="heading"][data-level="1"],
          .bn-editor [data-content-type="heading"][data-level="2"] {
            border-bottom: 1px solid color-mix(in srgb, var(--text-color) 14%, transparent) !important;
            padding-bottom: 0.15em !important;
          }

          /* Remove spacing between consecutive headings */
          .bn-editor .bn-block-outer:has([data-content-type="heading"]) + .bn-block-outer:has([data-content-type="heading"]) [data-content-type="heading"] {
            margin-top: 0 !important;
          }

          /* Code Block Margins */
          .bn-editor .bn-block-outer:has([data-content-type="codeBlock"]) {
            margin-top: 0.25cm !important;
            margin-bottom: 0.25cm !important;
          }

          /* Table Styles Enhancement */
          /* 1. Target the table block itself */
          .bn-editor .bn-block-outer:has([data-content-type="table"]),
          .bn-editor .bn-block-outer:has([data-content-type="table"]) .bn-block,
          .bn-editor .bn-block-outer:has([data-content-type="table"]) .bn-block-content {
            padding-top: 0 !important;
            padding-bottom: 0 !important;
            margin-top: 0 !important;
            margin-bottom: 0 !important;
          }
          /* 2. Target the block BEFORE the table */
          .bn-editor .bn-block-outer:has(+ .bn-block-outer [data-content-type="table"]),
          .bn-editor .bn-block-outer:has(+ .bn-block-outer [data-content-type="table"]) .bn-block,
          .bn-editor .bn-block-outer:has(+ .bn-block-outer [data-content-type="table"]) .bn-block-content {
            padding-bottom: 0 !important;
            margin-bottom: 0 !important;
          }
          /* 3. Target the block AFTER the table */
          .bn-editor .bn-block-outer:has([data-content-type="table"]) + .bn-block-outer,
          .bn-editor .bn-block-outer:has([data-content-type="table"]) + .bn-block-outer .bn-block,
          .bn-editor .bn-block-outer:has([data-content-type="table"]) + .bn-block-outer .bn-block-content {
            padding-top: 0 !important;
            margin-top: 0 !important;
          }
          .bn-editor [data-content-type="table"] table {
            border-collapse: collapse !important;
            min-width: 100% !important;
            border: 1px solid color-mix(in srgb, var(--text-color) 18%, transparent) !important;
            margin: 0.5em 0 !important;
            border-radius: 6px !important;
            overflow: hidden !important;
          }
          .bn-editor [data-content-type="table"] th {
            background-color: color-mix(in srgb, var(--text-color) 8%, transparent) !important;
            color: var(--text-color) !important;
            font-weight: 600 !important;
            text-align: left;
          }
          .bn-editor [data-content-type="table"] td,
          .bn-editor [data-content-type="table"] th {
            border: 1px solid color-mix(in srgb, var(--text-color) 14%, transparent) !important;
            padding: 6px 10px !important;
            min-width: 90px;
            vertical-align: middle !important;
            transition: background-color 0.12s ease;
          }
          .bn-editor [data-content-type="table"] td:focus-within,
          .bn-editor [data-content-type="table"] th:focus-within {
            background-color: color-mix(in srgb, var(--accent-color) 12%, transparent) !important;
            outline: 1px dashed color-mix(in srgb, var(--accent-color) 50%, transparent) !important;
          }
          .bn-editor [data-content-type="table"] tr:hover {
            background-color: color-mix(in srgb, var(--text-color) 4%, transparent) !important;
          }
          /* GFM Table Alignment Styles */
          .bn-editor [data-content-type="table"] td[align="center"],
          .bn-editor [data-content-type="table"] th[align="center"] {
            text-align: center !important;
          }
          .bn-editor [data-content-type="table"] td[align="right"],
          .bn-editor [data-content-type="table"] th[align="right"] {
            text-align: right !important;
          }
          .bn-editor [data-content-type="table"] td[align="left"],
          .bn-editor [data-content-type="table"] th[align="left"] {
            text-align: left !important;
          }
          .bn-editor [data-content-type="table"] td > p,
          .bn-editor [data-content-type="table"] th > p {
            align-content: center;
          }

          /* Blockquote (GitHub Primer-style: quiet, neutral, no background/italic).
             주의: BlockNote 0.51의 블록 타입은 "quote"이며 기본 CSS가
             [data-content-type=quote] blockquote 에 #7d797a를 하드코딩하므로 그 셀렉터를 그대로 덮어씀 */
          .bn-editor [data-content-type="quote"] blockquote {
            border: none !important;
            border-left: 3px solid color-mix(in srgb, var(--text-color) 25%, transparent) !important;
            background: transparent !important;
            padding: 2px 0 2px 16px !important;
            margin: 0.4em 0 !important;
            font-style: normal !important;
            border-radius: 0 !important;
            color: color-mix(in srgb, var(--text-color) 70%, var(--bg-color)) !important;
          }

          /* Inline Code Styles (GitHub-style sizing, theme accent color) */
          .bn-editor code, .bn-editor [data-inline-style="code"] {
            background-color: color-mix(in srgb, var(--text-color) 8%, transparent) !important;
            padding: 0.2em 0.4em !important;
            border-radius: 4px !important;
            font-family: ui-monospace, SFMono-Regular, "SF Mono", "Cascadia Code", Consolas, "Liberation Mono", monospace !important;
            font-size: 0.875em !important;
            color: ${codeTextColor} !important;
            border: none !important;
            box-shadow: none !important;
          }
          .bn-editor [data-content-type="table"] tr {
            transition: background-color 0.1s ease;
          }
          .bn-editor [data-content-type="table"] tr:hover {
            background-color: color-mix(in srgb, var(--text-color) 4%, transparent) !important;
          }

          /* Custom Tooltips — 네이티브 title 대체 (작고 우아한 말풍선) */
          [data-tooltip] { position: relative; }
          [data-tooltip]::after {
            content: attr(data-tooltip);
            position: absolute;
            top: calc(100% + 6px);
            left: 50%;
            transform: translateX(-50%) translateY(-3px);
            background: ${dropdownBg};
            color: ${textColor};
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 11px;
            font-weight: 500;
            letter-spacing: 0.02em;
            line-height: 1;
            padding: 5px 9px;
            border: 1px solid ${dropdownBorder};
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,${isDark ? '0.4' : '0.12'});
            white-space: nowrap;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.15s ease, transform 0.15s ease;
            pointer-events: none;
            z-index: 3000;
          }
          [data-tooltip]:hover::after {
            opacity: 0.97;
            visibility: visible;
            transform: translateX(-50%) translateY(0);
            transition-delay: 0.4s;
          }
          /* 화면 오른쪽 가장자리 버튼용: 말풍선을 오른쪽 정렬로 */
          [data-tooltip][data-tooltip-pos="right"]::after {
            left: auto;
            right: 0;
            transform: translateY(-3px);
          }
          [data-tooltip][data-tooltip-pos="right"]:hover::after {
            transform: translateY(0);
          }
          /* 화면 왼쪽 가장자리 버튼용: 말풍선을 왼쪽 정렬로 (창 밖 잘림 방지) */
          [data-tooltip][data-tooltip-pos="left"]::after {
            left: 0;
            right: auto;
            transform: translateY(-3px);
          }
          [data-tooltip][data-tooltip-pos="left"]:hover::after {
            transform: translateY(0);
          }

          /* Settings 테마 셀렉트 — 은은한 보더, 호버/포커스에서 단계적으로 강조 */
          .settings-select {
            width: 100%;
            padding: 6px 10px;
            border-radius: 6px;
            border: 1px solid color-mix(in srgb, var(--text-color) 18%, transparent);
            background: transparent;
            color: var(--text-color);
            font-size: 12px;
            outline: none;
            cursor: pointer;
            transition: border-color 0.12s ease, box-shadow 0.12s ease;
          }
          .settings-select:hover {
            border-color: color-mix(in srgb, var(--text-color) 32%, transparent);
          }
          .settings-select:focus {
            border-color: var(--accent-color);
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-color) 22%, transparent);
          }
          .settings-select option {
            background: var(--bg-color);
            color: var(--text-color);
          }

          /* Frontmatter Properties — Notion식 hover-reveal 편집 */
          .fm-value {
            border-radius: 4px;
            transition: background-color 0.12s ease, box-shadow 0.12s ease;
          }
          .fm-row:hover .fm-value:not(:focus-within) {
            background-color: color-mix(in srgb, var(--text-color) 5%, transparent);
          }
          .fm-value:focus-within {
            box-shadow: inset 0 0 0 1px ${accentColor};
          }
          .fm-input {
            background: transparent;
            border: none;
            outline: none;
            color: inherit;
            font-family: inherit;
            font-size: 12px;
            padding: 4px 8px;
            width: 100%;
            box-sizing: border-box;
            border-radius: 4px;
          }
          .fm-chip-x {
            opacity: 0;
            transition: opacity 0.12s ease;
          }
          .fm-chip:hover .fm-chip-x { opacity: 0.65; }
          .fm-chip-x:hover { opacity: 1 !important; }
          /* 날짜 입력: 전체 폭 대신 내용 폭으로 줄여 캘린더 버튼이 날짜 바로 옆에 오게 하고,
             간격을 띄운 뒤 호버 시 둥근 하이라이트로 반응 */
          .fm-input[type="date"] {
            width: auto;
          }
          .fm-input[type="date"]::-webkit-calendar-picker-indicator {
            margin-left: 14px;
            padding: 3px;
            border-radius: 4px;
            cursor: pointer;
            opacity: 0.45;
            transition: opacity 0.12s ease, background-color 0.12s ease;
          }
          .fm-input[type="date"]::-webkit-calendar-picker-indicator:hover {
            opacity: 0.9;
            background-color: color-mix(in srgb, var(--text-color) 10%, transparent);
          }

          /* Rich Formatting Toolbar Buttons (Orca Style) */
          .tb-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 3px 7px;
            border-radius: 4px;
            background: transparent;
            border: 1px solid transparent;
            color: color-mix(in srgb, var(--text-color) 75%, transparent);
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            user-select: none;
            transition: background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease;
          }
          .tb-btn:hover {
            background: color-mix(in srgb, var(--text-color) 8%, transparent);
            color: var(--text-color);
            border-color: color-mix(in srgb, var(--text-color) 15%, transparent);
          }
          .tb-btn-active {
            background: color-mix(in srgb, var(--accent-color) 15%, transparent) !important;
            color: var(--accent-color) !important;
            border-color: color-mix(in srgb, var(--accent-color) 30%, transparent) !important;
          }

          /* PDF Export Pill Button */
          .pdf-export-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 4px 14px;
            border-radius: 16px;
            background: color-mix(in srgb, var(--text-color) 8%, transparent);
            border: 1px solid color-mix(in srgb, var(--text-color) 16%, transparent);
            color: var(--text-color);
            cursor: pointer;
            font-size: 11.5px;
            font-weight: 600;
            user-select: none;
            transition: background-color 0.15s ease, border-color 0.15s ease;
          }
          .pdf-export-btn:hover {
            background: color-mix(in srgb, var(--text-color) 15%, transparent);
            border-color: color-mix(in srgb, var(--text-color) 30%, transparent);
          }

          /* Media Print Rules for Clean PDF Export */
          @media print {
            body, html {
              background: #ffffff !important;
              color: #000000 !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            .tb-btn, .pdf-export-btn, [data-tooltip], .settings-select,
            header, div[style*="borderBottom"], div[style*="border-bottom"],
            div[style*="borderRight"], div[style*="border-right"] {
              display: none !important;
            }
            .bn-editor, .bn-container {
              color: #000000 !important;
              background: #ffffff !important;
              padding: 0 !important;
              margin: 0 !important;
            }
          }
  `;
}
