import { selectAll } from "unist-util-select";
import { toText } from "./utils.js";

export async function loadDocuments(baseURL: string) {
  const xrefURL = `${baseURL}/myst.xref.json`
;
console.log("Fetchgin", xrefURL)
  const xrefData = await (await fetch(xrefURL)).json();
  const locations = xrefData.references
    .filter((r: { kind: string }) => r.kind === "page")
    .map((r: { data: string }) => `${baseURL}${r.data}`) as string[];

  return await Promise.all(
    locations.map(async (path) => {
      const data = await (await fetch(path)).text();
      const doc = JSON.parse(data);
      const { mdast, location, frontmatter } = doc;
      const headings = selectAll("heading", mdast)
        .map((h) => h.children[0].value)
        .filter((h) => h);
      const title = frontmatter.title;
      const body = toText(mdast);
      return { headings, body, title, location };
    })
  );
}
