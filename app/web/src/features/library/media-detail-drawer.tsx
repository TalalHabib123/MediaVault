import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  Category,
  Company,
  DeleteMediaMode,
  DeleteMediaPayload,
  MediaDetailResponse,
  MediaType,
  MetadataOptions,
  Person,
  Series,
  Tag,
  UpdateMediaPayload,
  UpdateTaggingPayload,
} from "../../types";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";

type Props = {
  detail: MediaDetailResponse | null;
  options: MetadataOptions;
  savingDetails: boolean;
  savingTagging: boolean;
  moving: boolean;
  deleting: boolean;
  onClose: () => void;
  onSaveDetails: (payload: UpdateMediaPayload) => Promise<void>;
  onSaveTagging: (payload: UpdateTaggingPayload) => Promise<void>;
  onMoveToLibrary: () => Promise<void>;
  onDelete: (payload: DeleteMediaPayload) => Promise<void>;
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

export function MediaDetailDrawer({
  detail,
  options,
  savingDetails,
  savingTagging,
  moving,
  deleting,
  onClose,
  onSaveDetails,
  onSaveTagging,
  onMoveToLibrary,
  onDelete,
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
  const [deleteMode, setDeleteMode] =
    useState<DeleteMediaMode>("delete_file");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busyCreate, setBusyCreate] = useState("");

  const mainCategories = useMemo(
    () => options.categories.filter((item) => item.kind === "main"),
    [options.categories],
  );

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
    setNewCompany("");
    setNewSeries("");
    setNewPerson("");
    setNewMainCategory("");
    setNewSubCategory("");
    setSubParentId("");
    setNewTag("");
    setDeleteMode("delete_file");
    setConfirmDelete(false);
  }, [detail]);

  if (!detail) return null;

  const isSeries = mediaType === "series_episode";
  const movedToVault = Boolean(detail.item.canonical_path?.trim());

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
        className="drawer-backdrop absolute inset-0"
        aria-label="Close drawer"
        onClick={onClose}
      />

      <div className="drawer-shell relative ml-auto h-full w-full max-w-3xl overflow-y-auto p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="page-kicker">Media Detail</div>
            <h2 className="brand-title mt-2 text-3xl">{detail.item.title}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="default">{formatMediaType(detail.item.media_type)}</Badge>
              <Badge variant={detail.item.is_tagged ? "success" : "warning"}>
                {detail.item.is_tagged ? "Tagged" : "Untagged"}
              </Badge>
              {movedToVault ? <Badge variant="info">Moved</Badge> : null}
            </div>
            <p className="mt-3 max-w-2xl break-all text-sm text-(--text-muted)">
              {detail.item.file_name}
            </p>
          </div>

          <Button onClick={onClose} variant="ghost">
            Close
          </Button>
        </div>

        <div className="mt-6 grid gap-6">
          <Card className="p-6">
            <CardHeader
              title="Manual Media Fields"
              description="Saving here locks these values so future rescans do not overwrite them."
            />
            <CardContent className="grid gap-4">
              <Field label="Title">
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </Field>

              <Field label="Media Type">
                <Select
                  value={mediaType}
                  onChange={(event) =>
                    setMediaType(event.target.value as MediaType)
                  }
                >
                  <option value="video">Video</option>
                  <option value="series_episode">Series Episode</option>
                  <option value="movie">Movie</option>
                </Select>
              </Field>

              {isSeries ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Season Number">
                    <Input
                      type="number"
                      min={0}
                      value={seasonNumber}
                      onChange={(event) =>
                        setSeasonNumber(Number(event.target.value) || 0)
                      }
                    />
                  </Field>
                  <Field label="Episode Number">
                    <Input
                      type="number"
                      min={0}
                      value={episodeNumber}
                      onChange={(event) =>
                        setEpisodeNumber(Number(event.target.value) || 0)
                      }
                    />
                  </Field>
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button
                  onClick={() =>
                    onSaveDetails({
                      title: title.trim(),
                      media_type: mediaType,
                      season_number: isSeries ? seasonNumber : 0,
                      episode_number: isSeries ? episodeNumber : 0,
                    })
                  }
                  disabled={savingDetails || !title.trim()}
                  variant="primary"
                >
                  {savingDetails ? "Saving..." : "Save Manual Fields"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="p-6">
            <CardHeader
              title="Tagging"
              description="Assign a company, series, people, categories, and tags. Series can inherit a parent company."
            />
            <CardContent className="grid gap-6">
              <div className="grid gap-3">
                <Field label="Company">
                  <Select
                    value={companyId}
                    onChange={(event) =>
                      setCompanyId(
                        event.target.value === ""
                          ? ""
                          : Number(event.target.value),
                      )
                    }
                  >
                    <option value="">No company assigned</option>
                    {options.companies.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <InlineCreate
                  value={newCompany}
                  onChange={setNewCompany}
                  placeholder="Quick add company"
                  buttonText={
                    busyCreate === "company" ? "Saving..." : "Create and Select"
                  }
                  onSubmit={quickCreateCompany}
                />
              </div>

              <div className="grid gap-3">
                <Field label="Series">
                  <Select
                    value={seriesId}
                    onChange={(event) =>
                      setSeriesId(
                        event.target.value === ""
                          ? ""
                          : Number(event.target.value),
                      )
                    }
                  >
                    <option value="">No series assigned</option>
                    {options.series.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.company_name
                          ? `${item.name} (${item.company_name})`
                          : item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <InlineCreate
                  value={newSeries}
                  onChange={setNewSeries}
                  placeholder="Quick add series"
                  buttonText={
                    busyCreate === "series" ? "Saving..." : "Create and Select"
                  }
                  onSubmit={quickCreateSeries}
                />
              </div>

              <ChipGroup
                title="People"
                items={options.people.map((item) => ({
                  id: item.id,
                  name: item.name,
                }))}
                selectedIds={personIds}
                onToggle={(id) => setPersonIds((prev) => toggleId(prev, id))}
              />
              <InlineCreate
                value={newPerson}
                onChange={setNewPerson}
                placeholder="Quick add person"
                buttonText={
                  busyCreate === "person" ? "Saving..." : "Create and Select"
                }
                onSubmit={quickCreatePerson}
              />

              <ChipGroup
                title="Categories"
                items={options.categories.map((item) => ({
                  id: item.id,
                  name:
                    item.kind === "sub" && item.parent_name
                      ? `${item.parent_name} -> ${item.name}`
                      : item.name,
                }))}
                selectedIds={categoryIds}
                onToggle={(id) =>
                  setCategoryIds((prev) => toggleId(prev, id))
                }
              />

              <div className="grid gap-4 lg:grid-cols-2">
                <InlineCreate
                  value={newMainCategory}
                  onChange={setNewMainCategory}
                  placeholder="Quick add main category"
                  buttonText={
                    busyCreate === "main-category"
                      ? "Saving..."
                      : "Create and Select"
                  }
                  onSubmit={quickCreateMainCategory}
                />

                <div className="grid gap-3">
                  <Input
                    value={newSubCategory}
                    onChange={(event) => setNewSubCategory(event.target.value)}
                    placeholder="Quick add sub category"
                  />
                  <Select
                    value={subParentId}
                    onChange={(event) =>
                      setSubParentId(
                        event.target.value === ""
                          ? ""
                          : Number(event.target.value),
                      )
                    }
                  >
                    <option value="">Select parent main category</option>
                    {mainCategories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                  <Button onClick={quickCreateSubCategory} variant="secondary">
                    {busyCreate === "sub-category"
                      ? "Saving..."
                      : "Create and Select"}
                  </Button>
                </div>
              </div>

              <ChipGroup
                title="Tags"
                items={options.tags.map((item) => ({
                  id: item.id,
                  name: item.name,
                }))}
                selectedIds={tagIds}
                onToggle={(id) => setTagIds((prev) => toggleId(prev, id))}
              />
              <InlineCreate
                value={newTag}
                onChange={setNewTag}
                placeholder="Quick add tag"
                buttonText={
                  busyCreate === "tag" ? "Saving..." : "Create and Select"
                }
                onSubmit={quickCreateTag}
              />

              <div className="flex justify-end">
                <Button
                  onClick={saveTagging}
                  disabled={savingTagging}
                  variant="primary"
                >
                  {savingTagging ? "Saving..." : "Save Tagging"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="p-6">
            <CardHeader
              title="Tool Actions"
              description="Open the current media in VLC or reveal the resolved path in the file explorer."
            />
            <CardContent className="flex flex-wrap gap-3">
              <Button
                onClick={onOpenInVLC}
                disabled={toolActionBusy}
                variant="outline"
              >
                Open in VLC
              </Button>
              <Button
                onClick={onRevealFile}
                disabled={toolActionBusy}
                variant="secondary"
              >
                Reveal in Folder
              </Button>
            </CardContent>
          </Card>

          <Card className="p-6">
            <CardHeader
              title="Managed Move"
              description="Moves the file out of its source location into the configured library root."
            />
            <CardContent className="flex items-center justify-between gap-4">
              <div className="text-sm text-(--text-muted)">
                Use this when the file should be formally managed inside the
                vault and protected from accidental double moves.
              </div>
              <Button
                onClick={onMoveToLibrary}
                disabled={moving}
                variant="primary"
              >
                {moving ? "Moving..." : "Move To Library"}
              </Button>
            </CardContent>
          </Card>

          <section className="drawer-section drawer-section-danger">
            <div className="flex flex-col gap-4">
              <div>
                <div className="page-kicker text-(--danger)">Danger Zone</div>
                <h3 className="mt-2 text-xl font-semibold text-(--text-primary)">
                  Delete or clean up this item
                </h3>
                <p className="mt-2 text-sm leading-6 text-(--text-muted)">
                  File deletion is permanent. DB cleanup removes only the
                  record, so rescans can bring the file back if it still exists
                  in a watched source.
                </p>
              </div>

              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteMode("delete_file");
                    setConfirmDelete(false);
                  }}
                  className={`rounded-[1.15rem] border px-4 py-4 text-left transition ${
                    deleteMode === "delete_file"
                      ? "border-(--danger-border) bg-[rgba(207,109,103,0.12)]"
                      : "border-(--border-default) bg-(--surface-2)"
                  }`}
                >
                  <div className="font-semibold text-(--text-primary)">
                    Delete File and Remove From Library
                  </div>
                  <div className="mt-1 text-sm text-(--text-muted)">
                    Recommended for real deletion. Removes the media file,
                    record, and related preview cache.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDeleteMode("db_only");
                    setConfirmDelete(false);
                  }}
                  className={`rounded-[1.15rem] border px-4 py-4 text-left transition ${
                    deleteMode === "db_only"
                      ? "border-(--warning-border) bg-[rgba(214,168,108,0.12)]"
                      : "border-(--border-default) bg-(--surface-2)"
                  }`}
                >
                  <div className="font-semibold text-(--text-primary)">
                    DB Cleanup Only
                  </div>
                  <div className="mt-1 text-sm text-(--text-muted)">
                    Keeps the file on disk and removes only the database entry.
                  </div>
                </button>
              </div>

              {deleteMode === "delete_file" ? (
                <Alert tone="danger">
                  This permanently deletes the current media file from disk and
                  then removes the database record.
                </Alert>
              ) : (
                <Alert tone="warning">
                  If this file still exists inside a scanned source folder, a
                  later scan will add it back to the library.
                </Alert>
              )}

              {confirmDelete ? (
                <div className="surface-muted rounded-[1.25rem] p-4">
                  <div className="text-sm text-(--text-primary)">
                    {deleteMode === "delete_file"
                      ? "Confirm permanent file deletion and library cleanup for this item."
                      : "Confirm database-only cleanup for this item."}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      onClick={() => onDelete({ mode: deleteMode })}
                      disabled={deleting}
                      variant="danger"
                    >
                      {deleting
                        ? "Deleting..."
                        : deleteMode === "delete_file"
                          ? "Confirm Delete File"
                          : "Confirm DB Cleanup"}
                    </Button>
                    <Button
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
                  <Button
                    onClick={() => setConfirmDelete(true)}
                    disabled={deleting}
                    variant="outline"
                  >
                    {deleteMode === "delete_file"
                      ? "Review Permanent Delete"
                      : "Review DB Cleanup"}
                  </Button>
                </div>
              )}
            </div>
          </section>

          <Card className="p-6">
            <CardHeader
              title="Technical Metadata"
              description="Read-only file and media details derived from the current record."
            />
            <CardContent className="kv-grid">
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <label className="field-label">
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

function InlineCreate(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  buttonText: string;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row">
      <Input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        className="flex-1"
      />
      <Button onClick={props.onSubmit} variant="secondary">
        {props.buttonText}
      </Button>
    </div>
  );
}

function ChipGroup(props: {
  title: string;
  items: { id: number; name: string }[];
  selectedIds: number[];
  onToggle: (id: number) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="page-kicker">{props.title}</div>
      <div className="flex flex-wrap gap-2">
        {props.items.length === 0 ? (
          <div className="empty-state w-full">No options yet.</div>
        ) : (
          props.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => props.onToggle(item.id)}
              className={`choice-chip ${
                props.selectedIds.includes(item.id)
                  ? "choice-chip-selected"
                  : ""
              }`}
            >
              {item.name}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function InfoRow(props: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="kv-row">
      <div className="kv-label">{props.label}</div>
      <div className={props.mono ? "kv-value kv-value-mono" : "kv-value"}>
        {props.value}
      </div>
    </div>
  );
}

function formatMediaType(value: MediaType) {
  if (value === "series_episode") return "Series Episode";
  if (value === "movie") return "Movie";
  return "Video";
}

function formatDuration(seconds: number) {
  if (!seconds || seconds <= 0) return "Unknown";
  const rounded = Math.floor(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  return `${minutes}m ${secs}s`;
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
