import type { Heading } from 'myst-spec';
import type { Block } from 'myst-spec-ext';
import type { GenericParent } from 'myst-common';
export type Options = Record<string, unknown>;
export type Section = Omit<Heading, 'type'> & {
    type: 'section';
    meta?: string;
};
export declare function headingsToSections(tree: GenericParent | Block): void;
//# sourceMappingURL=index.d.ts.map