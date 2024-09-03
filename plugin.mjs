import { writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { globSync } from "glob";
import Fuse from "fuse.js";

function toTextNode(content, accumulator, path) {
  if ("value" in content && content.value) {
    accumulator.push({ path, content: content.value });
    return;
  } else if ("children" in content && content.children) {
    toTextArray(content.children, accumulator, `${path}.`);
  }
}
function toTextArray(content, accumulator, path) {
  content.forEach((n, i) => {
    toTextNode(n, accumulator, `${path}${i}`);
  });
}
function toText(content) {
  const accumulator = [];
  if (Array.isArray(content)) {
    toTextArray(content, accumulator, "$");
  } else {
    toTextNode(content, accumulator, "$");
  }
  return accumulator;
}
function bisectLeft(array, value, low, high) {
  low = low ?? 0;
  high = high ?? array.length;
  let midpoint;
  while (low < high) {
    midpoint = (low + high) >> 1;
    if (array[midpoint] < value) {
      low = midpoint + 1;
    } else {
      high = midpoint;
    }
  }
  return low;
}

function dereferencePath(ast, path) {
  const parts = path
    .slice(2)
    .split(".")
    .map((value) => parseInt(value));
  let node = ast;
  for (let op of parts) {
    node = node.children[op];
  }
  return node;
}
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

function filterSearchAST(results) {
  return results
    .map((result) => {
      const item = result.item;

      // Result matches has dimension [nKeys][nMatchPerKey]
      // Sort matches by longest match within text
      return result.matches.map((match) => {
        // Find the largest highlight of the match
        const [largestSpan] = [...match.indices]
          .map((item, i) => [item, i])
          .reduce((acc, value) => {
            const [accSpan] = acc;
            const accWidth = accSpan[1] - accSpan[0];

            const [span] = value;
            const width = span[1] - span[0];

            return width > accWidth ? value : acc;
          });

        // Identify bounding span of match
        const [start, stop] = largestSpan;

        // Locate AST node that contributed the text fragment to the search
        // corpus that spans fragStart <= start < fragStop
        const stops = item.index.map((x) => x.stop);
        const paths = item.index.map((x) => x.path);

        const startIndex = bisectLeft(stops, start);
        const stopIndex = bisectLeft(stops, stop + 1);
        const matchPaths = paths.slice(startIndex, stopIndex + 1);
        const matchMdast = matchPaths.map((p) => dereferencePath(item.ast, p));

        // Print result
        const text = item.corpus.slice(start, stop + 1);
        const highlighted = highlightMatchedNodes(
          matchMdast,
          stops[startIndex - 1] ?? 0,
          stops[stopIndex],
          start,
          stop + 1,
        );
        return { title: item.title, nodes: highlighted, text };
      });
    })
    .flat();
}

function highlightMatchedNodes(ast, nodeStart, nodeStop, start, stop) {
  // Special case match only in single node;
  switch (ast.length) {
    case 1:
      const [node] = ast;
      return [
        { type: "text", value: node.value.slice(0, start - nodeStart) },
        {
          type: "strong",
          children: [
            {
              type: "text",
              value: node.value.slice(start - nodeStart, stop - nodeStart),
            },
          ],
        },
        {
          type: "text",
          value: node.value.slice(stop - nodeStart, node.value.length),
        },
      ];
      break;
    case 0:
      return [];
    default:
      const [first, ...tail] = ast;
      const interior = tail.slice(0, tail.length - 1);
      const last = tail[tail.length - 1];

      const lastStart = nodeStop - last.value.length;
      const tailLength = stop - nodeStop;
      return [
        { type: "text", value: first.value.slice(0, start - nodeStart) },
        {
          type: "strong",
          children: [
            {
              type: "text",
              value: first.value.slice(start - nodeStart, first.value.length),
            },
          ],
        },
        ...interior,
        {
          type: "strong",
          children: [
            {
              type: "text",
              value: last.value.slice(0, stop - lastStart),
            },
          ],
        },
        {
          type: "text",
          value: last.value.slice(stop - lastStart, last.value.length),
        },
      ];
  }
}

const plugin = {
  name: "Full-text search",
  directives: [searchDirective],
  transforms: [
    {
      name: "create-search-index",
      stage: "document",
      plugin: (_, utils) => (node) => {
        const parts = toText(node);
        const corpus = parts.map((item) => item.content).join("");
        const title = utils.select("block", node)?.data?.name;
        // Assume unlabeled documents shouldn't be indexed
        if (!title) {
          return;
        }

        const cumSum = (
          (sum) => (value) =>
            (sum += value)
        )(0);
        const index = parts.map((item) => {
          const stop = cumSum(item.content.length);
          return { path: item.path, stop };
        });
        const entry = {
          title,
          index,
          corpus,
          ast: node,
        };
        const data = JSON.stringify(entry, null, 2);
        const digest = createHash("md5").update(data).digest("hex");

        rmSync("_build/search", { force: true, recursive: true });
        mkdirSync("_build/search", { recursive: true });
        writeFileSync(`_build/search/corpus-${digest}.json`, data);
      },
    },
    {
      name: "apply-search",
      stage: "document",
      plugin: (_, utils) => (node) => {
        const entryPaths = globSync("_build/search/corpus*.json");
        const entries = entryPaths.map((p) => readFileSync(p)).map(JSON.parse);

        const searchNodes = utils.selectAll("search", node);

        const options = {
          includeScore: true,
          includeMatches: true,
          minMatchCharLength: 2,
          ignoreLocation: true,
          // Search in `author` and in `tags` array
          keys: ["corpus"],
        };

        const fuse = new Fuse(entries, options);
        searchNodes.forEach((node) => {
          const results = fuse.search(node.query);
          const tableChildren = filterSearchAST(results).map(
            ({ title, nodes }) => {
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
                    children: nodes,
                  },
                ],
              };
            },
          );

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
            children: [
		    { type: "text", value: `Search for '${node.query}'` }],
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
