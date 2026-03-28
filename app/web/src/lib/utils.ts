type ClassDictionary = Record<string, boolean | null | undefined>;
type ClassInput =
  | string
  | number
  | null
  | undefined
  | false
  | ClassDictionary
  | ClassInput[];

function flattenClasses(input: ClassInput, collector: string[]) {
  if (!input) return;

  if (typeof input === "string" || typeof input === "number") {
    collector.push(String(input));
    return;
  }

  if (Array.isArray(input)) {
    for (const entry of input) flattenClasses(entry, collector);
    return;
  }

  for (const [key, value] of Object.entries(input)) {
    if (value) collector.push(key);
  }
}

export function cn(...inputs: ClassInput[]) {
  const collector: string[] = [];
  for (const input of inputs) flattenClasses(input, collector);
  return collector.join(" ");
}
