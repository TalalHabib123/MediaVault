import { useEffect, useMemo, useRef, useState } from "react";
import {
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { apiFetch } from "../../lib/api";
import type { BulkTaggingPayload } from "../../types";
import type {
  AppConfig,
  Category,
  Company,
  DeleteMediaPayload,
  DeleteMediaResponse,
  LibraryResponse,
  MediaDetailResponse,
  MediaItem,
  MetadataOptions,
  MoveJob,
  MoveJobResponse,
  MoveProgressResponse,
  Person,
  PreviewGenerationJob,
  PreviewJobResponse,
  PreviewProgressResponse,
  PreviewRegenerateTarget,
  ScanSummary,
  Series,
  Tag,
  UpdateMediaPayload,
  UpdateTaggingPayload,
} from "../../types";
import { emptyConfig } from "../../types";
import {
  parseDashboardTab,
  type TabKey,
} from "./dashboard-tabs";
import { formatPreviewJobTitle } from "../notifications/preview-job-notification";

const emptyOptions: MetadataOptions = {
  companies: [],
  people: [],
  categories: [],
  tags: [],
  series: [],
};

function setStringParam(params: URLSearchParams, key: string, value: string) {
  if (!value.trim()) {
    params.delete(key);
    return;
  }
  params.set(key, value);
}

export function useDashboardController() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = parseDashboardTab(searchParams.get("tab"));
  const librarySearch = searchParams.get("lib_q") ?? "";
  const mediaTypeFilter = searchParams.get("lib_type") ?? "all";
  const taggedStatusFilter = searchParams.get("lib_tagged") ?? "all";

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
  const [previewJob, setPreviewJob] = useState<PreviewGenerationJob | null>(
    null,
  );
  const [previewAssetVersion, setPreviewAssetVersion] = useState(() =>
    Date.now(),
  );
  const [moveJob, setMoveJob] = useState<MoveJob | null>(null);
  const [dismissedPreviewJobId, setDismissedPreviewJobId] = useState<
    string | null
  >(null);
  const [dismissedMoveJobId, setDismissedMoveJobId] = useState<string | null>(
    null,
  );
  const completedPreviewJobRef = useRef<string | null>(null);
  const completedMoveJobRef = useRef<string | null>(null);
  const [selectedDetail, setSelectedDetail] =
    useState<MediaDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [taggingSaving, setTaggingSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [newSource, setNewSource] = useState("");
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTagSaving, setBulkTagSaving] = useState(false);
  const [bulkMoving, setBulkMoving] = useState(false);
  const [toolActionBusy, setToolActionBusy] = useState(false);

  useEffect(() => {
    void Promise.all([loadSettings(), loadMetadataOptions()]);
  }, []);

  useEffect(() => {
    void loadPreviewProgress();
    void loadMoveProgress();
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

  useEffect(() => {
    if (!previewJob || previewJob.status !== "running") {
      return;
    }

    const interval = window.setInterval(() => {
      void loadPreviewProgress();
    }, 1000);

    return () => window.clearInterval(interval);
  }, [previewJob?.id, previewJob?.status]);

  useEffect(() => {
    if (!moveJob || moveJob.status !== "running") {
      return;
    }

    const interval = window.setInterval(() => {
      void loadMoveProgress();
    }, 800);

    return () => window.clearInterval(interval);
  }, [moveJob?.id, moveJob?.status]);

  useEffect(() => {
    if (!previewJob) return;

    if (dismissedPreviewJobId && dismissedPreviewJobId !== previewJob.id) {
      setDismissedPreviewJobId(null);
    }

    if (
      (previewJob.status === "completed" || previewJob.status === "canceled") &&
      completedPreviewJobRef.current !== previewJob.id
    ) {
      completedPreviewJobRef.current = previewJob.id;
      setPreviewAssetVersion(Date.now());

      if (previewJob.status !== "completed") {
        return;
      }

      setMessage(
        previewJob.failed_steps > 0
          ? `${formatPreviewJobTitle(previewJob)} reached 100% with ${previewJob.failed_steps} issue(s).`
          : `${formatPreviewJobTitle(previewJob)} reached 100%.`,
      );
    }
  }, [dismissedPreviewJobId, previewJob]);

  useEffect(() => {
    if (!moveJob) return;

    if (dismissedMoveJobId && dismissedMoveJobId !== moveJob.id) {
      setDismissedMoveJobId(null);
    }

    if (
      moveJob.status === "completed" &&
      completedMoveJobRef.current !== moveJob.id
    ) {
      completedMoveJobRef.current = moveJob.id;
      setMessage(
        `Move job finished. Moved: ${moveJob.succeeded_items}, already moved: ${moveJob.already_managed_items}, failed: ${moveJob.failed_items}.`,
      );
      void loadLibrary();

      if (
        selectedDetail &&
        moveJob.items.some((item) => item.media_id === selectedDetail.item.id)
      ) {
        void openItem(selectedDetail.item.id);
      }
    }
  }, [dismissedMoveJobId, moveJob, selectedDetail]);

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
    if (selectedIds.length === 0 || moveJob?.status === "running") return;

    try {
      setBulkMoving(true);
      setError("");
      setMessage("");

      const data = await apiFetch<MoveJobResponse>(
        "/api/library/bulk/move-to-library/start",
        {
          method: "POST",
          body: JSON.stringify({
            media_ids: selectedIds,
          }),
        },
      );

      setMoveJob(data?.job ?? null);
      setDismissedMoveJobId(null);
      setMessage("Bulk move job started.");
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
      if (taggedStatusFilter !== "all") {
        params.set("tagged_status", taggedStatusFilter);
      }

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

  async function loadPreviewProgress() {
    try {
      const data = await apiFetch<PreviewProgressResponse>(
        "/api/previews/progress",
      );
      setPreviewJob(data?.job ?? null);
    } catch {
      // Non-blocking polling failure.
    }
  }

  async function startPreviewRegeneration(target: PreviewRegenerateTarget) {
    const mediaIDs =
      selectedIds.length > 0 ? selectedIds : visibleItems.map((item) => item.id);

    if (mediaIDs.length === 0 || previewJob?.status === "running") {
      return;
    }

    try {
      setError("");
      setMessage("");

      const data = await apiFetch<PreviewJobResponse>("/api/previews/regenerate", {
        method: "POST",
        body: JSON.stringify({
          media_ids: mediaIDs,
          target,
        }),
      });

      setPreviewJob(data?.job ?? null);
      setDismissedPreviewJobId(null);
      setMessage(
        target === "thumbnails"
          ? "Thumbnail regeneration started."
          : "Hover preview regeneration started.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : target === "thumbnails"
            ? "Failed to regenerate thumbnails"
            : "Failed to regenerate hovers",
      );
    }
  }

  async function loadMoveProgress() {
    try {
      const data = await apiFetch<MoveProgressResponse>("/api/moves/progress");
      setMoveJob(data?.job ?? null);
    } catch {
      // Non-blocking polling failure.
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
        preview_job: data?.preview_job ?? null,
      });

      setPreviewJob(data?.preview_job ?? null);
      setDismissedPreviewJobId(null);
      setMessage(
        data?.preview_job
          ? "Scan completed. Preview generation started in the background."
          : "Scan completed.",
      );
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
      setError(err instanceof Error ? err.message : "Failed to load media item");
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
      setError(err instanceof Error ? err.message : "Failed to save media item");
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
    if (!selectedDetail || moveJob?.status === "running") return;

    try {
      setMoving(true);
      setError("");
      setMessage("");

      const data = await apiFetch<MoveJobResponse>(
        `/api/library/${selectedDetail.item.id}/move-to-library/start`,
        {
          method: "POST",
        },
      );

      setMoveJob(data?.job ?? null);
      setDismissedMoveJobId(null);
      setMessage("Move job started.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move media");
    } finally {
      setMoving(false);
    }
  }

  async function deleteSelectedMedia(payload: DeleteMediaPayload) {
    if (!selectedDetail) return;

    const mediaID = selectedDetail.item.id;

    try {
      setDeleting(true);
      setError("");
      setMessage("");

      const data = await apiFetch<DeleteMediaResponse>(
        `/api/library/${mediaID}/delete`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );

      setSelectedIds((prev) => prev.filter((id) => id !== mediaID));
      setSelectedDetail(null);

      if (data.mode === "delete_file") {
        setMessage("Deleted file and removed the media item from the library.");
      } else {
        setMessage(
          "Removed the media item from the library database. Files still in scanned source folders will return after a rescan.",
        );
      }

      await loadLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete media");
    } finally {
      setDeleting(false);
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
        sources: prev.paths.sources.filter((_, currentIndex) => currentIndex !== index),
      },
    }));
  }

  return {
    activeTab,
    librarySearch,
    mediaTypeFilter,
    taggedStatusFilter,
    config,
    setConfig,
    configLoading,
    configSaving,
    options,
    optionsLoading,
    libraryTotal,
    libraryLoading,
    scanLoading,
    scanSummary,
    previewJob,
    previewAssetVersion,
    moveJob,
    dismissedPreviewJobId,
    setDismissedPreviewJobId,
    dismissedMoveJobId,
    setDismissedMoveJobId,
    selectedDetail,
    setSelectedDetail,
    detailLoading,
    detailSaving,
    taggingSaving,
    error,
    message,
    newSource,
    setNewSource,
    moving,
    deleting,
    selectedIds,
    bulkTagOpen,
    setBulkTagOpen,
    bulkTagSaving,
    bulkMoving,
    toolActionBusy,
    visibleItems,
    setActiveTab,
    setLibrarySearch,
    setLibraryMediaType,
    setLibraryTaggedStatus,
    toggleSelected,
    clearSelection,
    applyBulkTagging,
    openInVLCById,
    bulkMoveSelected,
    openSelectedInVLC,
    revealSelectedFile,
    loadLibrary,
    startPreviewRegeneration,
    runScan,
    openItem,
    saveItem,
    createSeries,
    saveTagging,
    createCompany,
    createPerson,
    createCategory,
    createTag,
    moveSelectedToLibrary,
    deleteSelectedMedia,
    addSource,
    removeSource,
    saveSettings,
    openPlayer,
  };
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
