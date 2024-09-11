
import { type SearchRecord } from "./loadDocuments.js";
export const SEARCH_ATTRIBUTES_ORDERED = [
  "hierarchy.lvl1",
  "hierarchy.lvl2",
  "hierarchy.lvl3",
  "hierarchy.lvl4",
  "hierarchy.lvl5",
  "hierarchy.lvl6",
  "content",
] as const;

const TYPE_WEIGHTS = new Map([
  ["lvl1", 90],
  ["lvl2", 80],
  ["lvl3", 70],
  ["lvl4", 60],
  ["lvl5", 50],
  ["lvl6", 40],
  ["content", 0],
]);

/**
function singlePairProximity(left: string, right: string): number {

}

function wordsProximity(words: string[]) {
  let proximity = 0;
  for (let i=0; i < words.length - 1; i++) {
    const left = words[i];
    const right = words[i+1];

    proximity += singlePairProximity(left, right);
  } 
}
*/

function cmp(left: number, right: number): number {
  if (left < right) {
    return -1;
  } else if (left > right) {
    return +1;
  } else {
    return 0;
  }
}

function matchedAttributes(result: SearchResult): string[] {
  return Array.from(
    new Set(result.terms.map((term) => result.match[term]).flat())
  );
}

function matchedAttribute(result: SearchResult): number {
  const matched = matchedAttributes(result);
  return SEARCH_ATTRIBUTES_ORDERED.find((attribute) =>
    matched.includes(attribute)
  );
}

export function extractField(document, fieldName: string) {
  // Access nested fields
  return fieldName.split(".").reduce((doc, key) => doc && doc[key], document);
}

function matchedWords(result: SearchResult) {
  const allMatches = result.terms
    .map((term) => {
      // TODO check the tokenizer behaviour here
      const pattern = new RegExp(`\\b${term}\\b`, "gi");
      return result.match[term]
        .map((field) => {
          const value = extractField(result, field);
          return Array.from(value.matchAll(pattern)).map((m) => m[0]);
        })
        .flat();
    })
    .flat();
  const uniqueMatches = new Set(allMatches);
  return uniqueMatches.size;
}

function matchedExactWords(result: SearchResult) {
  const attributes = matchedAttributes(result);
  const allMatches = result.queryTerms
    .map((term) => {
      // TODO check the tokenizer behaviour here
      const pattern = new RegExp(`\\b${term}\\b`, "gi");
      return attributes
        .map((field) => {
          const value = extractField(result, field);
          return Array.from(value.matchAll(pattern)).map((m) =>
            m ? term : undefined
          );
        })
        .flat();
    })
    .flat()
    .filter((item) => item);
  const uniqueMatches = new Set(allMatches);
  return uniqueMatches.size;
}

type ExtendedSearchResult = SearchResult & {
  ranking: {
    words: number;
    attribute: SEARCH_ATTRIBUTES_ORDERED[number];
    proximity: number;
    exact: number;
    level: number;
    position: number;
  };
};

function extendSearchRanking(result: SearchResult): ExtendedSearchResult {
  return {
    ...result,
    ranking: {
      words: 0, // matchedWords(result), NOT USED for AND
      attribute: matchedAttribute(result),
      proximity: 8, // TODO
      exact: matchedExactWords(result),
      level: TYPE_WEIGHTS.get(result.type),
      position: result.position,
    },
  };
}

function cmpRanking(left: ExtendedSearchResult, right: ExtendedSearchResult) {
  const leftRank = left.ranking;
  const rightRank = right.ranking;

  if (leftRank.words !== rightRank.words) {
    // Invert result
    return cmp(rightRank.words, leftRank.words);
  }
  if (leftRank.attribute !== rightRank.attribute) {
    const i = SEARCH_ATTRIBUTES_ORDERED.findIndex(
      (item) => item === leftRank.attribute
    );
    const j = SEARCH_ATTRIBUTES_ORDERED.findIndex(
      (item) => item === rightRank.attribute
    );

    return cmp(i, j);
  }
  if (leftRank.level !== rightRank.level) {
    return cmp(rightRank.level, leftRank.level);
  }
  if (leftRank.position !== rightRank.position) {
    return cmp(leftRank.position, rightRank.position);
  }

  return 0;
}

function resultIsAND(queryTokens: string[]): (result: SearchResult) => boolean {
  return (result) => result.queryTerms.length === queryTokens.length;
}

export const SPACE_OR_PUNCTUATION = /[\n\r\p{Z}\p{P}]+/gu;

export type SearchResult = SearchRecord & {
  match: Record<string, string[]>;
  terms: string[];
};

export function rankAndFilterResults(
  results: SearchResult[],
  queryTokens: string[]
): SearchResult[] {
  const filterAND = resultIsAND(queryTokens);

  return (
    results
      // Only take results that matched all tokens (AND) _somewhere_ in the document fields
      .filter(filterAND)
      .map(extendSearchRanking)
      .sort(cmpRanking)
  );
}
