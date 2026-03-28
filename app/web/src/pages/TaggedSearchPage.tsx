import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import SearchResultCard from "../components/SearchResultCard";
import type { MetadataOptions, SearchTaggedResponse } from "../types";

type Props = {
  options: MetadataOptions;
  previewAssetVersion: number;
  onOpenPlayer: (id: number) => void;
  onOpenVLC: (id: number) => Promise<void>;
  onEditTag: (id: number) => Promise<void>;
};

export default function TaggedSearchPage({
  options,
  previewAssetVersion,
  onOpenPlayer,
  onOpenVLC,
  onEditTag,
}: Props) {
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get("search_q") ?? "";
  const sortDir = (searchParams.get("search_sort") as "asc" | "desc") || "desc";
  const page = Math.max(Number(searchParams.get("search_page") || "1"), 1);

  const mediaTypes = parseCSVStrings(searchParams.get("search_types"));
  const companyIds = parseCSVNumbers(searchParams.get("search_companies"));
  const personIds = parseCSVNumbers(searchParams.get("search_people"));
  const seriesIds = parseCSVNumbers(searchParams.get("search_series"));
  const mainCategoryIds = parseCSVNumbers(searchParams.get("search_main_cats"));
  const subCategoryIds = parseCSVNumbers(searchParams.get("search_sub_cats"));
  const tagIds = parseCSVNumbers(searchParams.get("search_tags"));

  const [data, setData] = useState<SearchTaggedResponse>({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
    total_pages: 0,
    sort_dir: "desc",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const visibleSubCategories = useMemo(() => {
    if (mainCategoryIds.length === 0) return [];
    return options.categories.filter(
      (item) => item.kind === "sub" && item.parent_id !== null && mainCategoryIds.includes(item.parent_id)
    );
  }, [options.categories, mainCategoryIds]);

  useEffect(() => {
    const validIds = new Set(visibleSubCategories.map((item) => item.id));
    const filtered = subCategoryIds.filter((id) => validIds.has(id));

    if (filtered.length !== subCategoryIds.length) {
      updateParams((params) => {
        setCSVNumbers(params, "search_sub_cats", filtered);
      });
    }
  }, [visibleSubCategories]);

  useEffect(() => {
    void load();
  }, [
    query,
    sortDir,
    page,
    mediaTypes.join(","),
    companyIds.join(","),
    personIds.join(","),
    seriesIds.join(","),
    mainCategoryIds.join(","),
    subCategoryIds.join(","),
    tagIds.join(","),
  ]);

  function updateParams(mutator: (params: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams);
    mutator(next);
    setSearchParams(next, { replace: true });
  }

  async function load() {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", "20");
      params.set("sort_dir", sortDir);

      if (query.trim()) params.set("q", query.trim());
      if (mediaTypes.length > 0) params.set("media_types", mediaTypes.join(","));
      if (companyIds.length > 0) params.set("company_ids", companyIds.join(","));
      if (personIds.length > 0) params.set("person_ids", personIds.join(","));
      if (seriesIds.length > 0) params.set("series_ids", seriesIds.join(","));
      if (mainCategoryIds.length > 0) params.set("main_category_ids", mainCategoryIds.join(","));
      if (subCategoryIds.length > 0) params.set("sub_category_ids", subCategoryIds.join(","));
      if (tagIds.length > 0) params.set("tag_ids", tagIds.join(","));

      const response = await apiFetch<SearchTaggedResponse>(`/api/search/tagged?${params.toString()}`);
      setData({
        items: Array.isArray(response.items) ? response.items : [],
        total: response.total ?? 0,
        page: response.page ?? 1,
        page_size: response.page_size ?? 20,
        total_pages: response.total_pages ?? 0,
        sort_dir: response.sort_dir ?? sortDir,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search tagged content");
      setData({
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
        total_pages: 0,
        sort_dir: sortDir,
      });
    } finally {
      setLoading(false);
    }
  }

  function updateSearchText(value: string) {
    updateParams((params) => {
      setStringParam(params, "search_q", value);
      setStringParam(params, "search_page", "");
    });
  }

  function updateSort(value: "asc" | "desc") {
    updateParams((params) => {
      setStringParam(params, "search_sort", value);
      setStringParam(params, "search_page", "");
    });
  }

  function toggleString(key: string, current: string[], value: string) {
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    updateParams((params) => {
      setCSVStrings(params, key, next);
      setStringParam(params, "search_page", "");
    });
  }

  function toggleNumber(key: string, current: number[], value: number) {
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    updateParams((params) => {
      setCSVNumbers(params, key, next);
      setStringParam(params, "search_page", "");
    });
  }

  function setPage(nextPage: number) {
    updateParams((params) => {
      setStringParam(params, "search_page", String(nextPage));
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="h-fit rounded-2xl border border-zinc-800 bg-zinc-900 p-5 xl:sticky xl:top-6">
        <h2 className="text-xl font-medium">Tagged Search</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Search only tagged content with advanced filters.
        </p>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Search</span>
            <input
              value={query}
              onChange={(e) => updateSearchText(e.target.value)}
              placeholder="Title, company, series..."
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Sort Order</span>
            <select
              value={sortDir}
              onChange={(e) => updateSort(e.target.value as "asc" | "desc")}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </label>

          <FilterGroup
            title="Type"
            items={[
              { id: "movie", name: "Movie" },
              { id: "series_episode", name: "Series" },
              { id: "video", name: "Video" },
            ]}
            selected={mediaTypes}
            onToggle={(value) => toggleString("search_types", mediaTypes, value)}
          />

          <FilterGroup
            title="Company"
            items={options.companies.map((item) => ({ id: item.id, name: item.name }))}
            selected={companyIds}
            onToggle={(value) => toggleNumber("search_companies", companyIds, value)}
          />

          <FilterGroup
            title="Actors / People"
            items={options.people.map((item) => ({ id: item.id, name: item.name }))}
            selected={personIds}
            onToggle={(value) => toggleNumber("search_people", personIds, value)}
          />

          <FilterGroup
            title="Series"
            items={options.series.map((item) => ({
              id: item.id,
              name: item.company_name ? `${item.name} (${item.company_name})` : item.name,
            }))}
            selected={seriesIds}
            onToggle={(value) => toggleNumber("search_series", seriesIds, value)}
          />

          <FilterGroup
            title="Main Categories"
            items={options.categories
              .filter((item) => item.kind === "main")
              .map((item) => ({ id: item.id, name: item.name }))}
            selected={mainCategoryIds}
            onToggle={(value) => toggleNumber("search_main_cats", mainCategoryIds, value)}
          />

          {mainCategoryIds.length > 0 ? (
            <FilterGroup
              title="Sub Categories"
              items={visibleSubCategories.map((item) => ({ id: item.id, name: item.name }))}
              selected={subCategoryIds}
              onToggle={(value) => toggleNumber("search_sub_cats", subCategoryIds, value)}
            />
          ) : null}

          <FilterGroup
            title="Tags"
            items={options.tags.map((item) => ({ id: item.id, name: item.name }))}
            selected={tagIds}
            onToggle={(value) => toggleNumber("search_tags", tagIds, value)}
          />
        </div>
      </aside>

      <section className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-lg font-medium">Results</h3>
            <p className="mt-1 text-sm text-zinc-400">
              {loading ? "Searching..." : `${data.total} tagged result(s) found`}
            </p>
          </div>

          <div className="text-sm text-zinc-500">
            Page {data.page} of {Math.max(data.total_pages, 1)}
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-5">
          {loading ? (
            <div className="text-sm text-zinc-400">Loading search results...</div>
          ) : data.items.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-6 text-sm text-zinc-500">
              No tagged media matched your filters.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.items.map((item) => (
                <SearchResultCard
                  key={item.id}
                  item={item}
                  previewAssetVersion={previewAssetVersion}
                  onOpenPlayer={() => onOpenPlayer(item.id)}
                  onOpenVLC={() => void onOpenVLC(item.id)}
                  onEditTag={() => void onEditTag(item.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setPage(Math.max(page - 1, 1))}
            disabled={page <= 1 || loading}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
          >
            Previous
          </button>

          <button
            onClick={() => setPage(Math.min(page + 1, Math.max(data.total_pages, 1)))}
            disabled={loading || page >= data.total_pages}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}

function FilterGroup<T extends number | string>({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: { id: T; name: string }[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="flex max-h-40 flex-wrap gap-2 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3">
        {items.length === 0 ? (
          <div className="text-sm text-zinc-500">No options</div>
        ) : (
          items.map((item) => {
            const active = selected.includes(item.id);
            return (
              <button
                key={String(item.id)}
                type="button"
                onClick={() => onToggle(item.id)}
                className={`rounded-full px-3 py-1.5 text-xs transition ${
                  active
                    ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                    : "border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {item.name}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function parseCSVStrings(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseCSVNumbers(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function setStringParam(params: URLSearchParams, key: string, value: string) {
  if (!value.trim()) {
    params.delete(key);
    return;
  }
  params.set(key, value);
}

function setCSVStrings(params: URLSearchParams, key: string, values: string[]) {
  if (values.length === 0) {
    params.delete(key);
    return;
  }
  params.set(key, values.join(","));
}

function setCSVNumbers(params: URLSearchParams, key: string, values: number[]) {
  if (values.length === 0) {
    params.delete(key);
    return;
  }
  params.set(key, values.join(","));
}
