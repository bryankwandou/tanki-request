import type { ReactNode } from "react";

export type Column<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  /** Kolom utama → jadi judul kartu di tampilan mobile. */
  primary?: boolean;
};

/**
 * Tabel responsif: tampil sebagai <table> di layar ≥ sm, dan sebagai daftar
 * kartu di mobile (< sm) supaya tidak perlu scroll horizontal.
 */
export function DataTable<T>({
  columns,
  rows,
  keyOf,
  empty = "Tidak ada data.",
}: {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  empty?: string;
}) {
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary);

  return (
    <>
      {/* Desktop / tablet */}
      <div className="hidden overflow-hidden rounded-[10px] bg-white shadow-1 sm:block dark:bg-gray-dark">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-stroke text-dark-5 dark:border-dark-3 dark:text-dark-6">
              <tr>
                {columns.map((c) => (
                  <th key={c.header} className="px-5 py-4 font-medium">
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-5 py-10 text-center text-dark-5 dark:text-dark-6"
                  >
                    {empty}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={keyOf(row)}
                    className="border-b border-stroke last:border-0 dark:border-dark-3"
                  >
                    {columns.map((c) => (
                      <td key={c.header} className="px-5 py-4">
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: kartu */}
      <div className="space-y-3 sm:hidden">
        {rows.length === 0 ? (
          <div className="rounded-[10px] bg-white p-6 text-center text-sm text-dark-5 shadow-1 dark:bg-gray-dark dark:text-dark-6">
            {empty}
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={keyOf(row)}
              className="rounded-[10px] bg-white p-4 shadow-1 dark:bg-gray-dark"
            >
              <div className="mb-2 text-base font-semibold text-dark dark:text-white">
                {primary.cell(row)}
              </div>
              <dl className="space-y-1.5">
                {rest.map((c) => (
                  <div key={c.header} className="flex justify-between gap-3 text-sm">
                    <dt className="text-dark-5 dark:text-dark-6">{c.header}</dt>
                    <dd className="text-right text-dark dark:text-white">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))
        )}
      </div>
    </>
  );
}
