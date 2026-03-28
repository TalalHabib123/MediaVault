export { MetadataPage as default } from "../features/metadata/metadata-page";

/* Legacy component retained during redesign extraction.
import { useMemo, useState } from "react";
import type { Category, Company, MetadataOptions, Person, Series, Tag } from "../types";

type Props = {
  options: MetadataOptions;
  onCreateCompany: (name: string) => Promise<Company>;
  onCreatePerson: (name: string) => Promise<Person>;
  onCreateCategory: (payload: { name: string; kind: "main" | "sub"; parent_id: number | null }) => Promise<Category>;
  onCreateTag: (name: string) => Promise<Tag>;
  onCreateSeries: (payload: { name: string; company_id: number | null }) => Promise<Series>;
};

export default function MetadataManager({
  options,
  onCreateCompany,
  onCreatePerson,
  onCreateCategory,
  onCreateTag,
  onCreateSeries,
}: Props) {
  const [companyName, setCompanyName] = useState("");
  const [personName, setPersonName] = useState("");
  const [mainCategoryName, setMainCategoryName] = useState("");
  const [subCategoryName, setSubCategoryName] = useState("");
  const [subParentId, setSubParentId] = useState<number | "">("");
  const [tagName, setTagName] = useState("");

  const [seriesName, setSeriesName] = useState("");
  const [seriesCompanyId, setSeriesCompanyId] = useState<number | "">("");

  const [busy, setBusy] = useState<string>("");

  const mainCategories = useMemo(
    () => options.categories.filter((c) => c.kind === "main"),
    [options.categories]
  );

  const subCategories = useMemo(
    () => options.categories.filter((c) => c.kind === "sub"),
    [options.categories]
  );

  async function createCompany() {
    const name = companyName.trim();
    if (!name) return;
    try {
      setBusy("company");
      await onCreateCompany(name);
      setCompanyName("");
    } finally {
      setBusy("");
    }
  }

  async function createPerson() {
    const name = personName.trim();
    if (!name) return;
    try {
      setBusy("person");
      await onCreatePerson(name);
      setPersonName("");
    } finally {
      setBusy("");
    }
  }

  async function createMainCategory() {
    const name = mainCategoryName.trim();
    if (!name) return;
    try {
      setBusy("main-category");
      await onCreateCategory({ name, kind: "main", parent_id: null });
      setMainCategoryName("");
    } finally {
      setBusy("");
    }
  }

  async function createSubCategory() {
    const name = subCategoryName.trim();
    if (!name || subParentId === "") return;
    try {
      setBusy("sub-category");
      await onCreateCategory({ name, kind: "sub", parent_id: Number(subParentId) });
      setSubCategoryName("");
    } finally {
      setBusy("");
    }
  }

  async function createTag() {
    const name = tagName.trim();
    if (!name) return;
    try {
      setBusy("tag");
      await onCreateTag(name);
      setTagName("");
    } finally {
      setBusy("");
    }
  }

  async function createSeries() {
    const name = seriesName.trim();
    if (!name) return;
    try {
      setBusy("series");
      await onCreateSeries({
        name,
        company_id: seriesCompanyId === "" ? null : Number(seriesCompanyId),
      });
      setSeriesName("");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-xl font-medium">Metadata Manager</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Create reusable companies, people, series, categories, and tags.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card title="Companies" subtitle="One company can later be assigned to a media item or a series.">
          <CreateRow
            value={companyName}
            onChange={setCompanyName}
            placeholder="Add company"
            buttonText={busy === "company" ? "Saving..." : "Create"}
            onSubmit={createCompany}
          />
          <SimpleList items={options.companies.map((item) => item.name)} emptyText="No companies yet." />
        </Card>

        <Card title="People" subtitle="Actors / actresses / performers / other people.">
          <CreateRow
            value={personName}
            onChange={setPersonName}
            placeholder="Add person"
            buttonText={busy === "person" ? "Saving..." : "Create"}
            onSubmit={createPerson}
          />
          <SimpleList items={options.people.map((item) => item.name)} emptyText="No people yet." />
        </Card>

        <Card title="Series" subtitle="Series / show names with optional parent company.">
          <div className="grid gap-3">
            <input
              value={seriesName}
              onChange={(e) => setSeriesName(e.target.value)}
              placeholder="Add series"
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
            />
            <select
              value={seriesCompanyId}
              onChange={(e) => setSeriesCompanyId(e.target.value === "" ? "" : Number(e.target.value))}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
            >
              <option value="">No parent company</option>
              {options.companies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <button
              onClick={createSeries}
              className="rounded-lg bg-white px-4 py-2 text-black"
            >
              {busy === "series" ? "Saving..." : "Create"}
            </button>
          </div>

          <div className="mt-4 grid gap-2">
            {options.series.length === 0 ? (
              <div className="text-sm text-zinc-500">No series yet.</div>
            ) : (
              options.series.map((item) => (
                <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm">
                  {item.name}
                  {item.company_name ? <span className="text-zinc-500"> → {item.company_name}</span> : null}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Main Categories" subtitle="Top-level categories used across media.">
          <CreateRow
            value={mainCategoryName}
            onChange={setMainCategoryName}
            placeholder="Add main category"
            buttonText={busy === "main-category" ? "Saving..." : "Create"}
            onSubmit={createMainCategory}
          />
          <SimpleList items={mainCategories.map((item) => item.name)} emptyText="No main categories yet." />
        </Card>

        <Card title="Sub Categories" subtitle="Sub categories linked to a main category.">
          <div className="grid gap-3">
            <input
              value={subCategoryName}
              onChange={(e) => setSubCategoryName(e.target.value)}
              placeholder="Add sub category"
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
            />
            <select
              value={subParentId}
              onChange={(e) => setSubParentId(e.target.value === "" ? "" : Number(e.target.value))}
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
              onClick={createSubCategory}
              className="rounded-lg bg-white px-4 py-2 text-black"
            >
              {busy === "sub-category" ? "Saving..." : "Create"}
            </button>
          </div>

          <div className="mt-4 grid gap-2">
            {subCategories.length === 0 ? (
              <div className="text-sm text-zinc-500">No sub categories yet.</div>
            ) : (
              subCategories.map((item) => (
                <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm">
                  {item.name}{" "}
                  <span className="text-zinc-500">
                    {item.parent_name ? `→ ${item.parent_name}` : ""}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Tags" subtitle="Generic freeform reusable tags.">
          <CreateRow
            value={tagName}
            onChange={setTagName}
            placeholder="Add tag"
            buttonText={busy === "tag" ? "Saving..." : "Create"}
            onSubmit={createTag}
          />
          <SimpleList items={options.tags.map((item) => item.name)} emptyText="No tags yet." />
        </Card>
      </section>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CreateRow({
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
        className="rounded-lg bg-white px-4 py-2 text-black"
      >
        {buttonText}
      </button>
    </div>
  );
}

function SimpleList({ items, emptyText }: { items: string[]; emptyText: string }) {
  return (
    <div className="mt-4 grid gap-2">
      {items.length === 0 ? (
        <div className="text-sm text-zinc-500">{emptyText}</div>
      ) : (
        items.map((item) => (
          <div key={item} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm">
            {item}
          </div>
        ))
      )}
    </div>
  );
}
*/
