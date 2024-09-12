import { toSectionedParts, type Section, type HeadingInfo } from "./utils.js";
import { remove } from "unist-util-remove";

/**
 * Load MyST site page data from a website deployed with myst.xref.json
 *
 * @param url - URL of the MyST site.
 */
async function loadPagesFromXref(url: URL) {
  const xrefURL = new URL(`myst.xref.json`, url);
  console.log("Fetching", xrefURL);

  const xrefResponse = await fetch(xrefURL);
  const xrefData = await xrefResponse.json();
  const pages = xrefData.references.filter(
    (r: { kind: string }) => r.kind === "page"
  );
  const locations = pages.map(
    (r: { data: string }) => new URL(r.data.slice(1), url)
  ) as URL[];
  return await Promise.all(
    locations.map(async (path) => {
      const response = await fetch(path);
      return await response.json();
    })
  );
}

export type RecordHierarchy = {
  lvl1?: string;
  lvl2?: string;
  lvl3?: string;
  lvl4?: string;
  lvl5?: string;
  lvl6?: string;
};

export type HeadingLevel = keyof RecordHierarchy;

export type SearchRecord = {
  hierarchy: RecordHierarchy;
  url: URL;

  position: number;
  id: string;
} & (
  | {
      type: HeadingLevel;
    }
  | {
      type: "content";
      "$content": string;
    }
);

const INDEX_NAMES = ["index", "main"];

/**
 * Determine the "level" of a heading as a literal type
 *
 * @param heading - heading info object
 */
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

/**
 * Build a RecordHierarchy object describing the hierarchy of headings
 * in an array of appearance-ordered sections.
 *
 * @param title - document title
 * @param sections - array of section
 * @param index - current section position
 */
function buildHierarchy(
  title: string | undefined,
  sections: Section[],
  index: number
): RecordHierarchy {
  const result: RecordHierarchy = { lvl1: title };
  let currentDepth = 100;

  // The first section is always the title section
  for (let i = index; i > 0; i--) {
    const { heading } = sections[i];
    if (heading === undefined) {
      throw new Error();
    }
    if (heading.depth >= currentDepth) {
      continue;
    }
    const lvl = sectionToHeadingLevel(heading);

    result[lvl] = heading.text!;
    currentDepth = heading.depth;
  }
  return result;
}

/**
 * Build array of search records from a deployed MyST site
 *
 * @param url - the base URL of the MyST site
 */
export async function searchRecordsFromXrefs(
  url: URL
): Promise<SearchRecord[]> {
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  const pages = await loadPagesFromXref(url);
  return pages
    .map((doc) => {
      const { mdast, slug, frontmatter } = doc;
      const title = frontmatter?.title;

      // Remove heading-like nodes
      remove(mdast, [
        //"inlineCode",
        "myst",
      ]);

      // Group by section (simple running accumulator)
      const sections = toSectionedParts(mdast);
      const pageURL = new URL(INDEX_NAMES.includes(slug) ? "" : slug, url);
      // Build sections into search records
      return sections
        .map((section, index) => {
          const hierarchy = buildHierarchy(title, sections, index);

          const recordURL = new URL(pageURL);
          if (section.heading?.html_id) {
            recordURL.hash = `#${section.heading.html_id}`;
          }

          const recordOffset = index * 2;
          return [
            {
              hierarchy,
              type: sectionToHeadingLevel(section.heading),
              url: recordURL,
              position: 2 * index,
              id: `${pageURL}#${recordOffset}`,
            },
            {
              hierarchy,
              "$content": section.parts.join(""),
              type: "content" as SearchRecord["type"],
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
