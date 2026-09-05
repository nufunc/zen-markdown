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

          // 블록(textblock) 단위로 인라인 텍스트를 이어 붙인 뒤 검색한다.
          // 텍스트 노드 하나씩 훑으면 굵게·링크 등 마크 경계에서 노드가 갈려
          // "the documentation" 같은 구절이 검색되지 않는다.
          newEditorState.doc.descendants((node, pos) => {
            if (!node.isTextblock) return true;

            let text = '';
            const charPos: number[] = [];
            node.forEach((child: any, offset: number) => {
              const base = pos + 1 + offset;
              if (child.isText && child.text) {
                let t: string = child.text;
                const normalized = t.normalize('NFC');
                // 정규화로 길이가 달라지면 위치 대응이 깨지므로 원문 그대로 쓴다
                if (normalized.length === t.length) t = normalized;
                for (let k = 0; k < t.length; k++) charPos.push(base + k);
                text += t;
              } else {
                // 이미지 등 인라인 원자 노드는 한 칸을 차지한다. 자리표시자로 경계를 만든다
                text += '￼';
                charPos.push(base);
              }
            });

            if (text) {
              regex.lastIndex = 0;
              let match: RegExpExecArray | null;
              while ((match = regex.exec(text)) !== null) {
                // 0길이 일치 무한 루프 방지
                if (match[0].length === 0) {
                  regex.lastIndex++;
                  continue;
                }
                const from = charPos[match.index];
                const lastIdx = match.index + match[0].length - 1;
                const to = charPos[lastIdx] + 1;
                if (from !== undefined && to !== undefined) {
                  matches.push({ from, to, matchText: match[0] });
                }
              }
            }
            // textblock 내부는 이미 훑었다
            return false;
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
