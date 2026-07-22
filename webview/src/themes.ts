import * as cmThemes from '@uiw/codemirror-themes-all';

// 에디터 테마 팔레트 중앙 정의.
// 새 테마 추가 시: 여기 + package.json enum + App.tsx 설정 드롭다운 <option> 세 곳을 갱신.
export interface ThemePalette {
  isDark: boolean;
  bgColor: string;
  textColor: string;
  headerBg: string;
  /** 코드블록 기본 텍스트 색 */
  codeColor: string;
  /** 인라인 코드 액센트 색 */
  codeTextColor: string;
  blockNoteTheme: 'light' | 'dark';
  /** Raw 모드 CodeMirror 테마 */
  cmTheme: any;
  dropdownBg: string;
  dropdownBorder: string;
  inputBg: string;
  /** 링크·포커스 링·체크박스 등 공용 액센트 */
  accentColor: string;
}

export const THEMES: Record<string, ThemePalette> = {
  light: {
    isDark: false,
    bgColor: '#ffffff',
    textColor: '#333333',
    headerBg: '#f3f3f3',
    codeColor: '#333333',
    codeTextColor: '#a31515',
    blockNoteTheme: 'light',
    cmTheme: cmThemes.vscodeLight,
    dropdownBg: '#ffffff',
    dropdownBorder: '#dddddd',
    inputBg: 'rgba(0,0,0,0.05)',
    accentColor: '#0052cc',
  },
  dark: {
    isDark: true,
    bgColor: '#1e1e1e',
    textColor: '#d4d4d4',
    headerBg: '#2d2d2d',
    codeColor: '#d4d4d4',
    codeTextColor: '#e06c75',
    blockNoteTheme: 'dark',
    cmTheme: cmThemes.vscodeDark,
    dropdownBg: '#252526',
    dropdownBorder: '#555555',
    inputBg: 'rgba(255,255,255,0.1)',
    accentColor: '#579dff',
  },
  nord: {
    isDark: true,
    bgColor: '#2e3440',
    textColor: '#d8dee9',
    headerBg: '#3b4252',
    codeColor: '#d8dee9',
    codeTextColor: '#88c0d0',
    blockNoteTheme: 'dark',
    cmTheme: cmThemes.nord,
    dropdownBg: '#3b4252',
    dropdownBorder: '#4c566a',
    inputBg: 'rgba(255,255,255,0.06)',
    accentColor: '#579dff',
  },
  'one-half-dark': {
    isDark: true,
    bgColor: '#282c34',
    textColor: '#dcdfe4',
    headerBg: '#2c323c',
    codeColor: '#dcdfe4',
    codeTextColor: '#e06c75',
    blockNoteTheme: 'dark',
    cmTheme: cmThemes.atomone,
    dropdownBg: '#2c323c',
    dropdownBorder: '#3e4452',
    inputBg: 'rgba(255,255,255,0.06)',
    accentColor: '#579dff',
  },
  'solarized-dark': {
    isDark: true,
    bgColor: '#002b36',
    textColor: '#839496',
    headerBg: '#073642',
    codeColor: '#839496',
    codeTextColor: '#cb4b16',
    blockNoteTheme: 'dark',
    cmTheme: cmThemes.solarizedDark,
    dropdownBg: '#073642',
    dropdownBorder: '#586e75',
    inputBg: 'rgba(255,255,255,0.06)',
    accentColor: '#579dff',
  },
  vintage: {
    isDark: false,
    bgColor: '#f4ecd8',
    textColor: '#3a3a3a',
    headerBg: '#e8dcc3',
    codeColor: '#3a3a3a',
    codeTextColor: '#b57614',
    blockNoteTheme: 'light',
    cmTheme: cmThemes.gruvboxLight,
    dropdownBg: '#e8dcc3',
    dropdownBorder: '#d5c4a1',
    inputBg: 'rgba(0,0,0,0.04)',
    accentColor: '#0052cc',
  },
  'gruvbox-dark': {
    isDark: true,
    bgColor: '#282828',
    textColor: '#ebdbb2',
    headerBg: '#3c3836',
    codeColor: '#ebdbb2',
    codeTextColor: '#fe8019',
    blockNoteTheme: 'dark',
    cmTheme: cmThemes.gruvboxDark,
    dropdownBg: '#3c3836',
    dropdownBorder: '#504945',
    inputBg: 'rgba(255,255,255,0.06)',
    accentColor: '#579dff',
  },
  'tokyo-night-day': {
    isDark: false,
    bgColor: '#e1e2e7',
    textColor: '#343b58',
    headerBg: '#d5d6db',
    codeColor: '#343b58',
    codeTextColor: '#f52a65',
    blockNoteTheme: 'light',
    cmTheme: cmThemes.tokyoNightDay,
    dropdownBg: '#d5d6db',
    dropdownBorder: '#a8aecb',
    inputBg: 'rgba(0,0,0,0.04)',
    accentColor: '#0052cc',
  },
  orca: {
    isDark: true,
    bgColor: '#000000',
    textColor: '#e2e8f0',
    headerBg: '#09090b',
    codeColor: '#e2e8f0',
    codeTextColor: '#34d399',
    blockNoteTheme: 'dark',
    cmTheme: cmThemes.vscodeDark,
    dropdownBg: '#09090b',
    dropdownBorder: '#27272a',
    inputBg: 'rgba(255,255,255,0.03)',
    accentColor: '#10b981',
  },
};

export function resolveTheme(name: string): ThemePalette {
  return THEMES[name] ?? THEMES.light;
}
