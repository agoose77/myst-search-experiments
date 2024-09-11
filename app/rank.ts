import type { Query, SearchResult } from "./search.js";
import {
  extractField,
  SPACE_OR_PUNCTUATION,
  SEARCH_ATTRIBUTES_ORDERED,
} from "./search.js";

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
              const numSeparators = Array.from(
                content.slice(start, stop).matchAll(SPACE_OR_PUNCTUATION)
              ).length;
              // Fast-path, can never beat 1!
              if (numSeparators === 1) {
                return 1;
              }
              if (numSeparators < bestProximity) {
                bestProximity = numSeparators;
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
    new Set(
      result.queries.flatMap((query) => Object.values(query.matches).flat())
    )
  );
}

function matchedAttributePosition(result: SearchResult): number {
  // Build mapping from fields to terms matching that field
  const fieldToTerms = new Map();
  result.queries.forEach((query) =>
    Object.entries(query.matches).forEach(([term, fields]) =>
      fields.forEach((field) => {
        let terms = fieldToTerms.get(field);
        if (!terms) {
          terms = [];
          fieldToTerms.set(field, terms);
        }
        terms.push(term);
      })
    )
  );

  // Find first field that we matched
  const attribute = SEARCH_ATTRIBUTES_ORDERED.find((field) =>
    fieldToTerms.has(field)
  );

  // If this field is positional, find the start of the text match
  let position;
  if (attribute.startsWith("$")) {
    const attributeTerms = fieldToTerms.get(attribute)!;
    const value = extractField(result, attribute);
    const matchPositions = attributeTerms
      .flatMap((term) => Array.from(value.matchAll(new RegExp(`\\b${term}\\b`, "gi"))))
      .map((match) => match.index);
    position = Math.min(...matchPositions);
  } else {
    position = undefined;
  }

  return { attribute, position };
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
    // words: number; (Aloglia supports dropping words, we don't)
    attribute: SEARCH_ATTRIBUTES_ORDERED[number];
    typos: number;
    proximity: number;
    exact: number;
    level: number;
    position: number;
  };
};

function numberOfTypos(result: SearchResult): number {
  return result.queries.map(query => {
    const typoTerms = Object.keys(query.matches).filter(match => match !== query.term);
    return typoTerms.length;
  }).reduce(
    (sum, value) => sum + value
  );
}

function extendSearchRanking(result: SearchResult): ExtendedSearchResult {
  return {
    ...result,
    ranking: {
      ...matchedAttributePosition(result),
      proximity: wordsProximity(result, 8), // TODO
      typos: numberOfTypos(result),
      exact: matchedExactWords(result),
      level: TYPE_WEIGHTS.get(result.type),
      appearance: result.position,
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
  if (leftRank.typos !== rightRank.typos) {
    return cmp(leftRank.typos, leftRank.typos);
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
  if (
    leftRank.position != null &&
    rightRank.position != null &&
    leftRank.position !== rightRank.position
  ) {
    return cmp(leftRank.position, rightRank.position);
  }
  if (leftRank.appearance !== rightRank.appearance) {
    return cmp(leftRank.appearance, rightRank.appearance);
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
