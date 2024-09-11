import type { Query, SearchResult } from "./search.js";
import { extractField, SPACE_OR_PUNCTUATION } from "./search.js";

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

function queryPairProximity(
  record: SearchResult,
  left: Query,
  right: Query,
  bound: number
): number {
  let bestProximity = bound;
  // For each term in the left query
  for (const [leftTerm, leftFields] of Object.entries(left.matches)) {
    const leftPattern = new RegExp(`\\b${leftTerm}\\b`, "gi");
    // For each field matched with this left term
    for (const leftField of leftFields) {
      // Pull out the left field content
      const content = extractField(record, leftField);
      // For each term in the right query
      for (const [rightTerm, rightFields] of Object.entries(right.matches)) {
        const rightPattern = new RegExp(`\\b${rightTerm}\\b`, "gi");
        // For each field matched with this right term
        for (const rightField of rightFields) {
          // Terms matching different fields can never be better than the bound
          if (leftField !== rightField) {
            continue;
          }
          // Math each content with the appropriate pattern
          const leftMatches = content.matchAll(leftPattern);
          const rightMatches = content.matchAll(rightPattern);

          for (const leftMatch of leftMatches) {
            for (const rightMatch of rightMatches) {
              const [start, stop] =
                leftMatch.index < rightMatch.index
                  ? [leftMatch.index, rightMatch.index]
                  : [rightMatch.index, leftMatch.index];
              const separators = Array.from(
                content.slice(start, stop).matchAll(SPACE_OR_PUNCTUATION)
              ).length;
              // Fast-path, can never beat 1!
              if (separators === 1) {
                return 1;
              }
              if (separators < bestProximity) {
                bestProximity = separators;
              }
            }
          }
        }
      }
    }
  }
  return bestProximity;
}

function wordsProximity(result: SearchResult, bound: number) {
  const { queries } = result;
  let proximity = 0;
  for (let i = 0; i < queries.length - 1; i++) {
    const left = queries[i];
    const right = queries[i + 1];

    proximity += queryPairProximity(result, left, right, bound);
  }
  return Math.min(proximity, bound);
}
function matchedAttributes(result: SearchResult): string[] {
  return Array.from(
    new Set(result.queries.flatMap((query) => Object.values(query.matches).flat()))
  );
}

function matchedAttribute(result: SearchResult): number {
  const matched = matchedAttributes(result);
  return SEARCH_ATTRIBUTES_ORDERED.find((attribute) =>
    matched.includes(attribute)
  );
}

function matchedWords(result: SearchResult) {
  const allMatches = result.queries.flatMap((query) =>
    Object.entries(query.matches).flatMap(([match, fields]) => {
      // TODO check the tokenizer behaviour here
      const pattern = new RegExp(`\\b${match}\\b`, "gi");
      return fields.flatMap((field) => {
        const value = extractField(result, field);
        return Array.from(value.matchAll(pattern)).map((m) => m[0]);
      });
    })
  );
  const uniqueMatches = new Set(allMatches);
  return uniqueMatches.size;
}

function matchedExactWords(result: SearchResult) {
  const allMatches = result.queries.flatMap(
    // For each query (foo bar baz -> foo, then bar, then baz)
    (query) =>
      Object.entries(query.matches)
        .flatMap(
          // For each (match, matched fields) pair in the query matches
          ([match, fields]) => {
            // TODO check the tokenizer behaviour here
            const pattern = new RegExp(`\\b${match}\\b`, "gi");
            return fields.flatMap(
              // For each matched field
              (field) => {
                // Retrieve corpus and test for pattern
                const value = extractField(result, field);
                return Array.from(value.matchAll(pattern)).map((m) =>
                  m ? query.term : undefined
                );
              }
            );
          }
        )
        .filter((item) => item)
  );
  const uniqueMatches = new Set(allMatches);
  return uniqueMatches.size;
}

export type ExtendedSearchResult = SearchResult & {
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
      proximity: wordsProximity(result, 8), // TODO
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

export type SearchResult = SearchRecord & {
  match: Record<string, string[]>;
  terms: string[];
};

export function rankAndFilterResults(results: SearchResult[]): SearchResult[] {
  return results.map(extendSearchRanking).sort(cmpRanking);
}
