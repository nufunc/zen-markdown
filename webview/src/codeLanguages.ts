import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language';

// @codemirror/language-data 전체(레거시 모드 100여 개) 대신 주요 언어만 등록.
// load는 dynamic import이므로 실제 사용 시점에만 해당 청크가 로드된다.
export const codeLanguages: LanguageDescription[] = [
  LanguageDescription.of({
    name: 'JavaScript',
    alias: ['js', 'jsx', 'mjs', 'cjs'],
    load: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true })),
  }),
  LanguageDescription.of({
    name: 'TypeScript',
    alias: ['ts', 'tsx'],
    load: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true, typescript: true })),
  }),
  LanguageDescription.of({
    name: 'Python',
    alias: ['py'],
    load: () => import('@codemirror/lang-python').then(m => m.python()),
  }),
  LanguageDescription.of({
    name: 'JSON',
    load: () => import('@codemirror/lang-json').then(m => m.json()),
  }),
  LanguageDescription.of({
    name: 'HTML',
    alias: ['htm'],
    load: () => import('@codemirror/lang-html').then(m => m.html()),
  }),
  LanguageDescription.of({
    name: 'CSS',
    load: () => import('@codemirror/lang-css').then(m => m.css()),
  }),
  LanguageDescription.of({
    name: 'Java',
    load: () => import('@codemirror/lang-java').then(m => m.java()),
  }),
  LanguageDescription.of({
    name: 'C++',
    alias: ['c', 'cpp', 'cc', 'h', 'hpp', 'csharp', 'cs'],
    load: () => import('@codemirror/lang-cpp').then(m => m.cpp()),
  }),
  LanguageDescription.of({
    name: 'Rust',
    alias: ['rs'],
    load: () => import('@codemirror/lang-rust').then(m => m.rust()),
  }),
  LanguageDescription.of({
    name: 'Go',
    alias: ['golang'],
    load: () => import('@codemirror/lang-go').then(m => m.go()),
  }),
  LanguageDescription.of({
    name: 'SQL',
    load: () => import('@codemirror/lang-sql').then(m => m.sql()),
  }),
  LanguageDescription.of({
    name: 'XML',
    alias: ['svg'],
    load: () => import('@codemirror/lang-xml').then(m => m.xml()),
  }),
  LanguageDescription.of({
    name: 'YAML',
    alias: ['yml'],
    load: () => import('@codemirror/lang-yaml').then(m => m.yaml()),
  }),
  LanguageDescription.of({
    name: 'PHP',
    load: () => import('@codemirror/lang-php').then(m => m.php()),
  }),
  LanguageDescription.of({
    name: 'Shell',
    alias: ['sh', 'bash', 'zsh'],
    load: () => import('@codemirror/legacy-modes/mode/shell').then(m => new LanguageSupport(StreamLanguage.define(m.shell))),
  }),
  LanguageDescription.of({
    name: 'PowerShell',
    alias: ['ps1', 'ps'],
    load: () => import('@codemirror/legacy-modes/mode/powershell').then(m => new LanguageSupport(StreamLanguage.define(m.powerShell))),
  }),
  LanguageDescription.of({
    name: 'Dockerfile',
    alias: ['docker'],
    load: () => import('@codemirror/legacy-modes/mode/dockerfile').then(m => new LanguageSupport(StreamLanguage.define(m.dockerFile))),
  }),
  LanguageDescription.of({
    name: 'Ruby',
    alias: ['rb'],
    load: () => import('@codemirror/legacy-modes/mode/ruby').then(m => new LanguageSupport(StreamLanguage.define(m.ruby))),
  }),
  LanguageDescription.of({
    name: 'Swift',
    load: () => import('@codemirror/legacy-modes/mode/swift').then(m => new LanguageSupport(StreamLanguage.define(m.swift))),
  }),
  LanguageDescription.of({
    name: 'Kotlin',
    alias: ['kt'],
    load: () => import('@codemirror/legacy-modes/mode/clike').then(m => new LanguageSupport(StreamLanguage.define(m.kotlin))),
  }),
];
