// prosemirror-highlight(0.15.3)의 createHighlightPlugin을 대신한다. vite.config.ts의 alias가
// BlockNote의 `import { createHighlightPlugin } from "prosemirror-highlight"`을 이 파일로 돌린다.
//
// 원본은 문서가 바뀔 때마다 모든 코드 블록의 장식으로 DecorationSet.create를 다시 해서,
// 코드 블록이 많은 문서에서는 코드 블록이 아닌 문단에 입력해도 키마다 수백 ms가 걸렸다.
// 여기서는 이전 장식 집합을 옮긴 뒤 바뀐 범위에 걸친 코드 블록의 장식만 갈아 끼운다.
// 인자와 parser 계약은 원본과 같다. BlockNote를 올릴 때 원본의 apply가 바뀌었는지 확인한다.
import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

type Parser = (options: { content: string; language?: string; pos: number; size: number }) =>
  Decoration[] | Promise<void>;

interface Options {
  parser: Parser;
  nodeTypes?: string[];
  languageExtractor?: (node: PMNode) => string | undefined;
}

interface State {
  decorations: DecorationSet;
  promises: Promise<void>[];
}

const REFRESH_META = 'prosemirror-highlight-refresh';

export function createHighlightPlugin({
  parser,
  nodeTypes = ['code_block', 'codeBlock'],
  languageExtractor = (node) => node.attrs.language,
}: Options) {
  const key = new PluginKey<State>('prosemirror-highlight');
  const isCodeBlock = (node: PMNode) => node.type.inlineContent && nodeTypes.includes(node.type.name);

  /** 코드 블록 하나를 하이라이트한다. 언어 모듈이 아직 없으면 parser가 Promise를 돌려준다. */
  const highlight = (node: PMNode, pos: number, decorations: Decoration[], promises: Promise<void>[]) => {
    try {
      const parsed = parser({ content: node.textContent, language: languageExtractor(node) || undefined, pos, size: node.nodeSize });
      if (Array.isArray(parsed)) decorations.push(...parsed);
      else if (parsed instanceof Promise) promises.push(parsed);
    } catch (error) {
      console.error('[prosemirror-highlight] Error parsing code block:', error);
    }
  };

  const full = (doc: PMNode): State => {
    const decorations: Decoration[] = [];
    const promises: Promise<void>[] = [];
    doc.descendants((node, pos) => {
      if (!isCodeBlock(node)) return true;
      highlight(node, pos, decorations, promises);
      return false;
    });
    return { decorations: DecorationSet.create(doc, decorations), promises };
  };

  /** 트랜잭션이 새 문서에서 건드린 범위. step 맵이 아니라 두 문서를 직접 비교한다.
   *  속성만 바꾸는 AttrStep(언어 변경)은 맵이 비어 있어 step 맵으로는 잡히지 않기 때문이다.
   *  공유된 하위 트리는 동일성 비교로 건너뛰므로 비용은 바뀐 곳 크기에 비례한다. */
  const changedRanges = (tr: Transaction): [number, number][] => {
    const start = tr.before.content.findDiffStart(tr.doc.content);
    if (start === null) return [];
    const end = tr.before.content.findDiffEnd(tr.doc.content);
    const b = end ? end.b : start;
    return [[Math.min(start, b), Math.max(start, b)]];
  };

  const incremental = (tr: Transaction, prev: State): State => {
    const doc = tr.doc;
    let set = prev.decorations.map(tr.mapping, doc);
    const seen = new Set<number>();
    const stale: Decoration[] = [];
    const fresh: Decoration[] = [];
    const promises: Promise<void>[] = [];
    for (const [from, to] of changedRanges(tr)) {
      doc.nodesBetween(Math.max(0, from), Math.min(doc.content.size, to), (node, pos) => {
        if (!isCodeBlock(node)) return true;
        if (!seen.has(pos)) {
          seen.add(pos);
          stale.push(...set.find(pos, pos + node.nodeSize));
          highlight(node, pos, fresh, promises);
        }
        return false;
      });
    }
    if (stale.length) set = set.remove(stale);
    if (fresh.length) set = set.add(doc, fresh);
    return { decorations: set, promises };
  };

  return new Plugin<State>({
    key,
    state: {
      init: (_, instance) => full(instance.doc),
      apply: (tr, prev) => {
        // 언어 모듈을 다 받은 뒤의 갱신은 어느 블록이 기다렸는지 모르므로 전체를 다시 계산한다
        if (tr.getMeta(REFRESH_META)) return full(tr.doc);
        if (!tr.docChanged) return { decorations: prev.decorations.map(tr.mapping, tr.doc), promises: prev.promises };
        return incremental(tr, prev);
      },
    },
    view: (view) => {
      const pending = new Set<Promise<void>>();
      const refresh = () => {
        if (pending.size > 0 || view.isDestroyed) return;
        view.dispatch(view.state.tr.setMeta(REFRESH_META, true));
      };
      const check = () => {
        for (const promise of key.getState(view.state)?.promises ?? []) {
          if (pending.has(promise)) continue;
          pending.add(promise);
          promise.then(() => {
            pending.delete(promise);
            refresh();
          }).catch((error) => {
            console.error('[prosemirror-highlight] Error resolving parser:', error);
            pending.delete(promise);
          });
        }
      };
      check();
      return { update: check };
    },
    props: {
      decorations(state) {
        return key.getState(state)?.decorations;
      },
    },
  });
}
