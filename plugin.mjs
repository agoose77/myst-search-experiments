import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { globSync } from "glob";
import MiniSearch from "minisearch";
import { walk, SKIP, bisectLeft, resolveToTextPath } from "./utils.mjs";
import { sectionTransform } from "myst-to-jats";

const searchDirective = {
  name: "search",
  doc: "An example directive for searching.",
  arg: { type: String, doc: "Search string" },
  run(data) {
    const query = data.arg;
    const search = { type: "search", children: [], query };
    return [search];
  },
};

function makeASTDocument(nodes, documentDigest) {
  const toSectionedText = (content) => {
    const contexts = [];
    // Build separate corpus entries to preserve structure
    const pushContext = (heading) => {
      const index = contexts.length - 1;
      const headingInfo = heading
        ? {
            text: heading.children[0].value,
            id: heading["html-id"] || heading.identifier,
            index: index,
          }
        : {
            index: index,
          };
      contexts.push({
        heading: headingIno,
        accumulator: [],
      });
    };
    // Create section for root document
    pushContext(undefined);

    const visitor = (content, path) => {
      // Keep track of current heading
      if (content.type === "section") {
        pushContext(content);
      }
      // Don't add headings to corpus
      else if (content.type === "heading") {
        return SKIP;
      }
      // Add separator after paragraphs
      else if (content.type === "paragraph") {
        const context = contexts[contexts.length - 1];
        context.accumulator.push(" ");
      }
      // Literal nodes become text
      else if ("value" in content && content.value) {
        const context = contexts[contexts.length - 1];
        context.accumulator.push(content.value);
      }
    };
    walk(content, visitor);
    return contexts;
  };

  // Build array of contexts, each context pertaining to a section
  const contexts = toSectionedText(nodes);

  const headings = [];
  const corpusParts = [];
  const index = [];

  // Build array of headings, array of text parts, and array of stops into corpus
  let contextLength = 0;
  contexts.forEach((ctx) => {
    headings.push(ctx.heading?.id);

    ctx.accumulator.forEach((part) => {
      corpusParts.push(part);
      contextLength += part.length;
    });
    index.push(contextLength);
  });

  // Join text into corpus
  const corpus = corpusParts.join("");

  // Unique ID
  const digest = createHash("md5")
    .update(documentDigest)
    .update(corpus)
    .digest("hex");

  // Build document entry
  return {
    index,
    corpus,
    digest,
  };
}

const plugin = {
  name: "Full-text search",
  directives: [searchDirective],
  transforms: [
    {
      name: "create-search-index",
      stage: "document",
      plugin: (_, utils) => (ast) => {
        // Treat "name" field as frontmatter title AND opt-in to indexing
        const title = utils.select("block", ast)?.data?.name;
        // Assume unlabeled documents shouldn't be indexed
        if (!title) {
          return;
        }

        // Build digest
        const digest = createHash("md5")
          .update(JSON.stringify(ast))
          .digest("hex");

        // Lift headings
        const result = structuredClone(ast);
        sectionTransform(result);

        const toSectionedText = (content) => {
          const contexts = [];
          // Build separate corpus entries to preserve structure
          const pushContext = (heading) => {
            const index = contexts.length - 1;
            const headingInfo = heading
              ? {
                  text: heading.children[0].value,
                  id: heading["html-id"] || heading.identifier,
                  index: index,
                }
              : {
                  index: index,
                };
            contexts.push({
              heading: headingIno,
              accumulator: [],
            });
          };
          // Create section for root document
          pushContext(undefined);

          const visitor = (content, path) => {
            // Keep track of current heading
            if (content.type === "section") {
              pushContext(content);
            }
            // Don't add headings to corpus
            else if (content.type === "heading") {
              return SKIP;
            }
            // Add separator after paragraphs
            else if (content.type === "paragraph") {
              const context = contexts[contexts.length - 1];
              context.accumulator.push(" ");
            }
            // Literal nodes become text
            else if ("value" in content && content.value) {
              const context = contexts[contexts.length - 1];
              context.accumulator.push(content.value);
            }
          };
          walk(content, visitor);
          return contexts;
        };

        // Build array of contexts, each context pertaining to a section
        const contexts = toSectionedText(nodes);

        const headings = [];
        const corpusParts = [];
        const index = [];

        // Build array of headings, array of text parts, and array of stops into corpus
        let contextLength = 0;
        contexts.forEach((ctx) => {
          headings.push(ctx.heading?.id);

          ctx.accumulator.forEach((part) => {
            corpusParts.push(part);
            contextLength += part.length;
          });
          index.push(contextLength);
        });

        // Join text into corpus
        const corpus = corpusParts.join("");

        // Unique ID
        const digest = createHash("md5")
          .update(documentDigest)
          .update(corpus)
          .digest("hex");

        // Build document entry
        return {
          index,
          corpus,
          digest,
        };

        // Generate hash-content
        const index = {
          ast,
          digest,
          title,
          paragraphs,
          headings,
        };
        const data = JSON.stringify(index, null, 2);
        // Clear search index cache
        mkdirSync("_build/search", { recursive: true });
        writeFileSync(`_build/search/index-${digest}.json`, data);
      },
    },
    // TODO split by heading
    {
      name: "apply-search",
      stage: "document",
      plugin: (_, utils) => (node) => {
        const indexPaths = globSync("_build/search/index-*.json");
        const indices = indexPaths.map((p) => readFileSync(p)).map(JSON.parse);

        // Build search index
        const titleSearch = new MiniSearch({
          fields: ["title"],
          storeFields: ["digest", "title"],
          idField: "digest",
        });
        // Build search index
        const headingSearch = new MiniSearch({
          fields: ["corpus"],
          storeFields: ["digest", "corpus", "index", "fileDigest"],
          idField: "digest",
        });
        // Build search index
        const paragraphSearch = new MiniSearch({
          fields: ["corpus"],
          storeFields: ["digest", "corpus", "index"],
          idField: "digest",
        });

        // Build index
        const digestToAST = new Map();
        indices.forEach(({ ast, digest, title, headings, paragraphs }) => {
          titleSearch.add({ digest, title });
          headings.forEach((document) => {
            headingSearch.add({ fileDigest: digest, ...document });
          });
          paragraphs.forEach((document) => {
            paragraphSearch.add(document);
          });

          digestToAST.set(digest, ast);
        });

        // For each search node, perform query
        const searchNodes = utils.selectAll("search", node);
        searchNodes.forEach((node) => {
          const searchOptions = {
            fuzzy: 0.2,
            combineWith: "AND",
            boost: { title: 2 },
          };

          const searchResults = {
            title: titleSearch.search(node.query, searchOptions),
            heading: headingSearch.search(node.query, searchOptions),
            paragraph: paragraphSearch.search(node.query, searchOptions),
          };
          const renderResult = renderSearchResults(searchResults);

          const asideTitle = {
            type: "admonitionTitle",
            children: [{ type: "text", value: `Search for '${node.query}'` }],
          };
          const aside = {
            type: "aside",
            kind: "topic",
            children: [asideTitle, renderResult],
          };
          node.children = [aside];
        });
      },
    },
  ],
};

