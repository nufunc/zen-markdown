import { createReactBlockSpec } from "@blocknote/react";
import { defaultProps } from "@blocknote/core";
import { useState, useEffect, useRef } from "react";
import mermaid from "mermaid";
import { Edit2, Check } from "lucide-react";

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
          const isDarkTheme = document.body.getAttribute('data-theme-dark') === 'true';
          mermaid.initialize({ startOnLoad: false, theme: isDarkTheme ? "dark" : "default" });
          // Generate a completely unique ID on every render to avoid "Diagram already exists" error
          const id = `mermaid-${props.block.id.replace(/-/g, '')}-${Math.random().toString(36).substring(2, 10)}`;
          containerRef.current.innerHTML = "";
          
          try {
            // Check syntax first to avoid Mermaid globally throwing and corrupting state
            mermaid.parse(code).then(async (isValid) => {
              if (isValid) {
                try {
                  const { svg } = await mermaid.render(id, code);
                  if (containerRef.current) {
                    containerRef.current.innerHTML = svg;
                  }
                } catch (renderError: any) {
                  if (containerRef.current) {
                    containerRef.current.innerHTML = `<div style="color:red; font-size:12px; padding: 10px;">Mermaid Render Error: ${renderError.message}</div>`;
                  }
                }
              }
            }).catch((parseError: any) => {
              if (containerRef.current) {
                containerRef.current.innerHTML = `<div style="color:red; font-size:12px; padding: 10px;">Syntax Error: ${parseError?.message || parseError || 'Unknown Error'}</div>`;
              }
            });
          } catch (e: any) {
             if (containerRef.current) {
                containerRef.current.innerHTML = `<div style="color:red; font-size:12px; padding: 10px;">Mermaid Error: ${e.message}</div>`;
             }
          }
        }
      }, [code, isEditing, props.block.id, themeTrigger]);

      return (
        <div style={{ position: "relative", width: "100%", border: "1px solid var(--dropdown-border, #ddd)", borderRadius: "8px", padding: "10px", margin: "10px 0", backgroundColor: "var(--bg-color, transparent)" }}>
          <div style={{ position: "absolute", top: "5px", right: "5px", zIndex: 10 }}>
            <button 
              onClick={() => setIsEditing(!isEditing)}
              style={{ background: "rgba(128,128,128,0.2)", color: "var(--text-color, #333)", border: "none", padding: "6px", borderRadius: "4px", cursor: "pointer", display: "flex", alignItems: "center" }}
              title={isEditing ? "View Diagram" : "Edit Mermaid Code"}
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
