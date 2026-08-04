import { describe, expect, it } from "vitest";
import { parseCsv, csvToWorkbookBuffer } from "../src/modules/imports/csv-parser.js";
import { isCsvImportType } from "../src/modules/imports/csv-templates.js";
import { presentSource } from "../src/modules/audit/service.js";
import { isProtectedLocalType } from "../src/modules/genrac/connector.js";
import { GenracCsvAdapter } from "../src/modules/genrac/adapters/csv-adapter.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("final client completion unit coverage", () => {
  it("rejects CSV with wrong headers", () => {
    expect(isCsvImportType("GAPS")).toBe(true);
    expect(() =>
      csvToWorkbookBuffer(
        "GAPS",
        Buffer.from("Wrong,Headers\nA,B\n", "utf8"),
      ),
    ).toThrow(/header/i);
  });

  it("parses quoted CSV fields and builds a workbook", () => {
    const csv = Buffer.from(
      'Gap ID,Gap Description,Severity,Status,Owner,Due Date,Framework,Clause / Control,Recommended Corrective Action\n"GAP-1","Desc, with comma",Major,Open,U-004,2026-08-31,ISO 27001,A.5.15,Fix it\n',
      "utf8",
    );
    const rows = parseCsv(csv);
    expect(rows[1]?.[1]).toBe("Desc, with comma");
    const adapted = csvToWorkbookBuffer("GAPS", csv);
    expect(adapted.workbookBuffer.length).toBeGreaterThan(100);
    expect(adapted.rowCount).toBe(1);
  });

  it("presents audit sources truthfully", () => {
    expect(presentSource("IMPORT", "user-1")).toBe("IMPORT");
    expect(presentSource("SYSTEM", "user-1")).toBe("USER");
    expect(presentSource("SYSTEM", null)).toBe("SYSTEM");
    expect(presentSource("EXTERNAL_SYNC", null)).toBe("EXTERNAL_SYNC");
  });

  it("protects GenBioCa compliance types from GenRAC overwrite", () => {
    expect(isProtectedLocalType("GAP")).toBe(true);
    expect(isProtectedLocalType("EVIDENCE")).toBe(true);
    expect(isProtectedLocalType("GENRAC_CUSTOMER_MASTER")).toBe(false);
  });

  it("runs GenRAC CSV adapter validation without live access", async () => {
    const dir = join(tmpdir(), `genrac-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const csvPath = join(dir, "genrac.csv");
    await writeFile(
      csvPath,
      "entity_type,external_id,updated_at,name\nCUSTOMER_MASTER,CUST-1,2026-01-01,Example Customer\nPOLICY,POL-1,2026-01-01,Must Be Invalid\n",
      "utf8",
    );
    const adapter = new GenracCsvAdapter(csvPath);
    expect((await adapter.testConnection()).ok).toBe(true);
    const { changes } = await adapter.fetchChanges();
    const { counts, validations } = await adapter.preview(changes);
    expect(counts.invalid).toBeGreaterThanOrEqual(1);
    expect(validations.some((item) => item.ok)).toBe(true);
  });
});