function text(content) {
  return { type: "text", value: content };
}
function strong(node) {
  return { type: "strong", children: node };
}

function image(url) {
  return { type: "image", url: url, height: "32px" };
}

function emphasiseMatches(matches, src) {
  // Split src into matched parts
  let cursor = 0;
  const fragments = [];
  for (const match of matches) {
    // assert(src === match[0]);

    // Split before current match
    if (match.index > cursor) {
      const nextCursor = match.index;
      const leadingFragment = src.slice(cursor, nextCursor);
      fragments.push(text(leadingFragment));
      cursor = nextCursor;
    }
    // Split match
    const strongFragment = src.slice(cursor, cursor + match[0].length);
    fragments.push(strong([text(strongFragment)]));
    cursor += match[0].length;
  }
  // Split after final match
  if (cursor !== src.length) {
    const trailingFragment = src.slice(cursor, src.length);
    fragments.push(text(trailingFragment));
  }
  return fragments;
}
const SPACE_OR_PUNCTUATION = /[\n\r\p{Z}\p{P}]+/gu;

function findTokenStarts(text) {
  const matches = Array.from(text.matchAll(SPACE_OR_PUNCTUATION));
  const starts = [];
  if (!matches.length) {
    return;
  }
  // Is the first delimiter *not* a leading separator?
  const [first, ...rest] = matches;
  if (first.index !== 0) {
    starts.push(0);
  } else {
    starts.push(first[0].length);
  }
  rest.forEach((m) => {
    const endIndex = m.index + m[0].length;
    // Is the final delimeter *not* a trailing separator?
    if (endIndex !== text.length) {
      starts.push(endIndex);
    }
  });
  return starts;
}
function findTokenStops(text) {
  const matches = Array.from(text.matchAll(SPACE_OR_PUNCTUATION));
  const stops = [];
  if (!matches.length) {
    return;
  }

  // Is the first delimiter *not* a leading separator?
  const [first, ...rest] = matches;
  if (first.index !== 0) {
    stops.push(first.index);
  }
  rest.forEach((m) => {
    stops.push(m.index);
  });
  const last = matches[matches.length - 1];
  if (last.index + last[0].length !== text.length) {
    stops.push(text.length);
  }
  return stops;
}

function maybeElideLeadingText(node, nBefore) {
  // Trim the leading text to `nBefore` tokens
  if (node["type"] === "text") {
    // Find all the word boundaries
    const starts = findTokenStarts(node.value);
    const nTokens = starts.length;
    console.log("leading", starts, nTokens, node.value.length);

    // If we want to take more than we are allowed
    if (nTokens > nBefore) {
      // Take up to nBefore tokens from this string
      const startIndex = nTokens - nBefore;
      const start = starts[startIndex];
      const elided = text(`... ${node.value.slice(start, node.value.length)}`);
      return { node: elided, nTokens: nBefore, elided: true };
    } else {
      return { node, nTokens, elided: false };
    }
  } else {
    return { node, nTokens: 1, elided: false };
  }
}

