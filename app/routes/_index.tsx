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
import { loadDocuments, type SearchDocument } from "../loadDocuments.js";

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
function buildResults(searchResults: SearchResult[]) {
  const results = [];
  for (const searchResult of searchResults) {
    // Generic "this document matched"
    results.push({
      kind: "file",
      title: searchResult.title,
      uri: searchResult.location,
      id: searchResult.location,
    });

    // Invert term-to-field to field-to-term mapping
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

    // First, handle heading matches (if all terms match heading)
    const headingTerms = (fieldToTerms.get("headingCorpus.text") ??
      []) as string[];
    const bodyTerms = (fieldToTerms.get("bodyCorpus.text") ?? []) as string[];
    searchResult.headings.forEach((heading, index) => {
      let headingHasResult = false;
      if (heading) {
        if (
          headingTerms.every((term) => {
            const pattern = new RegExp(`(${term})`, "gi");
            return heading.text.match(pattern);
          }) &&
          headingTerms.length
        ) {
          headingHasResult = true;
          results.push({
            kind: "heading",
            title: heading.text,
            id: `${searchResult.location}#${index}`,
            uri: `${searchResult.location}#${heading.html_id}`,
          });
        }
      }
      if (bodyTerms.length) {
        if (!headingHasResult && heading) {
          results.push({
            kind: "heading",
            title: heading.text,
            id: `${searchResult.location}#${index}`,
            uri: `${searchResult.location}#${heading.html_id}`,
          });
        }
        const stop = searchResult.bodyCorpus.stops[index];
        const start = searchResult.bodyCorpus.stops[index - 1] ?? 0;
        const sectionText = searchResult.bodyCorpus.text.slice(start, stop);

        const termsPattern = new RegExp(bodyTerms.join("|"), "ig"); // TODO escape?
        // Split section into tokens, match each token for a term, and highlight term
        const tokens = [];
        let lastStop = 0;
        for (const m of sectionText.matchAll(SPACE_OR_PUNCTUATION)) {
          const token = sectionText.slice(lastStop, m.index);
          tokens.push([token, token.match(termsPattern), lastStop, m.index]);
          lastStop = m.index + m[0].length;
        }
	tokens.push([sectionText.slice(lastStop, sectionText.length), lastStop, sectionText.length])

        //.map((m) => [m, m[0]]);//, "<strong>$&</strong>"

        // Find local window with greatest number of matches
        let titleText: string;
        const windowSize = 32;
        if (tokens.length > windowSize) {
          const windowStop = tokens.length - windowSize;
          let bestGOF = -1;
          let bestWindow = [0, windowSize];
          for (let i = 0; i < windowStop; i++) {
            const j = i + windowSize;
            const gof = tokens
              .slice(i, j)
              .map(([_, termMatch]) => {
                return !!termMatch;
              })
              .reduce((a, b) => a + b);
            if (gof > bestGOF) {
              bestGOF = gof;
              bestWindow = [i, j];
            }
          }
          const start = tokens[bestWindow[0]][2];
          const stop = tokens[bestWindow[1]][3];
          titleText = sectionText.slice(start, stop);
        } else {
          titleText = sectionText;
        }
        const htmlID = heading?.html_id ?? "";
        results.push({
          kind: "text",
          title: titleText.replaceAll(termsPattern, "<strong>$&</strong>"),
          id: `${searchResult.location}%${index}`,
          uri: `${searchResult.location}#${htmlID}`,
        });
      }
    });
  }
  console.log(results);
  return results;
}

function SearchExampleStandard({ source }: { source: SearchDocument[] }) {
  const [state, dispatch] = React.useReducer(exampleReducer, initialState);
  const { loading, results, value } = state;

  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>();
  const [search, setSearch] = React.useState<MiniSearch | undefined>();
  React.useEffect(() => {
    const search = new MiniSearch({
      fields: ["headingCorpus.text", "bodyCorpus.text", "title"],
      storeFields: [
        "headingCorpus",
        "bodyCorpus",
        "location",
        "title",
        "headings",
      ],
      idField: "location",
      searchOptions: {
        boost: { title: 2, headings: 2 },
        fuzzy: 0.2,
        prefix: true,
        combineWith: "and",
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
