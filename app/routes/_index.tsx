import type { MetaFunction, LinksFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import type { ClientLoaderFunctionArgs } from "@remix-run/react";
import { Icon } from "semantic-ui-react";
import { loadDocuments } from "../loadDocuments.js";
import {
  SEARCH_ATTRIBUTES_ORDERED,
  SPACE_OR_PUNCTUATION,
  extractField,
  rankAndFilterResults,
  type ExtendedSearchResult,
} from "../search.js";
import React from "react";
import MiniSearch, { Options } from "minisearch";

export const meta: MetaFunction = () => {
  return [
    { title: "MyST Search" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

function useRankedSearch(documents: SearchDocument[], options: Options) {
  const [search] = React.useState<MiniSearch>(() => {
    const _search = new MiniSearch(options);
    _search.addAll(documents);
    return _search;
  });

  const [results, setResults] = React.useState<ExtendedSearchResult[]>([]);
  const doSearch = React.useCallback(
    (query: string) => {
      const tokenizer = MiniSearch.getDefault("tokenize");
      const queryTokens = tokenizer(query);
      const rawResults = search.search(query);
      const results = rankAndFilterResults(rawResults, queryTokens);
      setResults(results);
    },
    [search]
  );

  return [doSearch, results];
}

function highlightTitle(text: string, result: ExtendedSearchResult) {
  const allTerms = result.terms.join("|");
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
  const miniSearchOptions = {
    fields: SEARCH_ATTRIBUTES_ORDERED,
    storeFields: ["hierarchy", "content", "url", "type", "id", "position"],
    idField: "id",
    searchOptions: {
      fuzzy: 0.15,
      prefix: true,
      combineWith: "or",
    },
    extractField,
  };
  const [search, searchResults] = useRankedSearch(documents, miniSearchOptions);

  const [query, setQuery] = React.useState<string>();
  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      search(query);
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
