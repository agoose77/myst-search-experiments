import MiniSearch, {
  type Options,
  type SearchResult as RawSearchResult,
} from "minisearch";
export const SEARCH_ATTRIBUTES_ORDERED = [
  "hierarchy.lvl1",
  "hierarchy.lvl2",
  "hierarchy.lvl3",
  "hierarchy.lvl4",
  "hierarchy.lvl5",
  "hierarchy.lvl6",
  "$content",
] as const;

export const SPACE_OR_PUNCTUATION = /[\n\r\p{Z}\p{P}]+/gu;
export function extractField(document: any, fieldName: string) {
  // $ indicates ordered
  if (fieldName.startsWith("$")) {
    fieldName = fieldName.slice(1);
  }
  // Access nested fields
  return fieldName.split(".").reduce((doc, key) => doc && doc[key], document);
}

export function extendDefaultOptions(options: Options): Options {
  const defaultOptions = {
    tokenize: MiniSearch.getDefault("tokenize"),
    processTerm: MiniSearch.getDefault("processTerm"),
  };
  return { ...defaultOptions, ...options };
}

export function createSearch(
  documents: SearchDocument[],
  options: Options
): MiniSearch {
  const search = new MiniSearch(options);
  search.addAll(documents);
  return search;
}

export type Query = {
  term: string; // Raw search query term
  matches: RawSearchResult["match"]; // Match results (match token -> fields[])
};

export type SearchResult = {
  id: RawSearchResult["id"];
  queries: Query[];
};

export function combineResults(
  results: Map<string, Map<string, RawSearchResult>>
) {
  const queryTerms = Array.from(results.keys());
  const [firstEntry, ...restEntries] = results.entries();

  const [firstTerm, firstRawResults] = firstEntry;
  const initialValue = new Map<string, SearchResult>(
    Array.from(firstRawResults.entries(), ([id, rawResult]) => {
      const { score, terms, queryTerms, match, ...rest } = rawResult;
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

      const [term, rawResults] = value;
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
