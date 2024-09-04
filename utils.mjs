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

export function toText(content) {
  const accumulator = [];
  if (Array.isArray(content)) {
    toTextArray(content, accumulator, "$");
  } else {
    toTextNode(content, accumulator, "$");
  }
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
