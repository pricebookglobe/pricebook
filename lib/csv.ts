// A small, hand-written CSV parser rather than a third-party library —
// the well-known "xlsx" npm package has documented, unpatched Prototype
// Pollution and ReDoS vulnerabilities, which matters here specifically
// since this parses files uploaded by merchants (untrusted input). CSV's
// format is simple enough that a correct, safe parser doesn't need a
// heavyweight dependency: handles quoted fields, commas inside quotes,
// and escaped quotes ("").
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Normalize line endings so \r\n and \r don't produce stray empty rows.
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // Last field/row if the file doesn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/** Parses CSV text into an array of row objects keyed by the header row,
 * trimming whitespace from every value. */
export function parseCSVToObjects(text: string): Record<string, string>[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (row[i] ?? "").trim();
    });
    return obj;
  });
}

/** Escapes a single value for CSV output — wraps in quotes and doubles
 * any internal quotes whenever the value contains a comma, quote, or
 * newline. */
export function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCSV(rows: string[][]): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}
