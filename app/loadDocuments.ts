import { toSectionedParts, type Section, buildCorpus } from "./utils.js";
import { remove } from "unist-util-remove";
export type SearchDocument = {
  sections: Section[];
  location: string;
  title: string;
};

const INDEX_NAMES = ["index", "main"];

async function loadPagesFromXref(baseURL: string) {
  const xrefURL = `${baseURL}/myst.xref.json`;
  console.log("Fetching", xrefURL);

  const xrefResponse = await fetch(xrefURL);
  const xrefData = await xrefResponse.json();
  const locations = xrefData.references
    .filter((r: { kind: string }) => r.kind === "page")
    .map((r: { data: string }) => `${baseURL}${r.data}`) as string[];

  return await Promise.all(
    locations.map(async (path) => {
      const response = await fetch(path);
      return await response.json();
    })
  );
}

export async function loadDocuments(baseURL: string): SearchDocument[] {
  const pages = await loadPagesFromXref(baseURL);
  return pages.map((doc) => {
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
    const headings = sections.map((sec) => sec.heading);
    const headingCorpus = buildCorpus(
      // Build array-of-one-part corpus for headings
      sections.map((s) => [s.heading?.text ?? ""]),
      { joinWith: " " }
    );
    const bodyCorpus = buildCorpus(sections.map(({ parts }) => parts));
    return {
      title,
      location: `${baseURL}/${INDEX_NAMES.includes(slug) ? "" : slug}`,
      headings,
      headingCorpus,
      bodyCorpus,
    };
  });
}
