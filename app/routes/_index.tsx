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
import { loadDocuments } from "../loadDocuments.js";

import React from "react";
import MiniSearch from "minisearch";
import {
  ItemHeader,
  ItemContent,
  Item,
} from "semantic-ui-react";

type Document = {
  headings: string[];
  body: string;
  location: string;
  title: string;
};

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

type SearchResult = Document & {
  match: Record<string, any[]>;
  terms: string[];
};
function buildResults(searchResults: SearchResult[]) {
  const results = [];
  for (const searchResult of searchResults) {
    results.push({
      kind: "file",
      title: searchResult.title,
      uri: searchResult.location,
      id: searchResult.location,
    });

    const fieldToTerms = new Map();
    for (const term of searchResult.terms) {
      for (const field of searchResult.match[term]) {
        let terms: string[];
        if (fieldToTerms.has(field)) {
          terms = fieldToTerms.get(field);
        } else {
          terms = [];
          fieldToTerms.set(field, terms);
        }
        terms.push(term);
      }
    }
    const headingTerms = (fieldToTerms.get("headings") ?? []) as string[];
    searchResult.headings.forEach((heading) => {
      if (
        headingTerms.some((term) => {
          const pattern = new RegExp(`(${term})`, "gi");
          return heading.match(pattern);
        })
      ) {
        results.push({
          kind: "heading",
          title: heading,
          id: `${searchResult.location}#${heading}`,
        });
      }
    });

    const bodyTerms = (fieldToTerms.get("body") ?? []) as string[];
    bodyTerms.forEach((term) => {
      const pattern = new RegExp(`(${term})`, "i");
      const match = searchResult.body.match(pattern)!;
      const title = searchResult.body.slice(
        match.index - 16,
        match.index + match[0].length + 128
      );

      results.push({
        kind: "text",
        title: `... ${title} ...`,
        id: `${searchResult.location}%${term}`,
      });
    });
  }
  console.log(results);
  return results;
}

function SearchExampleStandard({ source }: { source: Document[] }) {
  const [state, dispatch] = React.useReducer(exampleReducer, initialState);
  const { loading, results, value } = state;

  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>();
  const [search, setSearch] = React.useState<MiniSearch | undefined>();
  React.useEffect(() => {
    const search = new MiniSearch({
      fields: ["headings", "body", "title"],
      storeFields: ["headings", "body", "location", "title"],
      idField: "location",
      searchOptions: {
        boost: { title: 2, headings: 2 },
        fuzzy: 0.2,
        prefix: true,
        combineWith: "and",
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
        console.log("SEARCH", search!.search(data.value!));
        dispatch({
          type: "FINISH_SEARCH",
          results: buildResults(search!.search(data.value!)),
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
            {title}
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
