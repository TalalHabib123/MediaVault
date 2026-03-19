import { useEffect, useMemo, useState } from "react";
import type { BulkTaggingPayload, MetadataOptions } from "../types";

type Props = {
  open: boolean;
  selectedCount: number;
  options: MetadataOptions;
  saving: boolean;
  onClose: () => void;
  onApply: (payload: BulkTaggingPayload) => Promise<void>;
};

export default function BulkTagDrawer({
  open,
  selectedCount,
  options,
  saving,
  onClose,
  onApply,
}: Props) {
  const [setCompany, setSetCompany] = useState(false);
  const [companyId, setCompanyId] = useState<number | "">("");
  const [setSeries, setSetSeries] = useState(false);
  const [seriesId, setSeriesId] = useState<number | "">("");
  const [personIds, setPersonIds] = useState<number[]>([]);
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [tagIds, setTagIds] = useState<number[]>([]);

  const mainCategories = useMemo(
    () => options.categories.filter((item) => item.kind === "main"),
    [options.categories]
  );

  useEffect(() => {
    if (!open) return;
    setSetCompany(false);
    setCompanyId("");
    setSetSeries(false);
    setSeriesId("");
    setPersonIds([]);
    setCategoryIds([]);
    setTagIds([]);
  }, [open]);

  if (!open) return null;

  function toggleId(list: number[], value: number) {
    console.log(mainCategories)
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  async function apply() {
    await onApply({
      set_company: setCompany,
      company_id: companyId === "" ? null : Number(companyId),
      set_series: setSeries,
      series_id: seriesId === "" ? null : Number(seriesId),
      person_ids: personIds,
      category_ids: categoryIds,
      tag_ids: tagIds,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <button className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close bulk tagging" />
      <div className="relative ml-auto h-full w-full max-w-2xl overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">Bulk Tagging</div>
            <h2 className="mt-1 text-2xl font-semibold">Apply to {selectedCount} selected item(s)</h2>
            <p className="mt-2 text-sm text-zinc-400">
              People, categories, and tags are added to each selected item. Company and series are optional set/clear actions.
            </p>
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
            <h3 className="text-lg font-medium">Optional Company / Series Set</h3>

            <div className="mt-4 grid gap-5">
              <div className="grid gap-3">
                <label className="flex items-center gap-3 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={setCompany}
                    onChange={(e) => setSetCompany(e.target.checked)}
                  />
                  Update company for selected items
                </label>

                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value === "" ? "" : Number(e.target.value))}
                  disabled={!setCompany}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none disabled:opacity-50"
                >
                  <option value="">Clear company</option>
                  {options.companies.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3">
                <label className="flex items-center gap-3 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={setSeries}
                    onChange={(e) => setSetSeries(e.target.checked)}
                  />
                  Update series for selected items
                </label>

                <select
                  value={seriesId}
                  onChange={(e) => setSeriesId(e.target.value === "" ? "" : Number(e.target.value))}
                  disabled={!setSeries}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none disabled:opacity-50"
                >
                  <option value="">Clear series</option>
                  {options.series.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.company_name ? `${item.name} (${item.company_name})` : item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <ToggleGroup
            title="People"
            subtitle="These will be added to every selected item."
            selectedIds={personIds}
            items={options.people.map((item) => ({ id: item.id, name: item.name }))}
            onToggle={(id) => setPersonIds((prev) => toggleId(prev, id))}
          />

          <ToggleGroup
            title="Categories"
            subtitle="These will be added to every selected item."
            selectedIds={categoryIds}
            items={options.categories.map((item) => ({
              id: item.id,
              name: item.kind === "sub" && item.parent_name ? `${item.parent_name} → ${item.name}` : item.name,
            }))}
            onToggle={(id) => setCategoryIds((prev) => toggleId(prev, id))}
          />

          <ToggleGroup
            title="Tags"
            subtitle="These will be added to every selected item."
            selectedIds={tagIds}
            items={options.tags.map((item) => ({ id: item.id, name: item.name }))}
            onToggle={(id) => setTagIds((prev) => toggleId(prev, id))}
          />

          <div className="flex justify-end">
            <button
              onClick={apply}
              disabled={saving}
              className="rounded-lg bg-white px-5 py-2.5 text-black disabled:opacity-60"
            >
              {saving ? "Applying..." : "Apply Bulk Tagging"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleGroup({
  title,
  subtitle,
  items,
  selectedIds,
  onToggle,
}: {
  title: string;
  subtitle: string;
  items: { id: number; name: string }[];
  selectedIds: number[];
  onToggle: (id: number) => void;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>

      <div className="mt-4 flex flex-wrap gap-2">
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
    </section>
  );
}