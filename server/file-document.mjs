/**
 * Shared file_id -> file_details resolution for the source-document endpoints.
 *
 * Sample invoices use file_ids from the bundled files/file-details.json
 * registry, while Live (Oracle) invoices carry FILE_DETAILS.FILE_ID values
 * from Oracle. The two namespaces can overlap (both start at 1), so the
 * caller tells us which namespace to prefer via `preferOracle`: live screens
 * pass scope=live and check Oracle first, sample screens check the bundled
 * registry first. Either side falls back to the other when it has no row.
 */
import oracledb from "oracledb";

/**
 * Extract the file_id from a document URL pathname. Query strings (such as
 * ?scope=live) must not break the match: the raw req.url includes them, so
 * callers split on "?" first.
 */
export function documentFileId(url) {
  const pathname = String(url || "").split("?")[0];
  const match = pathname.match(/^\/api\/files\/(\d+)\/document$/);
  return match ? Number(match[1]) : null;
}

export function findRegistryEntry(registry, fileId) {
  if (!Array.isArray(registry) || !Number.isInteger(fileId)) return undefined;
  return registry.find((item) => item?.file_id === fileId);
}

export async function fetchOracleFileRow(getConnection, fileId) {
  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(
      "SELECT file_id, file_name, file_path FROM file_details WHERE file_id = :0",
      [fileId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const row = (result.rows || [])[0];
    if (!row) return null;
    return { file_id: row.FILE_ID, file_name: row.FILE_NAME, file_path: row.FILE_PATH };
  } finally {
    try {
      await connection?.close();
    } catch {
      // Ignore close errors; a missing row is reported as null below.
    }
  }
}

export async function resolveDocumentEntry(fileId, { registry, getConnection, preferOracle = false }) {
  if (!Number.isInteger(fileId)) return null;
  const fromRegistry = () => {
    const entry = findRegistryEntry(registry, fileId);
    return entry ? { entry, source: "registry" } : null;
  };
  const fromOracle = async () => {
    if (typeof getConnection !== "function") return null;
    try {
      const entry = await fetchOracleFileRow(getConnection, fileId);
      return entry ? { entry, source: "oracle" } : null;
    } catch {
      // Oracle unreachable (or no row): fall back to the other namespace.
      return null;
    }
  };
  if (preferOracle) return (await fromOracle()) || fromRegistry();
  return fromRegistry() || (await fromOracle());
}
