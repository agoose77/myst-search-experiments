import { toSectionedParts, type Section } from "./utils.js";
import { remove } from "unist-util-remove";

/**
 * Load MyST site page data from a website deployed with myst.xref.json
 *
 * @param baseURL - base URL of the MyST site.
 */
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

export type RecordHierarchy = {
  lvl1: string;
  lvl2?: string;
  lvl3?: string;
  lvl4?: string;
  lvl5?: string;
  lvl6?: string;
};

type HeadingLevel = "lvl1" | "lvl2" | "lvl3" | "lvl4" | "lvl5" | "lvl6";

export type SearchRecord = {
  type: "content" | HeadingLevel;
  content: string;
  hierarchy: Heirarchy;
  url: string;

  position: number;
  id: string;
};

const INDEX_NAMES = ["index", "main"];

function sectionToHeadingLevel(heading: HeadingInfo | undefined): HeadingLevel {
  if (!heading) {
    return "lvl1";
  }
  switch (heading.depth) {
    case 2:
      return "lvl2";
    case 3:
      return "lvl3";
    case 4:
      return "lvl4";
    case 5:
      return "lvl5";
    case 6:
      return "lvl6";
    default:
      throw new Error(`unknown heading depth: ${heading.depth}`);
  }
}

function buildHierarchy(
  title: string,
  sections: Section,
  index: number
): RecordHierarchy {
  const result: RecordHierarchy = { lvl1: title };
  let currentDepth = 100;

  // The first section is always the title section
  for (let i = index; i > 0; i--) {
    const { heading } = sections[i];
    if (heading.depth >= currentDepth) {
      continue;
    }
    const lvl = sectionToHeadingLevel(heading);

    result[lvl] = heading.text!;
    currentDepth = heading.depth;
  }
  return result;
}

export async function loadDocuments(baseURL: string): SearchRecord[] {
  const pages = await loadPagesFromXref(baseURL);
  return pages
    .map((doc) => {
      const { mdast, slug, frontmatter } = doc;
      const title = frontmatter.title;

      // Remove heading-like nodes
      remove(mdast, [
        "code",
        //"inlineCode",
        "myst",
        "admonitionTitle",
        "cardTitle",
	(node) => node.type === "tableCell" && node?.header
      ]);

      // Group by section (simple running accumulator)
      const sections = toSectionedParts(mdast);
      const pageURL = `${baseURL}/${INDEX_NAMES.includes(slug) ? "" : slug}`;
      if (title?.includes("Math")) {
        console.log(sections.map((sec) => sec.heading));
      }

      // Build sections into search records
      return sections
        .map((section, index) => {
          const hierarchy = buildHierarchy(title, sections, index);
          const lvl = sectionToHeadingLevel(section.heading);
          const recordURL = section.heading
            ? section.heading.html_id
              ? `${pageURL}#${section.heading.html_id}`
              : `${pageURL}`
            : pageURL;
          const recordOffset = index * 2;
          return [
            {
              hierarchy,
              content: "",
              type: lvl,
              url: recordURL,
              position: 2 * index,
              id: `${pageURL}#${recordOffset}`,
            },
            {
              hierarchy,
              content: section.parts.join(""),
              type: "content",
              url: recordURL,
              position: 2 * index + 1,
              id: `${pageURL}#${recordOffset + 1}`,
            },
          ];
        })
        .flat();
    })
    .flat();
}
