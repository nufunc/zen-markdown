import mermaid from 'mermaid';
async function test() {
  try {
    await mermaid.parse('flowchart TB\n A["label"] --> B');
    console.log("VALID: label");
  } catch (e) {
    console.error("ERROR label:", e.message);
  }
}
test();
