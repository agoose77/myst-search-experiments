import type { GenericNode } from "myst-common";
import type { Heading } from "myst-spec";
import { toText } from "myst-common";
export const SKIP = () => { };

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
	const accumulator: Section[] = [];
	const newSection = (heading?: Heading) => {
		const info = heading
			? {
				text: toText(heading),
				depth: heading.depth,
				html_id: (heading as GenericNode).html_id ?? heading.identifier,
			}
			: undefined;
		accumulator.push({ heading: info, parts: [] });
	};
	newSection();
	const visit = (content: GenericNode) => {
		if (content.type === "heading") {
			newSection(content as Heading);
			return SKIP;
		}
		if ("value" in content && content.value) {
			accumulator[accumulator.length - 1].parts.push(content.value);
		}
	};

	const depart = (content: GenericNode) => {
		if (content.type === "paragraph") {
			accumulator[accumulator.length - 1].parts.push("\n");
		}
	};
	walk(content, visit, depart);
	return accumulator;
}

export type Corpus = {
	text: string;
	stops: number[];
};

export function buildCorpus(
	corpusParts: string[][],
	options: { joinWith?: string }
): Corpus {
	// Build array of headings, array of text parts, and array of stops into corpus
	let contextLength = 0;
	const flatParts: string[] = [];
	const stops: number[] = [];
	corpusParts.forEach((parts, index) => {
		// For each part (array of strings), extend the running array of strings and keep
		// track of stop indices
		parts.forEach((part) => {
			flatParts.push(part);
			contextLength += part.length;
		});
		if (
			// Is this part non-empty?
			(stops[stops.length - 1] ?? 0) !== contextLength &&
			// Is there a custom delimeter?
			options?.joinWith &&
			// Is this _not_ the final part?
			index !== corpusParts.length - 1
		) {
			flatParts.push(options.joinWith);
			contextLength += options.joinWith.length;
		}
		stops.push(contextLength);
	});

	// Join text into corpus
	const text = flatParts.join("");
	return {
		text,
		stops,
	};
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
	for (const op of parts) {
		node = node.children[op];
	}
	return node;
}
