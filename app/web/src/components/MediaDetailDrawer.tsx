import { useEffect, useMemo, useState } from "react";
import type {
  Category,
  Company,
  MediaDetailResponse,
  MediaType,
  MetadataOptions,
  Person,
  Series,
  Tag,
  UpdateMediaPayload,
  UpdateTaggingPayload,
} from "../types";

type Props = {
  detail: MediaDetailResponse | null;
  options: MetadataOptions;
  savingDetails: boolean;
  savingTagging: boolean;
  moving: boolean;
  onClose: () => void;
  onSaveDetails: (payload: UpdateMediaPayload) => Promise<void>;
  onSaveTagging: (payload: UpdateTaggingPayload) => Promise<void>;
  onMoveToLibrary: () => Promise<void>;
  onCreateCompany: (name: string) => Promise<Company>;
  onCreatePerson: (name: string) => Promise<Person>;
  onCreateCategory: (payload: {
    name: string;
    kind: "main" | "sub";
    parent_id: number | null;
  }) => Promise<Category>;
  onCreateTag: (name: string) => Promise<Tag>;
  onCreateSeries: (payload: {
    name: string;
    company_id: number | null;
  }) => Promise<Series>;
  toolActionBusy: boolean;
  onOpenInVLC: () => Promise<void>;
  onRevealFile: () => Promise<void>;
};

