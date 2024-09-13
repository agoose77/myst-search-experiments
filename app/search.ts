import MiniSearch, {
  type Options,
  type SearchResult as MiniSearchResult,
} from "minisearch";
import { SearchRecord } from "./loadDocuments";
export const SEARCH_ATTRIBUTES_ORDERED = [
  "hierarchy.lvl1",
  "hierarchy.lvl2",
  "hierarchy.lvl3",
  "hierarchy.lvl4",
  "hierarchy.lvl5",
  "hierarchy.lvl6",
  "content",
] as const;

export type ExtendedOptions = Options &
  Required<Pick<Options, "tokenize" | "processTerm">>;
export const SPACE_OR_PUNCTUATION = /[\n\r\p{Z}\p{P}]+/gu;
export function extractField(
  document: Record<string, unknown>,
  fieldName: string
) {
  // Access nested fields
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return fieldName.split(".").reduce((doc, key) => doc && doc[key], document);
}

export function extendDefaultOptions(options: Options): ExtendedOptions {
  const defaultOptions = {
    tokenize: MiniSearch.getDefault("tokenize"),
    processTerm: MiniSearch.getDefault("processTerm"),
  };
  return { ...defaultOptions, ...options };
}

export function createSearch(
  documents: SearchRecord[],
  options: Options
): MiniSearch {
  const search = new MiniSearch(options);
  search.addAll(documents.map((doc, index) => ({ ...doc, id: index })));
  return search;
}

export type Query = {
  term: string; // Raw search query term
  matches: RawSearchResult["match"]; // Match results (match token -> fields[])
};

export type RawSearchResult = SearchRecord & MiniSearchResult;

export type SearchResult = SearchRecord & {
  id: RawSearchResult["id"];
  queries: Query[];
};

export function combineResults(
  results: Map<string, Map<string, RawSearchResult>>
) {
  const [firstEntry, ...restEntries] = results.entries();

  const firstRawResults = firstEntry[1];
  const initialValue = new Map<string, SearchResult>(
    Array.from(firstRawResults.entries(), ([id, rawResult]) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _, score, terms, queryTerms, match, ...rest } = rawResult;
      return [
        id,
        {
          id,
          queries: [
            {
              term: queryTerms[0],
              matches: match,
            },
          ],
          ...rest,
        },
      ];
    })
  );
  const mergedResults = restEntries.reduce(
    (
      accumulator: Map<string, SearchResult>,
      value: [string, Map<string, RawSearchResult>]
    ) => {
      const nextAccumulator = new Map<string, SearchResult>();

      const rawResults = value[1];
      rawResults.forEach((rawResult, docID) => {
        const existing = accumulator.get(docID);
        if (existing == null) {
          return;
        }
        const { queryTerms, match } = rawResult;
        existing.queries.push({
          term: queryTerms[0],
          matches: match,
        });
        nextAccumulator.set(docID, existing);
      });
      return nextAccumulator;
    },
    initialValue
  );
  return Array.from(mergedResults.values());
}
