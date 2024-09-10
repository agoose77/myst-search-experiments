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
    { title: "New Remix App" },
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

type SearchResult = SearchDocument & {
  match: Record<string, any[]>;
  terms: string[];
};
function performSearch(search: MiniSearch, query: string) {
  const searchResults = search.search(query);

  const results = [];
  for (const searchResult of searchResults) {
    const { hierarchy, content, type } = searchResult;
    // Generic "this document matched"
    results.push({
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
      uri: searchResult.url,
      id: searchResult.id,
    });
  }
  return results;
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
      fields: [
        "hierarchy.lvl1",
        "hierarchy.lvl2",
        "hierarchy.lvl3",
        "hierarchy.lvl4",
        "hierarchy.lvl5",
        "hierarchy.lvl6",
        "content",
      ],
      storeFields: ["hierarchy", "content", "url", "type", "id"],
      idField: "id",
      searchOptions: {
        fuzzy: 0.2,
        prefix: true,
        combineWith: "or",
      },
      extractField: (document, fieldName) => {
        // Access nested fields
        return fieldName
          .split(".")
          .reduce((doc, key) => doc && doc[key], document);
      },
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
