# Neat MD Editor 📝

Neat & Aesthetic WYSIWYG Markdown Editor for Visual Studio Code. Experience a Notion-like block-based editing environment right inside your IDE!

## ✨ Features

* **WYSIWYG Block Editing**: Edit markdown like a modern block editor (powered by BlockNote). No more switching between source and preview.
* **Seamless Markdown Mode**: Toggle between WYSIWYG and Raw Markdown mode instantly.
* **Diff Viewer**: See exactly what changed in your markdown source with the built-in diff viewer.
* **Mermaid Support**: Visualize complex diagrams and flowcharts seamlessly within the editor.
* **Smart Table of Contents (TOC)**: Easily navigate long documents with a draggable, floating TOC.
* **VS Code Theme Sync**: Automatically matches your VS Code theme (Light, Dark, Nord, Solarized, etc.).
* **Familiar Shortcuts**: Uses intuitive UpNote-style keyboard shortcuts for lightning-fast formatting:
  * `Cmd/Ctrl + 1~6`: Headings 1 to 6
  * `Cmd/Ctrl + 7`: Bulleted List
  * `Cmd/Ctrl + 8`: Numbered List
  * `Cmd/Ctrl + 9`: Task List (Checklist)
  * `Cmd/Ctrl + Shift + U`: Blockquote
* **Code Snippet Tools**: Clean syntax highlighting with a floating one-click copy button.

## 🚀 Usage

1. Open any `.md` or `.llm.md` file in VS Code.
2. Click the **Open with Neat MD Editor** button in the top right editor menu, or right-click the file and select "Open With..." -> "Neat MD Editor".
3. Enjoy writing!

## ⚙️ Configuration

You can customize the editor in VS Code Settings (`Ctrl+,`):
* `neatMdEditor.theme`: Choose specific themes or leave as `auto` to sync with VS Code.
* `neatMdEditor.fontSize`: Set the default font size.
* `neatMdEditor.showToc`: Show/hide the Table of Contents by default.
* `neatMdEditor.autoFix`: Enable automatic Prettier formatting on save.

## 🛠️ Building from Source

```bash
# Install dependencies
npm install

# Build the webview UI
npm run build:webview

# Compile the extension
npm run compile

# Package into a .vsix file
vsce package
```

---
*Created for a better markdown writing experience in VS Code.*
