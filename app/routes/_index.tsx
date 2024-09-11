import type { MetaFunction, LinksFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import type { ClientLoaderFunctionArgs } from "@remix-run/react";
import { Icon } from "semantic-ui-react";
import { loadDocuments } from "../loadDocuments.js";
import {
  SEARCH_ATTRIBUTES_ORDERED,
  SPACE_OR_PUNCTUATION,
  extractField,
  extendDefaultOptions,
  createSearch,
  combineResults,
} from "../search.js";
import { rankAndFilterResults, type ExtendedSearchResult } from "../rank.js";
import React from "react";
import MiniSearch, { type Options } from "minisearch";

export const meta: MetaFunction = () => {
  return [
    { title: "MyST Search" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

type SearchState = {
  documents: SearchDocument[];
  options: Options;
  search: MiniSearch;
};

function createSearchState(documents: SearchDocument[], rawOptions: Options) {
  const options = extendDefaultOptions(rawOptions);
  const search = createSearch(documents, options);
  console.log({documents})
  return { options, search };
}

function useRankedSearch(documents: SearchDocument[], rawOptions: Options) {
  const [searchState, setSearchState] = React.useState<SearchState>(() =>
    createSearchState(documents, rawOptions)
  );
  React.useEffect(
    () => setSearchState(createSearchState(documents, rawOptions)),
    [rawOptions, documents]
  );

  const [results, setResults] = React.useState<ExtendedSearchResult[]>([]);
  const doSearch = React.useCallback(
    (query: string) => {
      const { search, options } = searchState;
      // Implement executeQuery whilst retaining distinction between terms
      // TODO: should we check for unique terms?
      const terms = options.tokenize(query);
      const termResults = new Map(
        terms.map((term) => [
          term,
          new Map(search.search(term).map((doc) => [doc.id, doc])),
        ])
      );
      const rawResults = combineResults(termResults);
      const results = rankAndFilterResults(rawResults);
      setResults(results);
      console.log(results)
    },
    [searchState]
  );

  return [doSearch, results];
}

function highlightTitle(text: string, result: ExtendedSearchResult) {
  const allTerms = result.queries.flatMap(query => Object.keys(query.matches)).join("|");
  const pattern = new RegExp(`\\b(${allTerms})\\b`, "gi");
  const allMatches = Array.from(text.matchAll(pattern)).map((m) => m);

  const { index: start } = allMatches[0] ?? { index: 0 };

  const tokens = Array.from(text.slice(start).matchAll(SPACE_OR_PUNCTUATION));
  tokens.push({ index: text.length - start });

  const limitedTokens = tokens.slice(0, 16);
  const { index: offset } = limitedTokens[limitedTokens.length - 1];

  let title = text
    .slice(start, start + offset)
    .replace(pattern, "<strong>$&</strong>");
  if (start !== 0) {
    title = `... ${title}`;
  }
  if (offset !== text.length) {
    title = `${title} ...`;
  }

  return title;
}

function resultRenderer(result: ExtendedSearchResult) {
  const { hierarchy, content, type, url, id } = result;
  // Generic "this document matched"
  const kind =
    type === "content" ? "text" : type === "lvl1" ? "file" : "heading";
  const title = highlightTitle(
    type === "content" ? content : hierarchy[type],
    result
  );

  const icon =
    kind === "file" ? "file" : kind === "heading" ? "hashtag" : "bars";
  return (
    <span key={id}>
      <Icon name={icon} />
      <a dangerouslySetInnerHTML={{ __html: title }} href={url} />
    </span>
  );
}

function MySTSearch({ documents }: { documents: SearchDocument[] }) {
  const miniSearchOptions = React.useMemo(
    () => ({
      fields: SEARCH_ATTRIBUTES_ORDERED,
      storeFields: ["hierarchy", "content", "url", "type", "id", "position"],
      idField: "id",
      searchOptions: {
        fuzzy: 0.15,
        prefix: true,
      },
      extractField,
    }),
    []
  );
  const [search, searchResults] = useRankedSearch(documents, miniSearchOptions);

  const [query, setQuery] = React.useState<string>();
  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query != undefined) {
        search(query);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [search, query]);

  const handleSearchChange = (event) => {
    setQuery(event.target.value);
  };

  return (
    <div>
      <input type="text" onChange={handleSearchChange} placeholder="Search…" />

      <ol>
        <h3>Results:</h3>
        {searchResults &&
          searchResults.map((result, i) => {
            return <li key={i}>{resultRenderer(result)}</li>;
          })}
      </ol>
    </div>
  );
}

export const clientLoader = async ({ request }: ClientLoaderFunctionArgs) => {
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
  return <MySTSearch documents={documents} />;
}
