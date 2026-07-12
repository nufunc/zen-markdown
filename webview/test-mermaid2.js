import mermaid from 'mermaid';
async function test() {
  try {
    const valid = await mermaid.parse("graph TD\nA-->B");
    console.log("VALID:", valid);
  } catch (e) {
    console.error("ERROR:", e);
  }
}
test();
