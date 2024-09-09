import {
  toSectionedParts,
  type Section,
  buildCorpus,
} from "./utils.js";
import { remove } from "unist-util-remove";
export type SearchDocument = {
  sections: Section[];
  location: string;
  title: string;
};

const INDEX_NAMES = ["index", "main"];
export async function loadDocuments(baseURL: string): SearchDocument[] {
  const xrefURL = `${baseURL}/myst.xref.json`;
  console.log("Fetching", xrefURL);
  const xrefData = await (await fetch(xrefURL)).json();
  const locations = xrefData.references
    .filter((r: { kind: string }) => r.kind === "page")
    .map((r: { data: string }) => `${baseURL}${r.data}`) as string[];

  return await Promise.all(
    locations.map(async (path) => {
      const data = await (await fetch(path)).text();
      const doc = JSON.parse(data);
      const { mdast, slug, frontmatter } = doc;
      const title = frontmatter.title;

      // Remove heading-like nodes
      remove(mdast, [
        "code",
        "inlineCode",
        "myst",
        "admonitionTitle",
        "cardTitle",
      ]);

      // Group by section
      const sections = toSectionedParts(mdast);
      const headings = sections.map(sec => sec.heading);
      const headingCorpus = buildCorpus(
        // Build array-of-one-part corpus for headings
        sections.map((s) => [s.heading?.text ?? '']),
	{ joinWith: ' ' }
      );
      const bodyCorpus = buildCorpus(
        sections.map(({ parts }) => parts)
      );
      return {
        title,
        location: `${baseURL}/${INDEX_NAMES.includes(slug) ? "" : slug}`,
        headings,
        headingCorpus,
        bodyCorpus,
      };
    })
  );
}
