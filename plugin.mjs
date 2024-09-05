import { writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { globSync } from "glob";
import MiniSearch from "minisearch";
import { toText, bisectLeft, resolveToTextPath } from "./utils.mjs";
import { highlightLiteralMatch } from "./highlight.mjs";

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

const plugin = {
  name: "Full-text search",
  directives: [searchDirective],
  transforms: [
    {
      name: "create-search-index",
      stage: "document",
      plugin: (_, utils) => (node) => {
        // Treat "name" field as frontmatter title AND opt-in to indexing
        const title = utils.select("block", node)?.data?.name;
        // Assume unlabeled documents shouldn't be indexed
        if (!title) {
          return;
        }
        // Convert AST tree to flat array of text-path items
        const parts = toText(node);

        // Join text into corpus
        const corpus = parts.map((item) => item.content).join("");

        // Build array of stops indicating end-boundary of each text part
        const cumSum = (
          (sum) => (value) =>
            (sum += value)
        )(0);

        // Build index containing paths and stops
        const index = parts.map((item) => {
          const stop = cumSum(item.content.length);
          return { path: item.path, stop };
        });

        // Build document entry
        const entry = {
          title,
          index,
          corpus,
          ast: node,
        };
        // Generate hash-content
        const data = JSON.stringify(entry, null, 2);
        // Build digest
        const digest = createHash("md5").update(data).digest("hex");
        // Clear search index cache
        rmSync("_build/search", { force: true, recursive: true });
        mkdirSync("_build/search", { recursive: true });
        // Write data _and_ digest to file (prefer path to digest)
        const writeData = JSON.stringify({ digest, ...entry }, null, 2);
        writeFileSync(`_build/search/corpus-${digest}.json`, writeData);
      },
    },
    // TODO split by heading
    {
      name: "apply-search",
      stage: "document",
      plugin: (_, utils) => (node) => {
        const entryPaths = globSync("_build/search/corpus*.json");
        const entries = entryPaths.map((p) => readFileSync(p)).map(JSON.parse);

        // Build search index
        const miniSearch = new MiniSearch({
          fields: ["title", "corpus"],
          storeFields: ["title", "corpus", "ast", "index"],
          idField: "digest",
        });
        miniSearch.addAll(entries);

        // For each search node, perform query
        const searchNodes = utils.selectAll("search", node);
        searchNodes.forEach((node) => {
          const searchResults = miniSearch.search(node.query, {
            fuzzy: 0.2,
            combineWith: "AND",
            boost: { title: 2 },
          });

          const renderResults = [];

          searchResults.forEach((result) => {
            const { title, ast, index, digest } = result;

            // Build array of stops and paths in index
            const stops = index.map((x) => x.stop);
            const paths = index.map((x) => x.path);

            result.terms.forEach((term) => {
              // For each search term, build a case-insensitive regexp
              const pattern = new RegExp(`(${term})`, "gi");
              // For each true match
              result.match[term].forEach((field) => {
                const fieldValue = result[field];
                switch (field) {
                  case "title":
                    const titleMatches = fieldValue.matchAll(pattern);
                    titleMatches.forEach((match) => {
                      const titleNode = {
                        type: "text",
                        value: fieldValue,
                      };
                      const nodes = highlightLiteralMatch(
                        [titleNode],
                        0,
                        fieldValue.length,
                        match,
                      );

                      renderResults.push({
                        title,
                        digest,
                        nodes,
                        field,
                        text: match[0],
                      });
                    });
                    break;
                  case "corpus":
                    // Find term in corpus
                    const corpusMatches = fieldValue.matchAll(pattern);
                    corpusMatches.forEach((match) => {
                      const start = match.index;
                      const stop = match.index + match[0].length;
                      // Locate AST node that contributed the text fragment to the search
                      // corpus that spans fragStart <= start < fragStop
                      const startIndex = bisectLeft(stops, start);
                      const stopIndex = bisectLeft(stops, stop + 1);
                      const matchPaths = paths.slice(startIndex, stopIndex + 1);
                      const matchMdast = matchPaths.map((p) =>
                        resolveToTextPath(ast, p),
                      );

                      // Print result
                      const nodes = highlightLiteralMatch(
                        matchMdast,
                        stops[startIndex - 1] ?? 0,
                        stops[stopIndex],
                        match,
                      );
                      renderResults.push({
                        title,
                        digest,
                        nodes,
                        field,
                        text: match[0],
                      });
                    });
                    //			const nodes = highlightMatchedNodes
                    break;
                  default:
                    throw new Error("unexpected case");
                    break;
                }
              });
            });
          });
          const tableChildren = renderResults.map(({ title, field, nodes }) => {
            return {
              type: "tableRow",
              children: [
                {
                  type: "tableCell",
                  children: [
                    {
                      type: "text",
                      value: title,
                    },
                  ],
                },
                {
                  type: "tableCell",
                  children: [
                    {
                      type: "text",
                      value: field,
                    },
                  ],
                },
                {
                  type: "tableCell",
                  children: nodes,
                },
              ],
            };
          });
          const table = {
            type: "table",
            children: [
              {
                type: "tableRow",
                children: [
                  {
                    type: "tableCell",
                    header: true,
                    children: [
                      {
                        type: "text",
                        value: "Title",
                      },
                    ],
                  },
                  {
                    type: "tableCell",
                    header: true,
                    children: [
                      {
                        type: "text",
                        value: "Kind",
                      },
                    ],
                  },

                  {
                    type: "tableCell",
                    header: true,
                    children: [
                      {
                        type: "text",
                        value: "Result",
                      },
                    ],
                  },
                ],
              },
              ...tableChildren,
            ],
          };
          const asideTitle = {
            type: "admonitionTitle",
            children: [{ type: "text", value: `Search for '${node.query}'` }],
          };
          const aside = {
            type: "aside",
            kind: "topic",
            children: [asideTitle, table],
          };
          node.children = [aside];
        });
      },
    },
  ],
};

export default plugin;
