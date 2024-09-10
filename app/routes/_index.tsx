import type { MetaFunction, LinksFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
//import type { ClientLoaderFunctionArgs } from "@remix-run/react";
import {
  GridColumn,
  Search,
  Grid,
  Header,
  Segment,
  Icon,
} from "semantic-ui-react";
import type { StrictSearchProps } from "semantic-ui-react";
import { loadDocuments, type SearchRecord } from "../loadDocuments.js";

import React from "react";
import MiniSearch from "minisearch";
import { ItemHeader, ItemContent, Item } from "semantic-ui-react";

type Result = {
  title: string;
  kind: "file" | "heading" | "text";
  uri?: string;
};

type State = {
  loading: boolean;
  results: Result[];
  value: string;
};
const initialState: State = {
  loading: false,
  results: [],
  value: "",
};

export const meta: MetaFunction = () => {
  return [
    { title: "MyST Search" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

type Action =
  | {
      type: "CLEAN_QUERY";
    }
  | { type: "START_SEARCH"; query: string }
  | { type: "FINISH_SEARCH"; results: Result[] }
  | { type: "UPDATE_SELECTION"; selection: string };

function exampleReducer(state: State, action: Action) {
  switch (action.type) {
    case "CLEAN_QUERY":
      return initialState;
    case "START_SEARCH":
      return { ...state, loading: true, value: action.query };
    case "FINISH_SEARCH":
      return { ...state, loading: false, results: action.results };
    case "UPDATE_SELECTION":
      return { ...state, value: action.selection };

    default:
      throw new Error();
  }
}

// This regular expression matches any Unicode space, newline, or punctuation
// character
const SPACE_OR_PUNCTUATION = /[\n\r\p{Z}\p{P}]+/gu;

const SEARCH_ATTRIBUTES_ORDERED = [
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

function extractField(document, fieldName: string) {
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
          return Array.from(value.matchAll(pattern)).map((m) => m[0]);
        })
        .flat();
    })
    .flat();
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
      words: matchedWords(result),
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

type SearchResult = SearchRecord & {
  match: Record<string, string[]>;
  terms: string[];
};
function performSearch(search: MiniSearch, query: string) {
  const tokeniser = MiniSearch.getDefault("tokenize");
  const filterAND = resultIsAND(tokeniser(query));

  const searchResults = search
    .search(query)
    // Only take results that matched all tokens (AND) _somewhere_ in the document fields
    .filter(filterAND)
    .map(extendSearchRanking)
    .sort(cmpRanking);

  //.sort(cmpByPosition)
  //.sort(cmpByWeight)
  //.sort(cmpByAttribute)
  //.sort(cmpByMatches);
  console.log(searchResults);

  return searchResults.map((result) => {
    const { hierarchy, content, type, url, id } = result;
    // Generic "this document matched"
    return {
      kind: type === "content" ? "text" : type === "lvl1" ? "file" : "heading",
      title:
        (content.length ? content.slice(0, 128) : undefined) ??
        hierarchy.lvl6 ??
        hierarchy.lvl5 ??
        hierarchy.lvl4 ??
        hierarchy.lvl3 ??
        hierarchy.lvl2 ??
        hierarchy.lvl1 ??
        "<NOT DEFINED>",
      uri: url,
      id,
    };
  });
}

function SearchExampleStandard({ source }: { source: SearchDocument[] }) {
  const [state, dispatch] = React.useReducer(exampleReducer, initialState);
  const { loading, results, value } = state;

  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>();
  const [search, setSearch] = React.useState<MiniSearch | undefined>();
  React.useEffect(() => {
    console.log({ source });
    // Maybe need to destructure into sections and track lvl 1-4
    // Add empty content if no children exist
    // Will this favour sections with more children? probably
    const search = new MiniSearch({
      fields: SEARCH_ATTRIBUTES_ORDERED,
      storeFields: ["hierarchy", "content", "url", "type", "id", "position"],
      idField: "id",
      searchOptions: {
        fuzzy: 0.2,
        prefix: true,
        combineWith: "or",
      },
      extractField,
    });
    search.addAll(source);
    setSearch(search);
    console.log({ search, source });
  }, [source]);

  const handleSearchChange = React.useCallback<
    NonNullable<StrictSearchProps["onSearchChange"]>
  >(
    (_, data) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      dispatch({ type: "START_SEARCH", query: data.value! });

      timeoutRef.current = setTimeout(() => {
        if (data.value!.length === 0) {
          dispatch({ type: "CLEAN_QUERY" });
          return;
        }
        dispatch({
          type: "FINISH_SEARCH",
          results: performSearch(search!, data.value!),
        });
      }, 300);
    },
    [search]
  );
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  function resultRenderer(result: Result) {
    const { kind, title, uri } = result;
    const icon =
      kind === "file" ? "file" : kind === "heading" ? "hashtag" : "bars";
    return (
      <Item>
        <ItemContent>
          <ItemHeader>
            <Icon name={icon} />
            <a dangerouslySetInnerHTML={{ __html: title }} href={uri} />
          </ItemHeader>
        </ItemContent>
      </Item>
    );
  }

  return (
    <Grid>
      <GridColumn width={6}>
        <Search
          loading={loading}
          placeholder="Search..."
          onResultSelect={(e, data) =>
            dispatch({ type: "UPDATE_SELECTION", selection: data.result.label })
          }
          onSearchChange={handleSearchChange}
          resultRenderer={resultRenderer}
          results={results}
          value={value}
        />
      </GridColumn>

      <GridColumn width={10}>
        <Segment>
          <Header>State</Header>
          <pre style={{ overflowX: "auto" }}>
            {JSON.stringify({ loading, results, value }, null, 2)}
          </pre>
          <Header>Options</Header>
          <pre style={{ overflowX: "auto" }}>
            {JSON.stringify(source, null, 2)}
          </pre>
        </Segment>
      </GridColumn>
    </Grid>
  );
}

/*
  export const clientLoader = async ({ request }: ClientLoaderFunctionArgs) => {
  const url = new URL(request.url);
  const baseURL = url.searchParams.get("url");
  console.log("LOADER", baseURL);
  return { documents: baseURL ? await loadDocuments(baseURL) : [] };
};
*/

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const baseURL = url.searchParams.get("url");
  return { documents: baseURL ? await loadDocuments(baseURL) : [] };
};

export const links: LinksFunction = () => {
  return [
    {
      rel: "stylesheet",
      href: "https://cdn.jsdelivr.net/npm/semantic-ui/dist/semantic.min.css",
    },
  ];
};

export default function Index() {
  const { documents } = useLoaderData<typeof loader>();
  return <SearchExampleStandard source={documents} />;
}
