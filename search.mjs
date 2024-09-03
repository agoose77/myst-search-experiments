import Fuse from "fuse.js";
import { globSync } from "glob";
import { readFileSync } from "node:fs";

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

const options = {
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
  ignoreLocation: true,
  // Search in `author` and in `tags` array
  keys: ["corpus"],
};

const entryPaths = globSync("corpus*.json");
console.log(entryPaths);
const entries = entryPaths.map((p) => readFileSync(p)).map(JSON.parse);

const fuse = new Fuse(entries, options);

const results = fuse.search("CloudBank");
console.log(`Found ${results.length} separate results`);

results.forEach((result) => {
  const item = result.item;

  // Result matches has dimension [nKeys][nMatchPerKey]
  // Sort matches by longest match within text
  const resultItems = result.matches.map((match) => {
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
    return { nodes: matchMdast, text };
  });
  resultItems.forEach((item) => {
    console.log(item);
  });
});
