import { useEffect, useMemo, useState } from "react";
import type { BulkTaggingPayload, MetadataOptions } from "../../types";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Select } from "../../components/ui/select";

type Props = {
  open: boolean;
  selectedCount: number;
  options: MetadataOptions;
  saving: boolean;
  onClose: () => void;
  onApply: (payload: BulkTaggingPayload) => Promise<void>;
};

export function BulkTagDrawer({
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
    [options.categories],
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
    return list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];
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
      <button
        className="drawer-backdrop absolute inset-0"
        onClick={onClose}
        aria-label="Close bulk tagging"
      />

      <div className="drawer-shell relative ml-auto h-full w-full max-w-2xl overflow-y-auto p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="page-kicker">Bulk Tagging</div>
            <h2 className="brand-title mt-2 text-3xl">
              Apply to {selectedCount} selected item(s)
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--text-muted)]">
              People, categories, and tags are added to every selected item.
              Company and series remain optional set or clear actions.
            </p>
          </div>

          <Button onClick={onClose} variant="ghost">
            Close
          </Button>
        </div>

        <div className="mt-6 grid gap-6">
          <Card className="p-6">
            <CardHeader
              title="Optional Company and Series Set"
              description="Enable either toggle only when you want to explicitly set or clear that field across the current selection."
            />
            <CardContent className="grid gap-5">
              <div className="grid gap-3">
                <label
                  className={`pill-toggle ${setCompany ? "pill-toggle-active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={setCompany}
                    onChange={(event) => setSetCompany(event.target.checked)}
                  />
                  Update company for selected items
                </label>

                <Select
                  value={companyId}
                  onChange={(event) =>
                    setCompanyId(
                      event.target.value === ""
                        ? ""
                        : Number(event.target.value),
                    )
                  }
                  disabled={!setCompany}
                >
                  <option value="">Clear company</option>
                  {options.companies.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-3">
                <label
                  className={`pill-toggle ${setSeries ? "pill-toggle-active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={setSeries}
                    onChange={(event) => setSetSeries(event.target.checked)}
                  />
                  Update series for selected items
                </label>

                <Select
                  value={seriesId}
                  onChange={(event) =>
                    setSeriesId(
                      event.target.value === ""
                        ? ""
                        : Number(event.target.value),
                    )
                  }
                  disabled={!setSeries}
                >
                  <option value="">Clear series</option>
                  {options.series.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.company_name
                        ? `${item.name} (${item.company_name})`
                        : item.name}
                    </option>
                  ))}
                </Select>
              </div>
            </CardContent>
          </Card>

          {mainCategories.length === 0 ? (
            <Alert tone="warning">
              Create a main category first if you plan to assign new
              sub-categories during bulk tagging.
            </Alert>
          ) : null}

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
              name:
                item.kind === "sub" && item.parent_name
                  ? `${item.parent_name} -> ${item.name}`
                  : item.name,
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
            <Button onClick={apply} disabled={saving} variant="primary" size="lg">
              {saving ? "Applying..." : "Apply Bulk Tagging"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleGroup(props: {
  title: string;
  subtitle: string;
  items: { id: number; name: string }[];
  selectedIds: number[];
  onToggle: (id: number) => void;
}) {
  return (
    <Card className="p-6">
      <CardHeader title={props.title} description={props.subtitle} />
      <CardContent className="flex flex-wrap gap-2">
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
      </CardContent>
    </Card>
  );
}