function maybeElideTrailingText(node, nAvailable) {
  if (node["type"] === "text") {
    const stops = findTokenStops(node.value);
    const nTokens = stops.length;

    if (nTokens > nAvailable) {
      const stop = stops[nAvailable - 1];
      const elided = text(`${node.value.slice(0, stop)} ...`);
      return { node: elided, nTokens: nAvailable, elided: true };
    } else {
      return { node, nTokens, elided: false };
    }
  } else {
    return { node, nTokens: 1, elided: false };
  }
}

function elideText(ast, nBefore, nMax) {
  const [first, ...rest] = ast;
  const { node: elidedFirst, nTokens } = maybeElideLeadingText(first, nBefore);

  let result = [elidedFirst];
  let tokenCount = nTokens;
  console.log({ tokenCount, elidedFirst });

  // Trim the rest of the match to `nMax` - `nBefore` tokens
  for (const node of rest) {
    const {
      node: elidedNode,
      nTokens: elidedTokens,
      elided,
    } = maybeElideTrailingText(node, nMax > tokenCount ? nMax - tokenCount : 0);
    console.log({ tokenCount, elidedTokens, node });
    result.push(elidedNode);
    tokenCount += elidedTokens;
    if (elided) {
      break;
    }
  }
  return result;
}

function matchSearchResult(result) {
  const { match, terms } = result;
  // Match from all keywords
  return (
    terms
      .map((term) => {
        // For each search term, build a case-insensitive regexp
        const pattern = new RegExp(`(${term})`, "gi");
        // Each `term` is matched against each `field` (only one field, `corpus` or `title`)
        return match[term]
          .map((field) => {
            // assert (fieldValue === title)
            const fieldValue = result[field];
            return Array.from(fieldValue.matchAll(pattern));
          })
          .flat();
      })
      .flat()
      // Sort across flattened list.
      .sort((l, r) => (l.index < r.index ? -1 : l.index > r.index ? +1 : 0))
  );
}

function renderSearchResults(searchResults) {
  // Handle file titles
  const matchedFiles = new Map(
    searchResults.title.map((result) => {
      const { digest, title } = result;

      // Match from all keywords
      const regexMatches = matchSearchResult(result);
      return [
        digest,
        {
          ast: elideText(emphasiseMatches(regexMatches, title), 3, 10),
          children: [],
        },
      ];
    }),
  );

  // Build array of sections that aren't grouped by file
  // at the same time as writing the grouped sections to their parent file
  const matchedSections = [];
  searchResults.heading.forEach((result) => {
    const { fileDigest, corpus } = result;
    const fileResult = matchedFiles.get(fileDigest);

    const regexMatches = matchSearchResult(result);
    const highlightedAST = elideText(
      emphasiseMatches(regexMatches, corpus),
      3,
      10,
    );
    if (fileResult !== undefined) {
      fileResult.children.push(highlightedAST);
    } else {
      matchedSections.push(highlightedAST);
    }
  });

  const matchedParagraphs = searchResults.paragraph.map((result) => {
    const { corpus } = result;

    const regexMatches = matchSearchResult(result);
    return elideText(emphasiseMatches(regexMatches, corpus), 3, 10);
  });
  console.log(JSON.stringify(matchedParagraphs, null, 2));

  const tableChildren = [
    ...matchedFiles.entries().map(([digest, { ast, children }]) => {
      return children.length
        ? {
            type: "tableRow",
            children: [
              {
                type: "tableCell",
                children: [
                  {
                    type: "table",
                    children: [
                      {
                        type: "tableRow",
                        children: [
                          {
                            type: "tableCell",
                            children: [image("icons/file.svg")],
                          },
                          { type: "tableCell", children: ast },
                        ],
                      },
                      ...children.map((child) => {
                        return {
                          type: "tableRow",
                          children: [
                            {
                              type: "tableCell",
                              children: [image("icons/hashtag.svg")],
                            },
                            { type: "tableCell", children: child },
                          ],
                        };
                      }),
                    ],
                  },
                ],
              },
            ],
          }
        : {
            type: "tableRow",
            children: [
              {
                type: "tableCell",
                children: ast,
              },
            ],
          };
    }),
    ...matchedSections.map((ast) => {
      return {
        type: "tableRow",
        children: [
          {
            type: "tableCell",
            children: [
              {
                type: "table",
                children: [
                  {
                    type: "tableRow",
                    children: [
                      {
                        type: "tableCell",
                        children: [image("icons/hashtag.svg")],
                      },
                      { type: "tableCell", children: ast },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
    }),
    ...matchedParagraphs.map((ast) => {
      return {
        type: "tableRow",
        children: [
          {
            type: "tableCell",
            children: [
              {
                type: "table",
                children: [
                  {
                    type: "tableRow",
                    children: [
                      {
                        type: "tableCell",
                        children: [image("icons/pen.svg")],
                      },
                      { type: "tableCell", children: ast },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
    }),
  ];
  //console.log(JSON.stringify(tableChildren, null, 2));
  return {
    type: "table",
    children: tableChildren,
  };
}

export default plugin;
