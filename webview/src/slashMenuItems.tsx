// 슬래시(/) 메뉴에 더하는 항목: 날짜, Mermaid 다이어그램, 팁 인용
const insertDateItem = (editor: any) => ({
  title: "Insert Date",
  onItemClick: () => {
    const now = new Date();
    const dateString = now.toLocaleString();
    editor.insertBlocks(
      [
        {
          type: "paragraph",
          content: dateString,
        },
      ],
      editor.getTextCursorPosition().block,
      "after"
    );
  },
  aliases: ["date", "time", "now"],
  group: "Utilities",
  icon: <span style={{ fontSize: '16px' }}>📅</span>,
  subtext: "Insert current date and time",
});

const insertMermaidItem = (editor: any) => ({
  title: "Mermaid Diagram",
  onItemClick: () => {
    editor.insertBlocks(
      [
        {
          type: "mermaid",
          props: {
            code: "graph TD;\n    A-->B;\n    A-->C;\n    B-->D;\n    C-->D;"
          }
        },
      ],
      editor.getTextCursorPosition().block,
      "after"
    );
  },
  aliases: ["mermaid", "flowchart", "diagram"],
  group: "Custom",
  icon: <span style={{ fontSize: '16px' }}>📈</span>,
  subtext: "Insert a Mermaid flowchart",
});

const insertCalloutItem = (editor: any) => ({
  title: "Callout / Tip",
  onItemClick: () => {
    editor.insertBlocks(
      [
        {
          type: "quote",
          content: "💡 **Tip**: ",
        },
      ],
      editor.getTextCursorPosition().block,
      "after"
    );
  },
  aliases: ["callout", "tip", "info", "warning"],
  group: "Custom",
  icon: <span style={{ fontSize: '16px' }}>💡</span>,
  subtext: "Insert a highlighted callout block",
});

export const customSlashMenuItems = (editor: any) => [insertDateItem(editor), insertMermaidItem(editor), insertCalloutItem(editor)];
