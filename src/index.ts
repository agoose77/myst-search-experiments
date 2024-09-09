import type { Parent, Heading } from 'myst-spec';
import type { Block } from 'myst-spec-ext';
import type { GenericParent } from 'myst-common';
export type Options = Record<string, unknown>;
export type Section = Omit<Heading, 'type'> & { type: 'section'; meta?: string };


export function headingsToSections(tree: GenericParent | Block) {
  const stack: Section[] = [];
  const children: Parent[] = [];
  function push(child: any) {
    const top = stack[stack.length - 1];
    if (top) {
      top.children.push(child);
    } else {
      children.push(child);
    }
  }

  function newSection(heading: Heading) {
    const { enumerator, enumerated, ...filtered } = heading;
    const next: Section = { ...filtered, type: 'section', children: [] };
    while (stack[stack.length - 1] && stack[stack.length - 1].depth >= heading.depth) stack.pop();
    push(next);
    stack.push(next);
    return { enumerator, enumerated };
  }
  tree.children?.forEach((child) => {
    if (child.type === 'heading') {
      const { enumerator, enumerated } = newSection(child as Heading);
      push({ type: 'heading', enumerator, enumerated, children: child.children });
    } else {
      push(child);
    }
  });
  tree.children = children as any;
}

