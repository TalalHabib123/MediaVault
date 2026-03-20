import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { apiFetch } from "./lib/api";
import MetadataManager from "./components/MetadataManager";
import MediaDetailDrawer from "./components/MediaDetailDrawer";

import { BrowserRouter, Routes, Route, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import LibraryCard from "./components/LibraryCard";
import PlayerPage from "./pages/PlayerPage";

import BulkTagDrawer from "./components/BulkTagDrawer";
import type { BulkMoveResponse, BulkTaggingPayload } from "./types";
import TaggedSearchPage from "./pages/TaggedSearchPage";

import type {
  AppConfig,
  Category,
  Company,
  LibraryResponse,
  MediaDetailResponse,
  MediaItem,
  MetadataOptions,
  Person,
  ScanSummary,
  Series,
  Tag,
  UpdateMediaPayload,
  UpdateTaggingPayload,
} from "./types";
import { emptyConfig } from "./types";

type TabKey = "library" | "metadata" | "settings" | "search";

const emptyOptions: MetadataOptions = {
  companies: [],
  people: [],
  categories: [],
  tags: [],
  series: [],
};

function parseDashboardTab(value: string | null): "library" | "search" | "metadata" | "settings" {
  if (value === "search" || value === "metadata" || value === "settings") return value;
  return "library";
}

function setStringParam(params: URLSearchParams, key: string, value: string) {
  if (!value.trim()) {
    params.delete(key);
    return;
  }
  params.set(key, value);
}

function DashboardPage() {
  // const navigate = useNavigate();

  // const [activeTab, setActiveTab] = useState<TabKey>("library");

  const navigate = useNavigate();
const location = useLocation();
const [searchParams, setSearchParams] = useSearchParams();

const activeTab = parseDashboardTab(searchParams.get("tab"));

const librarySearch = searchParams.get("lib_q") ?? "";
const mediaTypeFilter = searchParams.get("lib_type") ?? "all";
const taggedStatusFilter = searchParams.get("lib_tagged") ?? "all";

function updateDashboardParams(mutator: (params: URLSearchParams) => void) {
  const next = new URLSearchParams(searchParams);
  mutator(next);
  setSearchParams(next, { replace: true });
}

function setActiveTab(next: TabKey) {
  updateDashboardParams((params) => {
    params.set("tab", next);
  });
}

function setLibrarySearch(nextValue: string) {
  updateDashboardParams((params) => {
    setStringParam(params, "lib_q", nextValue);
  });
}

function setLibraryMediaType(nextValue: string) {
  updateDashboardParams((params) => {
    if (nextValue === "all") {
      params.delete("lib_type");
    } else {
      params.set("lib_type", nextValue);
    }
  });
}

function setLibraryTaggedStatus(nextValue: string) {
  updateDashboardParams((params) => {
    if (nextValue === "all") {
      params.delete("lib_tagged");
    } else {
      params.set("lib_tagged", nextValue);
    }
  });
}

  const [config, setConfig] = useState<AppConfig>(emptyConfig);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);

  const [options, setOptions] = useState<MetadataOptions>(emptyOptions);
  const [optionsLoading, setOptionsLoading] = useState(true);

  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [libraryTotal, setLibraryTotal] = useState(0);
  const [libraryLoading, setLibraryLoading] = useState(false);

  const [scanLoading, setScanLoading] = useState(false);
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null);

  const [selectedDetail, setSelectedDetail] =
    useState<MediaDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [taggingSaving, setTaggingSaving] = useState(false);

  // const [search, setSearch] = useState("");
  // const [mediaTypeFilter, setMediaTypeFilter] = useState("all");
  // const [taggedStatusFilter, setTaggedStatusFilter] = useState("untagged");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [newSource, setNewSource] = useState("");

  const [moving, setMoving] = useState(false);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTagSaving, setBulkTagSaving] = useState(false);
  const [bulkMoving, setBulkMoving] = useState(false);
  const [toolActionBusy, setToolActionBusy] = useState(false);

  useEffect(() => {
    void Promise.all([loadSettings(), loadMetadataOptions()]);
  }, []);

  useEffect(() => {
    if (!configLoading) {
      void loadLibrary();
    }
  }, [configLoading, mediaTypeFilter, taggedStatusFilter]);

  useEffect(() => {
    setSelectedIds((prev) =>
      prev.filter((id) => library.some((item) => item.id === id)),
    );
  }, [library]);

  function openPlayer(id: number) {
  const returnTo = `${location.pathname}${location.search}`;
  navigate(`/player/${id}?return_to=${encodeURIComponent(returnTo)}`);
}

  function toggleSelected(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  async function applyBulkTagging(payload: BulkTaggingPayload) {
    try {
      setBulkTagSaving(true);
      setError("");
      setMessage("");

      const data = await apiFetch<{
        ok: boolean;
        requested: number;
        updated: number;
      }>("/api/library/bulk/tagging", {
        method: "POST",
        body: JSON.stringify({
          media_ids: selectedIds,
          ...payload,
        }),
      });

      setMessage(`Bulk tagging applied to ${data.updated} item(s).`);
      setBulkTagOpen(false);
      await loadLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk tagging failed");
    } finally {
      setBulkTagSaving(false);
    }
  }

  async function openInVLCById(id: number) {
    try {
      setToolActionBusy(true);
      setError("");
      setMessage("");

      await apiFetch<{ ok: boolean }>(`/api/library/${id}/open-vlc`, {
        method: "POST",
      });

      setMessage("Opened in VLC.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open in VLC");
    } finally {
      setToolActionBusy(false);
    }
  }

  async function bulkMoveSelected() {
    if (selectedIds.length === 0) return;

    try {
      setBulkMoving(true);
      setError("");
      setMessage("");

      const data = await apiFetch<BulkMoveResponse>(
        "/api/library/bulk/move-to-library",
        {
          method: "POST",
          body: JSON.stringify({
            media_ids: selectedIds,
          }),
        },
      );

      setMessage(
        `Bulk move finished. Moved: ${data.moved}, already managed: ${data.already_managed}, failed: ${data.failed.length}.`,
      );

      if (data.failed.length > 0) {
        setError(
          data.failed
            .slice(0, 3)
            .map((item) => `#${item.media_id}: ${item.error}`)
            .join(" | "),
        );
      }

      await loadLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk move failed");
    } finally {
      setBulkMoving(false);
    }
  }

  async function openSelectedInVLC() {
    if (!selectedDetail) return;

    try {
      setToolActionBusy(true);
      setError("");
      setMessage("");

      await apiFetch<{ ok: boolean }>(
        `/api/library/${selectedDetail.item.id}/open-vlc`,
        {
          method: "POST",
        },
      );

      setMessage("Opened in VLC.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open in VLC");
    } finally {
      setToolActionBusy(false);
    }
  }

  async function revealSelectedFile() {
    if (!selectedDetail) return;

    try {
      setToolActionBusy(true);
      setError("");
      setMessage("");

      await apiFetch<{ ok: boolean }>(
        `/api/library/${selectedDetail.item.id}/reveal-file`,
        {
          method: "POST",
        },
      );

      setMessage("Opened folder location.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reveal file");
    } finally {
      setToolActionBusy(false);
    }
  }
const visibleItems = useMemo(() => {
  const safeLibrary = Array.isArray(library) ? library : [];
  const trimmed = librarySearch.trim().toLowerCase();

  if (!trimmed) return safeLibrary;

  return safeLibrary.filter((item) => {
    return (
      item.title.toLowerCase().includes(trimmed) ||
      item.file_name.toLowerCase().includes(trimmed) ||
      item.source_path.toLowerCase().includes(trimmed) ||
      item.company_name.toLowerCase().includes(trimmed)
    );
  });
}, [library, librarySearch]);

  async function loadSettings() {
    try {
      setConfigLoading(true);
      setError("");

      const data = await apiFetch<AppConfig>("/api/settings");
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setConfigLoading(false);
    }
    console.log(detailLoading);
  }

  async function loadMetadataOptions() {
    try {
      setOptionsLoading(true);
      setError("");

      const data = await apiFetch<MetadataOptions>("/api/metadata/options");
      setOptions({
        companies: Array.isArray(data?.companies) ? data.companies : [],
        people: Array.isArray(data?.people) ? data.people : [],
        categories: Array.isArray(data?.categories) ? data.categories : [],
        tags: Array.isArray(data?.tags) ? data.tags : [],
        series: Array.isArray(data?.series) ? data.series : [],
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load metadata options",
      );
    } finally {
      setOptionsLoading(false);
    }
  }

  async function saveSettings() {
    try {
      setConfigSaving(true);
      setError("");
      setMessage("");

      const data = await apiFetch<{ ok: boolean; settings: AppConfig }>(
        "/api/settings",
        {
          method: "PUT",
          body: JSON.stringify(config),
        },
      );

      setConfig(data.settings);
      setMessage("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setConfigSaving(false);
    }
  }

  async function loadLibrary() {
    try {
      setLibraryLoading(true);
      setError("");

      const params = new URLSearchParams();
      params.set("limit", "200");
      if (mediaTypeFilter !== "all") params.set("media_type", mediaTypeFilter);
      if (taggedStatusFilter !== "all")
        params.set("tagged_status", taggedStatusFilter);

      const data = await apiFetch<LibraryResponse>(
        `/api/library?${params.toString()}`,
      );
      setLibrary(Array.isArray(data?.items) ? data.items : []);
      setLibraryTotal(typeof data?.total === "number" ? data.total : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load library");
      setLibrary([]);
      setLibraryTotal(0);
    } finally {
      setLibraryLoading(false);
    }
  }

  async function runScan() {
    try {
      setScanLoading(true);
      setError("");
      setMessage("");
      setScanSummary(null);

      const data = await apiFetch<ScanSummary>("/api/scan/run", {
        method: "POST",
      });

      setScanSummary({
        sources: typeof data?.sources === "number" ? data.sources : 0,
        files_seen: typeof data?.files_seen === "number" ? data.files_seen : 0,
        inserted: typeof data?.inserted === "number" ? data.inserted : 0,
        updated: typeof data?.updated === "number" ? data.updated : 0,
        skipped: typeof data?.skipped === "number" ? data.skipped : 0,
        errors: Array.isArray(data?.errors) ? data.errors : [],
      });

      setMessage("Scan completed.");
      await loadLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanLoading(false);
    }
  }

  async function openItem(id: number) {
    try {
      setDetailLoading(true);
      setError("");

      const data = await apiFetch<MediaDetailResponse>(`/api/library/${id}`);
      setSelectedDetail(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load media item",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function saveItem(payload: UpdateMediaPayload) {
    if (!selectedDetail) return;

    try {
      setDetailSaving(true);
      setError("");
      setMessage("");

      const data = await apiFetch<MediaDetailResponse & { ok: boolean }>(
        `/api/library/${selectedDetail.item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );

      setSelectedDetail({
        item: data.item,
        assignments: data.assignments,
      });

      setMessage("Media item updated.");
      await loadLibrary();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save media item",
      );
    } finally {
      setDetailSaving(false);
    }
  }

  async function createSeries(payload: {
    name: string;
    company_id: number | null;
  }): Promise<Series> {
    const item = await apiFetch<Series>("/api/metadata/series", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setOptions((prev) => ({
      ...prev,
      series: sortSeries(uniqueById([...prev.series, item])),
    }));

    return item;
  }

  async function saveTagging(payload: UpdateTaggingPayload) {
    if (!selectedDetail) return;

    try {
      setTaggingSaving(true);
      setError("");
      setMessage("");

      const data = await apiFetch<MediaDetailResponse & { ok: boolean }>(
        `/api/library/${selectedDetail.item.id}/tagging`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );

      setSelectedDetail({
        item: data.item,
        assignments: data.assignments,
      });

      setMessage("Tagging updated.");
      await loadLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tagging");
    } finally {
      setTaggingSaving(false);
    }
  }

  async function createCompany(name: string): Promise<Company> {
    const item = await apiFetch<Company>("/api/metadata/companies", {
      method: "POST",
      body: JSON.stringify({ name }),
    });

    setOptions((prev) => ({
      ...prev,
      companies: sortByName(uniqueById([...prev.companies, item])),
    }));

    return item;
  }

  async function createPerson(name: string): Promise<Person> {
    const item = await apiFetch<Person>("/api/metadata/people", {
      method: "POST",
      body: JSON.stringify({ name }),
    });

    setOptions((prev) => ({
      ...prev,
      people: sortByName(uniqueById([...prev.people, item])),
    }));

    return item;
  }

  async function createCategory(payload: {
    name: string;
    kind: "main" | "sub";
    parent_id: number | null;
  }): Promise<Category> {
    const item = await apiFetch<Category>("/api/metadata/categories", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setOptions((prev) => ({
      ...prev,
      categories: sortCategories(uniqueById([...prev.categories, item])),
    }));

    return item;
  }

  async function createTag(name: string): Promise<Tag> {
    const item = await apiFetch<Tag>("/api/metadata/tags", {
      method: "POST",
      body: JSON.stringify({ name }),
    });

    setOptions((prev) => ({
      ...prev,
      tags: sortByName(uniqueById([...prev.tags, item])),
    }));

    return item;
  }

  async function moveSelectedToLibrary() {
    if (!selectedDetail) return;

    try {
      setMoving(true);
      setError("");
      setMessage("");

      const data = await apiFetch<
        MediaDetailResponse & { ok: boolean; result: { new_path: string } }
      >(`/api/library/${selectedDetail.item.id}/move-to-library`, {
        method: "POST",
      });

      setSelectedDetail({
        item: data.item,
        assignments: data.assignments,
      });

      setMessage(`Moved to library: ${data.result.new_path}`);
      await loadLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move media");
    } finally {
      setMoving(false);
    }
  }

  function addSource() {
    const value = newSource.trim();
    if (!value) return;
    if (config.paths.sources.includes(value)) {
      setNewSource("");
      return;
    }

    setConfig((prev) => ({
      ...prev,
      paths: {
        ...prev.paths,
        sources: [...prev.paths.sources, value],
      },
    }));
    setNewSource("");
  }

  function removeSource(index: number) {
    setConfig((prev) => ({
      ...prev,
      paths: {
        ...prev.paths,
        sources: prev.paths.sources.filter((_, i) => i !== index),
      },
    }));
  }

  if (configLoading || optionsLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        Loading MediaVault...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              MediaVault
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Local-first media manager for movies, series, and general videos.
            </p>
          </div>

          <div className="flex gap-2">
            <TabButton
              active={activeTab === "library"}
              onClick={() => setActiveTab("library")}
            >
              Library
            </TabButton>
            <TabButton
              active={activeTab === "search"}
              onClick={() => setActiveTab("search")}
            >
              Search
            </TabButton>
            <TabButton
              active={activeTab === "metadata"}
              onClick={() => setActiveTab("metadata")}
            >
              Metadata
            </TabButton>
            <TabButton
              active={activeTab === "settings"}
              onClick={() => setActiveTab("settings")}
            >
              Settings
            </TabButton>
          </div>
        </header>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {message}
          </div>
        ) : null}

        <main className="mt-6">
          {activeTab === "library" ? (
            <LibraryView
              items={visibleItems}
              total={libraryTotal}
              mediaType={mediaTypeFilter}
              taggedStatus={taggedStatusFilter}
              onMediaTypeChange={setLibraryMediaType}
              onTaggedStatusChange={setLibraryTaggedStatus}
              search={librarySearch}
              onSearchChange={setLibrarySearch}
              loading={libraryLoading}
              onRefresh={loadLibrary}
              onScan={runScan}
              scanLoading={scanLoading}
              scanSummary={scanSummary}
              hasSources={config.paths.sources.length > 0}
              onOpenItem={openItem}
              onOpenPlayer={openPlayer}
              detailLoading={detailLoading}
              selectedIds={selectedIds}
              onToggleSelected={toggleSelected}
              onClearSelection={clearSelection}
              onOpenBulkTagging={() => setBulkTagOpen(true)}
              onBulkMove={bulkMoveSelected}
              bulkMoving={bulkMoving}
            />
          ) : activeTab === "search" ? (
            <TaggedSearchPage
              options={options}
              onOpenPlayer={openPlayer}
              onOpenVLC={openInVLCById}
              onEditTag={openItem}
            />
          ) : activeTab === "metadata" ? (
            <MetadataManager
              options={options}
              onCreateCompany={createCompany}
              onCreatePerson={createPerson}
              onCreateCategory={createCategory}
              onCreateTag={createTag}
              onCreateSeries={createSeries}
            />
          ) : (
            <SettingsView
              config={config}
              setConfig={setConfig}
              onSave={saveSettings}
              saving={configSaving}
              newSource={newSource}
              setNewSource={setNewSource}
              addSource={addSource}
              removeSource={removeSource}
            />
          )}
        </main>
      </div>

      <MediaDetailDrawer
        detail={selectedDetail}
        options={options}
        savingDetails={detailSaving}
        savingTagging={taggingSaving}
        moving={moving}
        toolActionBusy={toolActionBusy}
        onClose={() => setSelectedDetail(null)}
        onSaveDetails={saveItem}
        onSaveTagging={saveTagging}
        onMoveToLibrary={moveSelectedToLibrary}
        onOpenInVLC={openSelectedInVLC}
        onRevealFile={revealSelectedFile}
        onCreateCompany={createCompany}
        onCreatePerson={createPerson}
        onCreateCategory={createCategory}
        onCreateTag={createTag}
        onCreateSeries={createSeries}
      />
      <BulkTagDrawer
        open={bulkTagOpen}
        selectedCount={selectedIds.length}
        options={options}
        saving={bulkTagSaving}
        onClose={() => setBulkTagOpen(false)}
        onApply={applyBulkTagging}
      />
    </div>
  );
}

function LibraryView(props: {
  items: MediaItem[];
  total: number;
  mediaType: string;
  taggedStatus: string;
  onMediaTypeChange: (value: string) => void;
  onTaggedStatusChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
  onRefresh: () => void;
  onScan: () => void;
  scanLoading: boolean;
  scanSummary: ScanSummary | null;
  hasSources: boolean;
  onOpenItem: (id: number) => void;
  onOpenPlayer: (id: number) => void;
  detailLoading: boolean;
  selectedIds: number[];
  onToggleSelected: (id: number) => void;
  onClearSelection: () => void;
  onOpenBulkTagging: () => void;
  onBulkMove: () => void;
  bulkMoving: boolean;
}) {
  const {
    items,
    total,
    mediaType,
    taggedStatus,
    onMediaTypeChange,
    onTaggedStatusChange,
    search,
    onSearchChange,
    loading,
    onRefresh,
    onScan,
    scanLoading,
    scanSummary,
    hasSources,
    onOpenItem,
    onOpenPlayer,
    selectedIds,
    onToggleSelected,
    onClearSelection,
    onOpenBulkTagging,
    onBulkMove,
    bulkMoving,
  } = props;

  const safeItems = Array.isArray(items) ? items : [];
  const safeErrors = Array.isArray(scanSummary?.errors)
    ? scanSummary!.errors
    : [];
  const selectedCount = selectedIds.length;

  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-xl font-medium">Library</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Tagged and untagged media are separated through the filter below.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={onRefresh}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
            >
              Refresh
            </button>

            <button
              onClick={onScan}
              disabled={scanLoading || !hasSources}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {scanLoading ? "Scanning..." : "Scan Library"}
            </button>
          </div>
        </div>

        {!hasSources ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Add at least one source folder in Settings before scanning.
          </div>
        ) : null}

        {scanSummary ? (
          <div className="mt-5 grid gap-3 md:grid-cols-5">
            <StatCard label="Sources" value={String(scanSummary.sources)} />
            <StatCard
              label="Files Seen"
              value={String(scanSummary.files_seen)}
            />
            <StatCard label="Inserted" value={String(scanSummary.inserted)} />
            <StatCard label="Updated" value={String(scanSummary.updated)} />
            <StatCard label="Skipped" value={String(scanSummary.skipped)} />
          </div>
        ) : null}

        {scanSummary && safeErrors.length > 0 ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <div className="text-sm font-medium text-red-200">Scan errors</div>
            <div className="mt-2 max-h-48 overflow-auto rounded-lg bg-zinc-950 p-3 text-xs text-red-100">
              {safeErrors.map((entry, index) => (
                <div key={`${entry}-${index}`} className="mb-1 break-all">
                  {entry}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-lg font-medium">Discovered Media</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Total in database: {total}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-190">
            <label className="grid gap-2">
              <span className="text-xs text-zinc-400">Search</span>
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search title, file, path, company"
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs text-zinc-400">Media Type</span>
              <select
                value={mediaType}
                onChange={(e) => onMediaTypeChange(e.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none"
              >
                <option value="all">All</option>
                <option value="movie">Movie</option>
                <option value="series_episode">Series Episode</option>
                <option value="video">Video</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-xs text-zinc-400">Tagging Status</span>
              <select
                value={taggedStatus}
                onChange={(e) => onTaggedStatusChange(e.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none"
              >
                <option value="all">All</option>
                <option value="tagged">Tagged</option>
                <option value="untagged">Untagged</option>
              </select>
            </label>
          </div>
        </div>

        {selectedCount > 0 ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
            <div className="text-sm text-emerald-100">
              {selectedCount} item(s) selected
            </div>

            <button
              onClick={onOpenBulkTagging}
              className="rounded-lg border border-emerald-400/40 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-500/10"
            >
              Bulk Tag
            </button>

            <button
              onClick={onBulkMove}
              disabled={bulkMoving}
              className="rounded-lg border border-emerald-400/40 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-500/10 disabled:opacity-60"
            >
              {bulkMoving ? "Moving..." : "Bulk Move"}
            </button>

            <button
              onClick={onClearSelection}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
            >
              Clear Selection
            </button>
          </div>
        ) : null}

        <div className="mt-5">
          {loading ? (
            <div className="text-sm text-zinc-400">Loading library...</div>
          ) : safeItems.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-6 text-sm text-zinc-500">
              No media found for the current filters.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {safeItems.map((item) => (
                <LibraryCard
                  key={item.id}
                  item={item}
                  selected={selectedIds.includes(item.id)}
                  onToggleSelected={() => onToggleSelected(item.id)}
                  onOpenTagging={() => onOpenItem(item.id)}
                  onOpenPlayer={() => onOpenPlayer(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SettingsView(props: {
  config: AppConfig;
  setConfig: Dispatch<SetStateAction<AppConfig>>;
  onSave: () => void;
  saving: boolean;
  newSource: string;
  setNewSource: (value: string) => void;
  addSource: () => void;
  removeSource: (index: number) => void;
}) {
  const {
    config,
    setConfig,
    onSave,
    saving,
    newSource,
    setNewSource,
    addSource,
    removeSource,
  } = props;

  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-xl font-medium">Sources</h2>
        <p className="mt-1 text-sm text-zinc-400">
          These folders are scanned recursively for supported video files.
        </p>

        <div className="mt-4 flex gap-3">
          <input
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
            placeholder="E:\Movies"
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
          />
          <button
            onClick={addSource}
            className="rounded-lg bg-zinc-100 px-4 py-2 text-zinc-900"
          >
            Add
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          {config.paths.sources.length === 0 ? (
            <div className="text-sm text-zinc-500">
              No source folders added yet.
            </div>
          ) : (
            config.paths.sources.map((src, index) => (
              <div
                key={`${src}-${index}`}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2"
              >
                <span className="text-sm break-all">{src}</span>
                <button
                  onClick={() => removeSource(index)}
                  className="text-sm text-red-300"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-xl font-medium">Paths</h2>

        <div className="mt-4 grid gap-4">
          <Field
            label="Library Root"
            value={config.paths.library_root}
            onChange={(value) =>
              setConfig((prev) => ({
                ...prev,
                paths: { ...prev.paths, library_root: value },
              }))
            }
          />
          <Field
            label="Views Root"
            value={config.paths.views_root}
            onChange={(value) =>
              setConfig((prev) => ({
                ...prev,
                paths: { ...prev.paths, views_root: value },
              }))
            }
          />
          <Field
            label="Preview Cache"
            value={config.paths.preview_cache}
            onChange={(value) =>
              setConfig((prev) => ({
                ...prev,
                paths: { ...prev.paths, preview_cache: value },
              }))
            }
          />
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-xl font-medium">Tools</h2>

        <div className="mt-4 grid gap-4">
          <Field
            label="FFmpeg Path"
            value={config.tools.ffmpeg}
            onChange={(value) =>
              setConfig((prev) => ({
                ...prev,
                tools: { ...prev.tools, ffmpeg: value },
              }))
            }
          />
          <Field
            label="FFprobe Path"
            value={config.tools.ffprobe}
            onChange={(value) =>
              setConfig((prev) => ({
                ...prev,
                tools: { ...prev.tools, ffprobe: value },
              }))
            }
          />
          <Field
            label="VLC Path (vlc.exe)"
            value={config.tools.vlc}
            onChange={(value) =>
              setConfig((prev) => ({
                ...prev,
                tools: { ...prev.tools, vlc: value },
              }))
            }
          />
        </div>
      </section>

      <div className="flex justify-end">
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-white px-5 py-2.5 text-black disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

function TabButton(props: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={props.onClick}
      className={`rounded-lg px-4 py-2 text-sm transition ${
        props.active
          ? "bg-white text-black"
          : "border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
      }`}
    >
      {props.children}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-zinc-400">{label}</span>
      <input
        className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function uniqueById<T extends { id: number }>(items: T[]) {
  const seen = new Map<number, T>();
  for (const item of items) seen.set(item.id, item);
  return Array.from(seen.values());
}

function sortByName<T extends { name: string }>(items: T[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

function sortCategories(items: Category[]) {
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.name.localeCompare(b.name);
  });
}

function sortSeries(items: Series[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/player/:id" element={<PlayerPage />} />
      </Routes>
    </BrowserRouter>
  );
}
