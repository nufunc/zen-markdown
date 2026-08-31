import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Extension } from '@tiptap/core';

export interface SearchState {
  query: string;
  matchCase: boolean;
  wholeWord: boolean;
  isRegex: boolean;
  regexError: string | null;
  activeIndex: number;
  matches: { from: number; to: number; matchText: string }[];
}

export const searchPluginKey = new PluginKey<SearchState>('searchHighlightPlugin');

export function createSearchPlugin(): Plugin<SearchState> {
  return new Plugin<SearchState>({
    key: searchPluginKey,
    state: {
      init(): SearchState {
        return {
          query: '',
          matchCase: false,
          wholeWord: false,
          isRegex: false,
          regexError: null,
          activeIndex: 0,
          matches: [],
        };
      },
      apply(tr, oldState, _oldEditorState, newEditorState): SearchState {
        const meta = tr.getMeta(searchPluginKey);
        let query = oldState.query;
        let matchCase = oldState.matchCase;
        let wholeWord = oldState.wholeWord;
        let isRegex = oldState.isRegex;
        let activeIndex = oldState.activeIndex;

        let metaChanged = false;
        if (meta) {
          if (meta.query !== undefined) {
            query = meta.query;
            metaChanged = true;
          }
          if (meta.matchCase !== undefined) {
            matchCase = meta.matchCase;
            metaChanged = true;
          }
          if (meta.wholeWord !== undefined) {
            wholeWord = meta.wholeWord;
            metaChanged = true;
          }
          if (meta.isRegex !== undefined) {
            isRegex = meta.isRegex;
            metaChanged = true;
          }
          if (meta.activeIndex !== undefined) {
            activeIndex = meta.activeIndex;
            metaChanged = true;
          }
        }

        if (!query) {
          return { query: '', matchCase, wholeWord, isRegex, regexError: null, activeIndex: 0, matches: [] };
        }

        const normalizedQuery = query.normalize('NFC');

        // 문서 내용이 변경되었거나 검색 메타데이터가 변경된 경우 매칭 재계산
        if (metaChanged || tr.docChanged) {
          const matches: { from: number; to: number; matchText: string }[] = [];
          const flags = matchCase ? 'g' : 'gi';
          let regex: RegExp;

          try {
            let pattern = normalizedQuery;
            if (!isRegex) {
              pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }
            if (wholeWord) {
              const boundaryLeft = /^\w/.test(pattern) ? '\\b' : '';
              const boundaryRight = /\w$/.test(pattern) ? '\\b' : '';
              pattern = `${boundaryLeft}${pattern}${boundaryRight}`;
            }
            regex = new RegExp(pattern, flags);
          } catch (err: any) {
            return {
              query,
              matchCase,
              wholeWord,
              isRegex,
              regexError: err?.message || 'Invalid regular expression',
              activeIndex: 0,
              matches: [],
            };
          }

          newEditorState.doc.descendants((node, pos) => {
            if (node.isText && node.text) {
              const text = node.text.normalize('NFC');
              regex.lastIndex = 0;
              let match: RegExpExecArray | null;
              while ((match = regex.exec(text)) !== null) {
                // 0길이 일치 무한 루프 방지
                if (match[0].length === 0) {
                  regex.lastIndex++;
                  continue;
                }
                const from = pos + match.index;
                const to = from + match[0].length;
                matches.push({ from, to, matchText: match[0] });
              }
            }
          });

          // activeIndex 경계 조건 검사
          if (matches.length === 0) {
            activeIndex = 0;
          } else if (activeIndex >= matches.length) {
            activeIndex = 0;
          } else if (activeIndex < 0) {
            activeIndex = matches.length - 1;
          }

          return { query, matchCase, wholeWord, isRegex, regexError: null, activeIndex, matches };
        }

        return oldState;
      },
    },
    props: {
      decorations(state) {
        const pluginState = searchPluginKey.getState(state);
        if (!pluginState || !pluginState.query || pluginState.matches.length === 0) {
          return DecorationSet.empty;
        }

        const decorations = pluginState.matches.map((m, index) => {
          const isActive = index === pluginState.activeIndex;
          return Decoration.inline(m.from, m.to, {
            class: isActive ? 'search-highlight search-highlight-active' : 'search-highlight',
          });
        });

        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

export const SearchHighlightExtension = Extension.create({
  name: 'searchHighlight',
  addProseMirrorPlugins() {
    return [createSearchPlugin()];
  },
});
