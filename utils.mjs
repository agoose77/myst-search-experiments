export const SKIP = () => {};

function visitNode(content, visitor, path) {
  const result = visitor(content, path);
  if (result !== undefined && result === SKIP) {
    return;
  }
  if ("value" in content) {
    return;
  } else if ("children" in content && content.children) {
    visitNodeArray(content.children, visitor, `${path}.`);
  }
}

function visitNodeArray(content, visitor, path) {
  content.forEach((n, i) => {
    visitNode(n, visitor, `${path}${i}`);
  });
}

export function walk(content, visitor, basePath) {
  const path = basePath ?? "$";
  if (Array.isArray(content)) {
    visitNodeArray(content, visitor, path);
  } else {
    visitNode(content, visitor, path);
  }
}

export function toText(content, basePath) {
  const accumulator = [];
  const visitor = (content, path) => {
    if ("value" in content && content.value) {
      accumulator.push({ path, content: content.value });
    }
  };
  walk(content, visitor, basePath);
  return accumulator;
}

export function bisectLeft(array, value, low, high) {
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

export function resolveToTextPath(ast, path) {
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