export default function MediaDetailDrawer({
  detail,
  options,
  savingDetails,
  savingTagging,
  moving,
  onClose,
  onSaveDetails,
  onSaveTagging,
  onMoveToLibrary,
  onCreateCompany,
  onCreatePerson,
  onCreateCategory,
  onCreateTag,
  onCreateSeries,
  toolActionBusy,
  onOpenInVLC,
  onRevealFile,
}: Props) {
  const [title, setTitle] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("video");
  const [seasonNumber, setSeasonNumber] = useState(0);
  const [episodeNumber, setEpisodeNumber] = useState(0);

  const [companyId, setCompanyId] = useState<number | "">("");
  const [seriesId, setSeriesId] = useState<number | "">("");
  const [personIds, setPersonIds] = useState<number[]>([]);
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [tagIds, setTagIds] = useState<number[]>([]);

  const [newCompany, setNewCompany] = useState("");
  const [newSeries, setNewSeries] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [newMainCategory, setNewMainCategory] = useState("");
  const [newSubCategory, setNewSubCategory] = useState("");
  const [subParentId, setSubParentId] = useState<number | "">("");
  const [newTag, setNewTag] = useState("");

  const [busyCreate, setBusyCreate] = useState("");

  useEffect(() => {
    if (!detail) return;

    setTitle(detail.item.title);
    setMediaType(detail.item.media_type);
    setSeasonNumber(detail.item.season_number);
    setEpisodeNumber(detail.item.episode_number);

    setCompanyId(detail.assignments.company_id ?? "");
    setSeriesId(detail.assignments.series_id ?? "");
    setPersonIds(
      Array.isArray(detail.assignments.person_ids)
        ? detail.assignments.person_ids
        : [],
    );
    setCategoryIds(
      Array.isArray(detail.assignments.category_ids)
        ? detail.assignments.category_ids
        : [],
    );
    setTagIds(
      Array.isArray(detail.assignments.tag_ids)
        ? detail.assignments.tag_ids
        : [],
    );
  }, [detail]);

  const mainCategories = useMemo(
    () => options.categories.filter((item) => item.kind === "main"),
    [options.categories],
  );

  const isSeries = mediaType === "series_episode";

  if (!detail) return null;

  function toggleId(list: number[], value: number) {
    return list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];
  }

  async function saveTagging() {
    await onSaveTagging({
      company_id: companyId === "" ? null : Number(companyId),
      series_id: seriesId === "" ? null : Number(seriesId),
      person_ids: personIds,
      category_ids: categoryIds,
      tag_ids: tagIds,
    });
  }

  async function quickCreateCompany() {
    const name = newCompany.trim();
    if (!name) return;
    try {
      setBusyCreate("company");
      const created = await onCreateCompany(name);
      setCompanyId(created.id);
      setNewCompany("");
    } finally {
      setBusyCreate("");
    }
  }

  async function quickCreateSeries() {
    const name = newSeries.trim();
    if (!name) return;
    try {
      setBusyCreate("series");
      const created = await onCreateSeries({
        name,
        company_id: companyId === "" ? null : Number(companyId),
      });
      setSeriesId(created.id);
      setNewSeries("");
    } finally {
      setBusyCreate("");
    }
  }

  async function quickCreatePerson() {
    const name = newPerson.trim();
    if (!name) return;
    try {
      setBusyCreate("person");
      const created = await onCreatePerson(name);
      setPersonIds((prev) =>
        prev.includes(created.id) ? prev : [...prev, created.id],
      );
      setNewPerson("");
    } finally {
      setBusyCreate("");
    }
  }

  async function quickCreateMainCategory() {
    const name = newMainCategory.trim();
    if (!name) return;
    try {
      setBusyCreate("main-category");
      const created = await onCreateCategory({
        name,
        kind: "main",
        parent_id: null,
      });
      setCategoryIds((prev) =>
        prev.includes(created.id) ? prev : [...prev, created.id],
      );
      setNewMainCategory("");
    } finally {
      setBusyCreate("");
    }
  }

  async function quickCreateSubCategory() {
    const name = newSubCategory.trim();
    if (!name || subParentId === "") return;
    try {
      setBusyCreate("sub-category");
      const created = await onCreateCategory({
        name,
        kind: "sub",
        parent_id: Number(subParentId),
      });
      setCategoryIds((prev) =>
        prev.includes(created.id) ? prev : [...prev, created.id],
      );
      setNewSubCategory("");
    } finally {
      setBusyCreate("");
    }
  }

  async function quickCreateTag() {
    const name = newTag.trim();
    if (!name) return;
    try {
      setBusyCreate("tag");
      const created = await onCreateTag(name);
      setTagIds((prev) =>
        prev.includes(created.id) ? prev : [...prev, created.id],
      );
      setNewTag("");
    } finally {
      setBusyCreate("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        className="absolute inset-0 bg-black/60"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <div className="relative ml-auto h-full w-full max-w-3xl overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Media Detail
            </div>
            <h2 className="mt-1 text-2xl font-semibold">{detail.item.title}</h2>
            <div className="mt-2 text-sm text-zinc-400">
              {detail.item.file_name}
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-6">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h3 className="text-lg font-medium">Manual Media Fields</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Saving here locks these fields so future rescans do not overwrite
              them.
            </p>

            <div className="mt-4 grid gap-4">
              <Field label="Title" value={title} onChange={setTitle} />

              <label className="grid gap-2">
                <span className="text-sm text-zinc-400">Media Type</span>
                <select
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value as MediaType)}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
                >
                  <option value="video">Video</option>
                  <option value="series_episode">Series Episode</option>
                  <option value="movie">Movie</option>
                </select>
              </label>

              {isSeries ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm text-zinc-400">Season Number</span>
                    <input
                      type="number"
                      min={0}
                      value={seasonNumber}
                      onChange={(e) =>
                        setSeasonNumber(Number(e.target.value) || 0)
                      }
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm text-zinc-400">
                      Episode Number
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={episodeNumber}
                      onChange={(e) =>
                        setEpisodeNumber(Number(e.target.value) || 0)
                      }
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
                    />
                  </label>
                </div>
              ) : null}

              <div className="flex justify-end">
                <button
                  onClick={() =>
                    onSaveDetails({
                      title: title.trim(),
                      media_type: mediaType,
                      season_number: isSeries ? seasonNumber : 0,
                      episode_number: isSeries ? episodeNumber : 0,
                    })
                  }
                  disabled={savingDetails || !title.trim()}
                  className="rounded-lg bg-white px-5 py-2.5 text-black disabled:opacity-60"
                >
                  {savingDetails ? "Saving..." : "Save Manual Fields"}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h3 className="text-lg font-medium">Tagging</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Series can belong to a parent company. When you assign a series,
              its parent company will be used automatically if that series has
              one.
            </p>

            <div className="mt-4 grid gap-6">
              <div className="grid gap-3">
                <label className="grid gap-2">
                  <span className="text-sm text-zinc-400">Company</span>
                  <select
                    value={companyId}
                    onChange={(e) =>
                      setCompanyId(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
                  >
                    <option value="">No company assigned</option>
                    {options.companies.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <InlineCreate
                  value={newCompany}
                  onChange={setNewCompany}
                  placeholder="Quick add company"
                  buttonText={
                    busyCreate === "company" ? "Saving..." : "Create & Select"
                  }
                  onSubmit={quickCreateCompany}
                />
              </div>

              <div className="grid gap-3">
                <label className="grid gap-2">
                  <span className="text-sm text-zinc-400">Series</span>
                  <select
                    value={seriesId}
                    onChange={(e) =>
                      setSeriesId(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
                  >
                    <option value="">No series assigned</option>
                    {options.series.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.company_name
                          ? `${item.name} (${item.company_name})`
                          : item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <InlineCreate
                  value={newSeries}
                  onChange={setNewSeries}
                  placeholder="Quick add series"
                  buttonText={
                    busyCreate === "series" ? "Saving..." : "Create & Select"
                  }
                  onSubmit={quickCreateSeries}
                />
              </div>

              <ToggleGroup
                title="People"
                selectedIds={personIds}
                items={options.people}
                onToggle={(id) => setPersonIds((prev) => toggleId(prev, id))}
              />
              <InlineCreate
                value={newPerson}
                onChange={setNewPerson}
                placeholder="Quick add person"
                buttonText={
                  busyCreate === "person" ? "Saving..." : "Create & Select"
                }
                onSubmit={quickCreatePerson}
              />

              <ToggleGroup
                title="Categories"
                selectedIds={categoryIds}
                items={options.categories.map((item) => ({
                  id: item.id,
                  name:
                    item.kind === "sub" && item.parent_name
                      ? `${item.parent_name} → ${item.name}`
                      : item.name,
                }))}
                onToggle={(id) => setCategoryIds((prev) => toggleId(prev, id))}
              />

              <div className="grid gap-3 lg:grid-cols-2">
                <InlineCreate
                  value={newMainCategory}
                  onChange={setNewMainCategory}
                  placeholder="Quick add main category"
                  buttonText={
                    busyCreate === "main-category"
                      ? "Saving..."
                      : "Create & Select"
                  }
                  onSubmit={quickCreateMainCategory}
                />

                <div className="grid gap-2">
                  <input
                    value={newSubCategory}
                    onChange={(e) => setNewSubCategory(e.target.value)}
                    placeholder="Quick add sub category"
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
                  />
                  <select
                    value={subParentId}
                    onChange={(e) =>
                      setSubParentId(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
                  >
                    <option value="">Select parent main category</option>
                    {mainCategories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={quickCreateSubCategory}
                    className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
                  >
                    {busyCreate === "sub-category"
                      ? "Saving..."
                      : "Create & Select"}
                  </button>
                </div>
              </div>

              <ToggleGroup
                title="Tags"
                selectedIds={tagIds}
                items={options.tags}
                onToggle={(id) => setTagIds((prev) => toggleId(prev, id))}
              />
              <InlineCreate
                value={newTag}
                onChange={setNewTag}
                placeholder="Quick add tag"
                buttonText={
                  busyCreate === "tag" ? "Saving..." : "Create & Select"
                }
                onSubmit={quickCreateTag}
              />

              <div className="flex justify-end">
                <button
                  onClick={saveTagging}
                  disabled={savingTagging}
                  className="rounded-lg bg-white px-5 py-2.5 text-black disabled:opacity-60"
                >
                  {savingTagging ? "Saving..." : "Save Tagging"}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={onOpenInVLC}
                disabled={toolActionBusy}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
              >
                Open in VLC
              </button>

              <button
                onClick={onRevealFile}
                disabled={toolActionBusy}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
              >
                Reveal in Folder
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-medium">Managed Move</h3>
                <p className="mt-1 text-sm text-zinc-400">
                  Moves the file out of the source location into the configured
                  destination library root.
                </p>
              </div>

              <button
                onClick={onMoveToLibrary}
                disabled={moving}
                className="rounded-lg bg-white px-5 py-2.5 text-black disabled:opacity-60"
              >
                {moving ? "Moving..." : "Move To Library"}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h3 className="text-lg font-medium">Technical Metadata</h3>

            <div className="mt-4 grid gap-3">
              <InfoRow
                label="Tagged Status"
                value={detail.item.is_tagged ? "Tagged" : "Untagged"}
              />
              <InfoRow
                label="Company"
                value={detail.item.company_name || "None"}
              />
              <InfoRow
                label="Series"
                value={detail.item.series_name || "None"}
              />
              <InfoRow
                label="Current Path"
                value={detail.item.canonical_path || detail.item.source_path}
                mono
              />
              <InfoRow
                label="Original Path Field"
                value={detail.item.source_path}
                mono
              />
              <InfoRow
                label="Canonical Path"
                value={detail.item.canonical_path || "Not managed yet"}
                mono
              />
              <InfoRow
                label="Extension"
                value={detail.item.extension || "Unknown"}
              />
              <InfoRow
                label="Duration"
                value={formatDuration(detail.item.duration_seconds)}
              />
              <InfoRow
                label="Resolution"
                value={
                  detail.item.width > 0 && detail.item.height > 0
                    ? `${detail.item.width}x${detail.item.height}`
                    : "Unknown"
                }
              />
              <InfoRow
                label="Video Codec"
                value={detail.item.video_codec || "Unknown"}
              />
              <InfoRow
                label="Audio Codec"
                value={detail.item.audio_codec || "Unknown"}
              />
              <InfoRow
                label="Size"
                value={formatBytes(detail.item.filesize_bytes)}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ToggleGroup({
  title,
  items,
  selectedIds,
  onToggle,
}: {
  title: string;
  items: { id: number; name: string }[];
  selectedIds: number[];
  onToggle: (id: number) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="text-sm text-zinc-400">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.length === 0 ? (
          <div className="text-sm text-zinc-500">No options yet.</div>
        ) : (
          items.map((item) => {
            const selected = selectedIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggle(item.id)}
                className={`rounded-full px-3 py-1.5 text-sm transition ${
                  selected
                    ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                    : "border border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-900"
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

function InlineCreate({
  value,
  onChange,
  placeholder,
  buttonText,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  buttonText: string;
  onSubmit: () => void;
}) {
  return (
    <div className="flex gap-3">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
      />
      <button
        onClick={onSubmit}
        className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
      >
        {buttonText}
      </button>
    </div>
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

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div
        className={
          mono
            ? "break-all font-mono text-sm text-zinc-200"
            : "text-sm text-zinc-200"
        }
      >
        {value}
      </div>
    </div>
  );
}

function formatDuration(seconds: number) {
  if (!seconds || seconds <= 0) return "Unknown";

  const rounded = Math.floor(seconds);
  const hrs = Math.floor(rounded / 3600);
  const mins = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;

  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return "Unknown";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
