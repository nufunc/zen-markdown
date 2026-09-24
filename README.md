# Zen Markdown 📝

Minimalist & Aesthetic WYSIWYG Markdown Editor for Visual Studio Code. Experience a Notion-like block-based editing environment right inside your IDE!

## ✨ Features

* **WYSIWYG Block Editing**: Edit markdown like a modern block editor (powered by BlockNote). No more switching between source and preview.
* **Mermaid Support**: Visualize complex diagrams and flowcharts seamlessly within the editor. Mermaid is loaded on demand, so documents without diagrams open fast.
* **Image Paste & Drop**: Paste or drop images directly into the editor — they are saved to an `assets/` folder next to your document and linked with a relative path.
* **Find & Replace**: Use the native VS Code find widget (`Ctrl/Cmd + F`) or the built-in replace panel (`Ctrl/Cmd + H`).
* **Link Navigation**: `Ctrl/Cmd + Click` a link to follow it — relative `.md` links open in Zen Markdown, other files open in VS Code, and external URLs open in your browser.
* **Blank Line Preservation**: Two or more consecutive blank lines are shown as empty paragraphs in WYSIWYG mode and written back to your file unchanged.
* **Smart Table of Contents (TOC)**: Easily navigate long documents with a draggable, floating TOC.
* **Theme Support**: `auto` follows your VS Code light/dark theme, or pick a built-in theme (Nord, One Half Dark, Solarized Dark, Vintage).
* **Familiar Shortcuts**: Uses intuitive UpNote-style keyboard shortcuts for lightning-fast formatting:
  * `Cmd/Ctrl + 1~6`: Headings 1 to 6
  * `Cmd/Ctrl + 7`: Bulleted List
  * `Cmd/Ctrl + 8`: Numbered List
  * `Cmd/Ctrl + 9`: Task List (Checklist)
  * `Cmd/Ctrl + Shift + U`: Blockquote
* **Code Snippet Tools**: Clean syntax highlighting with a floating one-click copy button.
* **State Preservation**: Scroll position is kept when you switch tabs and come back — without holding the editor in memory.
* **Original Formatting Preserved**: Parts of the document you did not edit are written back exactly as they were.

## 🚀 Usage

1. Open any `.md` or `.llm.md` file in VS Code.
2. Click the **Open with Zen Markdown** button in the editor title bar, or right-click the file and select "Open With..." → "Zen Markdown".
3. To see or edit the Markdown source, click **Text Editor** in the editor header (or **Open with Text Editor** in the title bar). Read-only documents open in the block editor without editing.
4. Enjoy writing!

## ⚙️ Configuration

You can customize the editor in VS Code Settings (`Ctrl+,`):

| Setting | Default | Description |
| --- | --- | --- |
| `zenMarkdown.theme` | `auto` | Editor theme. `auto` syncs with the VS Code light/dark theme; or choose Nord, One Half Dark, Solarized Dark, Vintage, Gruvbox, Tokyo Night, Orca. |
| `zenMarkdown.fontSize` | `16` | Default font size (10~32). |
| `zenMarkdown.contentWidth` | `standard` | Editor content width: `narrow` (700px), `standard` (900px), `full` (100%). |
| `zenMarkdown.autoRefresh` | `true` | Refresh the editor automatically when the file changes externally. |
| `zenMarkdown.spellCheck` | `false` | Enable native spell checking. |
| `zenMarkdown.showWordCount` | `true` | Show word and character count badge in the header bar. |
| `zenMarkdown.showFormattingToolbar` | `true` | Show the rich formatting toolbar in WYSIWYG mode. |
| `zenMarkdown.showToc` | `false` | Show the Table of Contents by default. |

## ⚠️ Known Limitations

Parts you did not edit are saved exactly as in the original file. The items below only show up on screen, or when you edit that block. Use **Text Editor** for these.

| Limitation | Notes |
| --- | --- |
| Lists, heading markers, code fences and nested quotes inside a blockquote are shown flat | Editing that quote rewrites it flat |
| Table column alignment and link titles are dropped when you edit that table or link | |
| Indented (four-space) code blocks are shown as paragraphs; four leading spaces in a paragraph are dropped when you edit it | |
| Images and paragraphs after a blank line following a nested list, emphasis inside HTML comments, and strikethrough combined with code in table cells are not shown exactly | |
| Frontmatter is not shown in the block editor | It is kept as is; edit it in the text editor |

## 🛠️ Building from Source

```bash
# Install extension dependencies
npm install

# Install webview dependencies
cd webview && npm install && cd ..

# Build the webview UI
npm run build:webview

# Compile the extension
npm run compile

# Package into a .vsix file (requires: npm install -g @vscode/vsce)
vsce package
```

To run the webview regression tests:

```bash
cd webview && npm test
```

---
*Created for a better markdown writing experience in VS Code.*
