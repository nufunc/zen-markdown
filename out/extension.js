"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const llmEditorProvider_1 = require("./llmEditorProvider");
function activate(context) {
    context.subscriptions.push(llmEditorProvider_1.LLMAssistEditorProvider.register(context));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map