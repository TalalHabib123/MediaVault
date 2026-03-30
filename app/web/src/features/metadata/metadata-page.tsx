import { useMemo, useState, type ReactNode } from "react";
import type {
  Category,
  Company,
  MetadataOptions,
  Person,
  Series,
  Tag,
} from "../../types";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";

type Props = {
  options: MetadataOptions;
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
};

export function MetadataPage({
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
  const [busy, setBusy] = useState("");

  const mainCategories = useMemo(
    () => options.categories.filter((category) => category.kind === "main"),
    [options.categories],
  );

  const subCategories = useMemo(
    () => options.categories.filter((category) => category.kind === "sub"),
    [options.categories],
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
      await onCreateCategory({
        name,
        kind: "sub",
        parent_id: Number(subParentId),
      });
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
      <Card className="overflow-hidden p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(224,178,92,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(78,120,171,0.12),transparent_30%)]" />
        <div className="relative">
          <div className="page-kicker">Metadata Control</div>
          <h2 className="brand-title mt-2 text-3xl">
            Shape reusable catalog data
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-(--text-muted)">
            Build reusable companies, people, series, categories, and tags
            without changing the current metadata behavior.
          </p>
        </div>
      </Card>

      <section className="grid gap-6 lg:grid-cols-2">
        <EntityCard
          title="Companies"
          subtitle="Create reusable companies to assign to media or series."
        >
          <CreateRow
            value={companyName}
            onChange={setCompanyName}
            placeholder="Add company"
            buttonText={busy === "company" ? "Saving..." : "Create"}
            onSubmit={createCompany}
          />
          <SimpleList
            items={options.companies.map((item) => item.name)}
            emptyText="No companies yet."
          />
        </EntityCard>

        <EntityCard
          title="People"
          subtitle="Actors, actresses, performers, and other people."
        >
          <CreateRow
            value={personName}
            onChange={setPersonName}
            placeholder="Add person"
            buttonText={busy === "person" ? "Saving..." : "Create"}
            onSubmit={createPerson}
          />
          <SimpleList
            items={options.people.map((item) => item.name)}
            emptyText="No people yet."
          />
        </EntityCard>

        <EntityCard
          title="Series"
          subtitle="Series or show names with an optional parent company."
        >
          <div className="grid gap-3">
            <Input
              value={seriesName}
              onChange={(event) => setSeriesName(event.target.value)}
              placeholder="Add series"
            />
            <Select
              value={seriesCompanyId}
              onChange={(event) =>
                setSeriesCompanyId(
                  event.target.value === "" ? "" : Number(event.target.value),
                )
              }
            >
              <option value="">No parent company</option>
              {options.companies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Button onClick={createSeries} variant="primary">
              {busy === "series" ? "Saving..." : "Create"}
            </Button>
          </div>

          <SimpleList
            items={options.series.map((item) =>
              item.company_name
                ? `${item.name} -> ${item.company_name}`
                : item.name,
            )}
            emptyText="No series yet."
          />
        </EntityCard>

        <EntityCard
          title="Main Categories"
          subtitle="Top-level categories used across the vault."
        >
          <CreateRow
            value={mainCategoryName}
            onChange={setMainCategoryName}
            placeholder="Add main category"
            buttonText={busy === "main-category" ? "Saving..." : "Create"}
            onSubmit={createMainCategory}
          />
          <SimpleList
            items={mainCategories.map((item) => item.name)}
            emptyText="No main categories yet."
          />
        </EntityCard>

        <EntityCard
          title="Sub Categories"
          subtitle="Attach sub-categories to an existing main category."
        >
          <div className="grid gap-3">
            <Input
              value={subCategoryName}
              onChange={(event) => setSubCategoryName(event.target.value)}
              placeholder="Add sub category"
            />
            <Select
              value={subParentId}
              onChange={(event) =>
                setSubParentId(
                  event.target.value === "" ? "" : Number(event.target.value),
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
            <Button onClick={createSubCategory} variant="primary">
              {busy === "sub-category" ? "Saving..." : "Create"}
            </Button>
          </div>

          <SimpleList
            items={subCategories.map((item) =>
              item.parent_name ? `${item.parent_name} -> ${item.name}` : item.name,
            )}
            emptyText="No sub categories yet."
          />
        </EntityCard>

        <EntityCard
          title="Tags"
          subtitle="Generic reusable tags for quick categorization."
        >
          <CreateRow
            value={tagName}
            onChange={setTagName}
            placeholder="Add tag"
            buttonText={busy === "tag" ? "Saving..." : "Create"}
            onSubmit={createTag}
          />
          <SimpleList
            items={options.tags.map((item) => item.name)}
            emptyText="No tags yet."
          />
        </EntityCard>
      </section>
    </div>
  );
}

function EntityCard(props: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-6">
      <CardHeader title={props.title} description={props.subtitle} />
      <CardContent>{props.children}</CardContent>
    </Card>
  );
}

function CreateRow(props: {
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
      <Button onClick={props.onSubmit} variant="primary">
        {props.buttonText}
      </Button>
    </div>
  );
}

function SimpleList(props: { items: string[]; emptyText: string }) {
  return (
    <div className="mt-4 grid gap-2">
      {props.items.length === 0 ? (
        <div className="empty-state">{props.emptyText}</div>
      ) : (
        props.items.map((item) => (
          <div
            key={item}
            className="surface-muted rounded-2xl px-3 py-3 text-sm"
          >
            {item}
          </div>
        ))
      )}
    </div>
  );
}
