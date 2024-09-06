import type { GenericNode, GenericParent } from "myst-common";
export const SKIP = () => {};

type Visit = (content: GenericNode, path: string) => typeof SKIP | void;
type Depart = (content: GenericNode, path: string) => void;

function visitNode(
  content: GenericNode,
  visit: Visit,
  depart: Depart | undefined,
  path: string
) {
  const result = visit(content, path);
  if (result !== undefined && result === SKIP) {
    return;
  }
  if ("children" in content && content.children) {
    visitNodeArray(content.children, visit, depart, `${path}.`);
  }

  depart?.(content, path);
}

function visitNodeArray(
  content: GenericNode[],
  visit: Visit,
  depart: Depart | undefined,
  path: string
) {
  content.forEach((n, i) => {
    visitNode(n, visit, depart, `${path}${i}`);
  });
}

export function walk(
  content: GenericNode,
  visit: Visit,
  depart?: Depart,
  basePath?: string
) {
  const path = basePath ?? "$";
  if (Array.isArray(content)) {
    visitNodeArray(content, visit, depart, path);
  } else {
    visitNode(content, visit, depart, path);
  }
}

export function toText(content: GenericNode, basePath?: string) {
  const accumulator: string[] = [];
  const visit = (content: GenericNode, path: string) => {
    if (content.type === "heading" || content.type === "code" || content.type === "inlineCode") {
      return SKIP;
    }
    if ("value" in content && content.value) {
      accumulator.push(content.value );
    }
  };

  const depart = (content: GenericNode, path: string) => {
    if (content.type === "paragraph") {
      accumulator.push("\n" );
    }
  };
  walk(content, visit, depart, basePath);
  return accumulator.join("");
}

export function bisectLeft(
  array: number[],
  value: number,
  _low?: number,
  _high?: number
) {
  let low = _low ?? 0;
  let high = _high ?? array.length;
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

export function resolveToTextPath(ast: Record<string, any>, path: string) {
  const parts = path
    .slice(2)
    .split(".")
    .map((value: string) => parseInt(value));
  let node = ast;
  for (let op of parts) {
    node = node.children[op];
  }
  return node;
}
