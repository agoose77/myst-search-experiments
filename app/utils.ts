import type { GenericNode } from "myst-common";
import type { Heading } from "myst-spec";
import { toText } from "myst-common";
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

export type HeadingInfo = {
  text: string;
  depth: number;
  html_id?: string;
};

export type Section = {
  heading?: HeadingInfo;
  parts: string[];
};

export function toSectionedParts(content: GenericNode) {
  const sections: Section[] = [];
  const newSection = (heading?: Heading) => {
    const info = heading
      ? {
          text: toText(heading),
          depth: heading.depth,
          html_id: (heading as GenericNode).html_id ?? heading.identifier,
        }
      : undefined;
    sections.push({ heading: info, parts: [] });
  };
  newSection();
  const visit = (content: GenericNode) => {
    if (content.type === "heading" || content.type === "myst") {
      newSection(content as Heading);
      return SKIP;
    }
    const section = sections[sections.length - 1];

    // Literals are fused together
    if ("value" in content && content.value) {
      section.parts.push(content.value);
    }
    // Paragraphs are separated by newlines
    else if (content.type === "paragraph") {
      section.parts.push("\n");
    }
  };

  const depart = (content: GenericNode) => {
    if (content.type === "paragraph") {
      sections[sections.length - 1].parts.push("\n");
    }
  };
  walk(content, visit, depart);
  return sections;
}
