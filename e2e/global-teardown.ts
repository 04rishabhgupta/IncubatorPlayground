import { existsSync, rmSync } from "node:fs";
import { adminClient, readAccounts, STATE_FILE } from "./support";

/** Deletes every account (and owned company data) created by this test run. */
export default async function globalTeardown() {
  if (!existsSync(STATE_FILE)) return;
  const admin = adminClient();
  const { runId } = readAccounts();

  // Includes accounts created during the run (e.g. registration tests).
  const users: { id: string; email?: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users.filter((u) => u.email?.includes(`-${runId}@`)));
    if (data.users.length < 1000) break;
  }
  const ids = users.map((u) => u.id);

  if (ids.length) {
    const { data: companies } = await admin.from("companies").select("id").in("owner_id", ids);
    for (const company of companies ?? []) {
      const { data: files } = await admin.storage.from("company-logos").list(company.id);
      if (files?.length) {
        await admin.storage.from("company-logos").remove(files.map((f) => `${company.id}/${f.name}`));
      }
    }
    // companies.owner_id is ON DELETE RESTRICT, so remove companies first.
    await admin.from("companies").delete().in("owner_id", ids);
  }
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error(`Failed to delete test user ${id}: ${error.message}`);
  }
  rmSync(STATE_FILE);
}
