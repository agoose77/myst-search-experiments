import type { MetaFunction, LinksFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import type { ClientLoaderFunctionArgs } from "@remix-run/react";
import { Icon } from "semantic-ui-react";
import {
  searchRecordsFromXrefs,
  searchRecordsFromIndex,
  type SearchRecord,
  type HeadingLevel,
} from "../loadDocuments.js";
import {
  SPACE_OR_PUNCTUATION,
  extractField,
  extendDefaultOptions,
  createSearch,
  combineResults,
  type ExtendedOptions,
  type RawSearchResult,
} from "../search.js";
import {
  rankAndFilterResults,
  type RankedSearchResult,
  SEARCH_ATTRIBUTES_ORDERED,
} from "../rank.js";
import React from "react";
import MiniSearch, { type Options } from "minisearch";

export const meta: MetaFunction = () => {
  return [
    { title: "MyST Search" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

function createSearchState(
  records: SearchRecord[],
  rawOptions: Options
): SearchState {
  const options = extendDefaultOptions(rawOptions);
  const search = createSearch(records, options);
  return { options, search };
}

type SearchState = {
  options: ExtendedOptions;
  search: MiniSearch;
};

function useRankedSearch(
  documents: SearchRecord[],
  rawOptions: Options
): [(query: string) => void, RankedSearchResult[]] {
  const [searchState, setSearchState] = React.useState<SearchState>(() =>
    createSearchState(documents, rawOptions)
  );
  React.useEffect(
    () => setSearchState(createSearchState(documents, rawOptions)),
    [rawOptions, documents]
  );

  const [results, setResults] = React.useState<RankedSearchResult[]>([]);
  const doSearch = React.useCallback<(query: string) => void>(
    (query: string) => {
      const { search, options } = searchState;
      console.trace(searchState);
      // Implement executeQuery whilst retaining distinction between terms
      // TODO: should we check for unique terms?
      const terms = options.tokenize(query);
      const termResults = new Map(
        terms.map((term) => [
          term,
          new Map(
            search.search(term).map((doc) => [doc.id, doc as RawSearchResult])
          ),
        ])
      );
      const rawResults = combineResults(termResults);
      const results = rankAndFilterResults(rawResults);
      setResults(results);
      console.log(results);
    },
    [searchState]
  );

  return [doSearch, results];
}

function highlightTitle(text: string, result: RankedSearchResult): string {
  const allTerms = result.queries
    .flatMap((query) => Object.keys(query.matches))
    .join("|");
  const pattern = new RegExp(`\\b(${allTerms})\\b`, "gi");
  const allMatches = Array.from(text.matchAll(pattern)).map((m) => m);

  const { index: start } = allMatches[0] ?? { index: 0 };

  const tokens = [
    ...text.slice(start).matchAll(SPACE_OR_PUNCTUATION),
    { index: text.length - start },
  ];

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

function resultRenderer(result: RankedSearchResult, remoteURL?: URL) {
  const { hierarchy, type, url, id } = result;
  // Generic "this document matched"
  const kind =
    type === "content" ? "text" : type === "lvl1" ? "file" : "heading";
  const title = highlightTitle(
    result.type === "content"
      ? result["content"]
      : hierarchy[type as HeadingLevel]!,
    result
  );

  const icon =
    kind === "file" ? "file" : kind === "heading" ? "hashtag" : "bars";
  return (
    <span key={id}>
      <Icon name={icon} />
      <a
        dangerouslySetInnerHTML={{ __html: title }}
        href={`${remoteURL}${url.slice(1)}`}
      />
    </span>
  );
}

function MySTSearch({
  documents,
  url,
}: {
  documents: SearchRecord[];
  url?: URL;
}) {
  const miniSearchOptions = React.useMemo(
    (): Options => ({
      fields: SEARCH_ATTRIBUTES_ORDERED as any as string[],
      storeFields: ["hierarchy", "content", "url", "type", "id", "position"],
      idField: "id",
      searchOptions: {
        fuzzy: 0.2,
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

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  };

  return (
    <div>
      <input type="text" onChange={handleSearchChange} placeholder="Search…" />

      <ol>
        <h3>Results:</h3>
        {searchResults &&
          searchResults.map((result, i) => {
            return <li key={i}>{resultRenderer(result, url)}</li>;
          })}
      </ol>
    </div>
  );
}

export const clientLoader = async ({ request }: ClientLoaderFunctionArgs) => {
  const url = new URL(request.url);
  const rawRemoteURL = url.searchParams.get("url");
  if (!rawRemoteURL) {
    return { documents: [], remoteURL: undefined };
  }
  const remoteURL = new URL(rawRemoteURL);
  const documents = await searchRecordsFromIndex(remoteURL).catch(() =>
    searchRecordsFromXrefs(remoteURL)
  );
  return {
    documents,
    remoteURL,
  };
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
  const { documents, remoteURL } = useLoaderData<typeof clientLoader>();
  return <MySTSearch documents={documents ?? []} url={remoteURL} />;
}
