import mermaid from 'mermaid';
async function test() {
  try {
    await mermaid.parse("flowchart TB\n A <===> B");
    console.log("VALID: <===>");
  } catch (e) {
    console.error("ERROR <===>:", e.message);
  }

  try {
    await mermaid.parse("flowchart TB\n A <==> B");
    console.log("VALID: <==>");
  } catch (e) {
    console.error("ERROR <==>:", e.message);
  }

  try {
    await mermaid.parse('flowchart TB\n A -. "text" .- B');
    console.log("VALID: -. text .-");
  } catch (e) {
    console.error("ERROR -. text .-:", e.message);
  }
}
test();
