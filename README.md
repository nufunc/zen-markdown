# NeatMark Editor 📝

Neat & Aesthetic WYSIWYG Markdown Editor for Visual Studio Code. Experience a Notion-like block-based editing environment right inside your IDE!

## ✨ Features

* **WYSIWYG Block Editing**: Edit markdown like a modern block editor (powered by BlockNote). No more switching between source and preview.
* **Seamless Markdown Mode**: Toggle between WYSIWYG and Raw Markdown mode instantly. Your scroll position follows you across mode switches.
* **Git Diff Viewer**: In Raw Markdown mode, compare your current document against the last committed version (Git `HEAD`) side by side.
* **Mermaid Support**: Visualize complex diagrams and flowcharts seamlessly within the editor. Mermaid is loaded on demand, so documents without diagrams open fast.
* **Image Paste & Drop**: Paste or drop images directly into the editor — they are saved to an `assets/` folder next to your document and linked with a relative path.
* **Find & Replace**: Use the native VS Code find widget (`Ctrl/Cmd + F`) or the built-in replace panel (`Ctrl/Cmd + H`).
* **Link Navigation**: `Ctrl/Cmd + Click` a link to follow it — relative `.md` links open in NeatMark Editor, other files open in VS Code, and external URLs open in your browser.
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
* **State Preservation**: Scroll position and editing mode are kept when you switch tabs and come back — without holding the editor in memory.

## 🚀 Usage

1. Open any `.md` or `.llm.md` file in VS Code.
2. Click the **Open with NeatMark Editor** button in the editor title bar, or right-click the file and select "Open With..." → "NeatMark Editor".
3. To go back to the plain text editor, click the **Open with Text Editor** button in the title bar.
4. Enjoy writing!

## ⚙️ Configuration

You can customize the editor in VS Code Settings (`Ctrl+,`):

| Setting | Default | Description |
| --- | --- | --- |
| `neatMdEditor.theme` | `auto` | Editor theme. `auto` syncs with the VS Code light/dark theme; or choose Nord, One Half Dark, Solarized Dark, Vintage. |
| `neatMdEditor.fontSize` | `16` | Default font size. |
| `neatMdEditor.autoFix` | `false` | Automatically format the document with Prettier as you edit. |
| `neatMdEditor.autoRefresh` | `true` | Refresh the editor automatically when the file changes externally. |
| `neatMdEditor.showToc` | `false` | Show the Table of Contents by default. |
| `neatMdEditor.showProperties` | `false` | Show the Document Properties (frontmatter) panel by default. |

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
