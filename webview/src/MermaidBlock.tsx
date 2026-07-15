/* eslint-disable react-hooks/rules-of-hooks */
import { createReactBlockSpec } from "@blocknote/react";
import { defaultProps } from "@blocknote/core";
import { useState, useEffect, useRef } from "react";
import { Edit2, Check } from "lucide-react";

// mermaid는 무거우므로(코어+cytoscape+katex 등) 첫 다이어그램 렌더링 시점에만 로드
let mermaidPromise: Promise<typeof import("mermaid")["default"]> | null = null;
const loadMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(m => m.default);
  }
  return mermaidPromise;
};

export const MermaidBlock = createReactBlockSpec(
  {
    type: "mermaid",
    propSchema: {
      textAlignment: defaultProps.textAlignment,
      textColor: defaultProps.textColor,
      code: {
        default: "graph TD;\n  A-->B;",
      },
    },
    content: "none",
  },
  {
    render: (props) => {
      const [isEditing, setIsEditing] = useState(false);
      const [themeTrigger, setThemeTrigger] = useState(0);
      const containerRef = useRef<HTMLDivElement>(null);
      const code = props.block.props.code;

      useEffect(() => {
        const handler = () => setThemeTrigger(t => t + 1);
        window.addEventListener('theme-changed', handler);
        return () => window.removeEventListener('theme-changed', handler);
      }, []);

      useEffect(() => {
        if (!isEditing && containerRef.current && code) {
          let cancelled = false;
          const isDarkTheme = document.body.getAttribute('data-theme-dark') === 'true';
          // Generate a completely unique ID on every render to avoid "Diagram already exists" error
          const id = `mermaid-${props.block.id.replace(/-/g, '')}-${Math.random().toString(36).substring(2, 10)}`;

          // 에러 메시지는 사용자 코드가 포함될 수 있으므로 textContent로 넣어 마크업 주입 차단
          const showError = (prefix: string, e: any) => {
            if (cancelled || !containerRef.current) return;
            const div = document.createElement('div');
            div.style.cssText = 'color: #e5534b; font-size: 12px; padding: 10px; white-space: pre-wrap;';
            div.textContent = `${prefix}: ${e?.message || e || 'Unknown Error'}`;
            containerRef.current.replaceChildren(div);
          };

          loadMermaid().then(async (mermaid) => {
            if (cancelled || !containerRef.current) return;
            mermaid.initialize({ startOnLoad: false, theme: isDarkTheme ? "dark" : "default" });
            containerRef.current.replaceChildren();
            try {
              // Check syntax first to avoid Mermaid globally throwing and corrupting state
              const isValid = await mermaid.parse(code);
              if (isValid) {
                const { svg } = await mermaid.render(id, code);
                if (!cancelled && containerRef.current) {
                  // svg는 mermaid가 내부적으로 dompurify 새니타이즈를 거친 결과물
                  containerRef.current.innerHTML = svg;
                }
              }
            } catch (e: any) {
              showError('Mermaid Error', e);
            }
          }).catch((e: any) => {
            showError('Failed to load Mermaid', e);
          });

          return () => { cancelled = true; };
        }
      }, [code, isEditing, props.block.id, themeTrigger]);

      return (
        <div style={{ position: "relative", width: "100%", border: "1px solid var(--dropdown-border, #ddd)", borderRadius: "8px", padding: "10px", margin: "10px 0", backgroundColor: "var(--bg-color, transparent)" }}>
          <div style={{ position: "absolute", top: "5px", right: "5px", zIndex: 10 }}>
            <button 
              onClick={() => setIsEditing(!isEditing)}
              style={{ background: "rgba(128,128,128,0.2)", color: "var(--text-color, #333)", border: "none", padding: "6px", borderRadius: "4px", cursor: "pointer", display: "flex", alignItems: "center" }}
              data-tooltip={isEditing ? "View Diagram" : "Edit Mermaid Code"}
              data-tooltip-pos="right"
            >
              {isEditing ? <Check size={14} /> : <Edit2 size={14} />}
            </button>
          </div>
          
          {isEditing ? (
            <textarea
              value={code}
              onChange={(e) => props.editor.updateBlock(props.block, { type: "mermaid", props: { code: e.target.value } })}
              style={{ width: "100%", minHeight: "150px", fontFamily: "monospace", padding: "8px", border: "1px solid var(--dropdown-border, #ccc)", borderRadius: "4px", backgroundColor: "var(--input-bg, #fff)", color: "var(--text-color, #000)", marginTop: "24px" }}
              autoFocus
            />
          ) : (
            <div ref={containerRef} style={{ width: "100%", minHeight: "50px", display: "flex", justifyContent: "center", alignItems: "center", overflowX: "auto", paddingTop: "20px" }}>
              <div style={{ color: "#888", fontSize: "12px" }}>Loading diagram...</div>
            </div>
          )}
        </div>
      );
    },
  }
);
