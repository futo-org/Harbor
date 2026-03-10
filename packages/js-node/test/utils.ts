import path from "node:path";
import fs from "node:fs";

export const TEST_DB_DIR = "/tmp/polycentric/test/";

export const deleteDatabase = async (databaseName: string) => {
  await fs.promises.rm(path.join(TEST_DB_DIR, `${databaseName}.sqlite3`), {
    recursive: true,
  });
};
