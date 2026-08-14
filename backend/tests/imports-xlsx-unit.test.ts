import { describe, expect, it } from "vitest";
import {
  WorkbookFormatError,
  columnIndexFromReference,
  decodeXmlText,
  parseWorkbook,
} from "../src/modules/imports/xlsx/workbook-reader.js";
import { ZipArchive, ZipFormatError } from "../src/modules/imports/xlsx/zip.js";
import { buildWorkbook, buildZip } from "./support/xlsx-builder.js";

describe("zip archive", () => {
  it("reads stored and deflated entries", () => {
    const archive = ZipArchive.open(
      buildZip([
        { name: "a.txt", data: Buffer.from("stored"), deflate: false },
        {
          name: "b.txt",
          data: Buffer.from("deflated".repeat(50)),
          deflate: true,
        },
      ]),
    );
    expect(archive.names()).toEqual(["a.txt", "b.txt"]);
    expect(archive.readText("a.txt")).toBe("stored");
    expect(archive.readText("b.txt")).toBe("deflated".repeat(50));
  });

  it("rejects a file that is not a ZIP archive", () => {
    expect(() => ZipArchive.open(Buffer.from("not a zip at all"))).toThrow(
      ZipFormatError,
    );
  });

  it("rejects a request for a missing entry without echoing the name", () => {
    const archive = ZipArchive.open(
      buildZip([{ name: "a.txt", data: Buffer.from("x"), deflate: false }]),
    );
    expect(() => archive.read("../../etc/passwd")).toThrow(
      /Archive entry not found/,
    );
  });
});

describe("xml decoding", () => {
  it("decodes named, decimal and hexadecimal entities", () => {
    expect(
      decodeXmlText("a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;"),
    ).toBe(`a & b <c> "d" 'e'`);
    expect(decodeXmlText("&#65;&#x42;")).toBe("AB");
  });

  it("leaves an unknown entity untouched rather than dropping it", () => {
    expect(decodeXmlText("50&nbsp;%")).toBe("50&nbsp;%");
  });

  it("maps A1 column references to zero-based indexes", () => {
    expect(columnIndexFromReference("A1")).toBe(0);
    expect(columnIndexFromReference("B10")).toBe(1);
    expect(columnIndexFromReference("Z1")).toBe(25);
    expect(columnIndexFromReference("AA1")).toBe(26);
    expect(columnIndexFromReference("AB100")).toBe(27);
  });
});

describe("workbook reader", () => {
  it("reads shared strings, numbers and booleans into a dense grid", () => {
    const workbook = parseWorkbook(
      buildWorkbook(
        [
          {
            name: "Sheet One",
            rowsXml:
              `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>` +
              `<row r="2"><c r="A2"><v>42</v></c><c r="B2"><v>3.5</v></c><c r="C2" t="b"><v>1</v></c></row>`,
          },
        ],
        ["KPI Code", "Target"],
      ),
    );
    expect(workbook.sheets).toHaveLength(1);
    expect(workbook.sheet("Sheet One")?.rows).toEqual([
      ["KPI Code", "Target"],
      [42, 3.5, true],
    ]);
  });

  it("keeps a self-closing cell empty instead of consuming the next cell", () => {
    // Regression: an alternating open/self-closing regex lets `<c r="B1"/>`
    // match the open-tag branch and swallow C1, shifting a whole row.
    const workbook = parseWorkbook(
      buildWorkbook(
        [
          {
            name: "Sparse",
            rowsXml: `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="5"/><c r="C1" t="s"><v>1</v></c></row>`,
          },
        ],
        ["left", "right"],
      ),
    );
    expect(workbook.sheet("Sparse")?.rows).toEqual([["left", null, "right"]]);
  });

  it("places sparse cells by reference and pads the gaps", () => {
    const workbook = parseWorkbook(
      buildWorkbook(
        [
          {
            name: "Gaps",
            rowsXml: `<row r="3"><c r="D3" t="s"><v>0</v></c></row>`,
          },
        ],
        ["only"],
      ),
    );
    expect(workbook.sheet("Gaps")?.rows).toEqual([
      [],
      [],
      [null, null, null, "only"],
    ]);
  });

  it("flattens rich-text runs in inline and shared strings", () => {
    const inline = parseWorkbook(
      buildWorkbook([
        {
          name: "Rich",
          rowsXml: `<row r="1"><c r="A1" t="inlineStr"><is><r><t>ISO </t></r><r><t>27001</t></r></is></c></row>`,
        },
      ]),
    );
    expect(inline.sheet("Rich")?.rows).toEqual([["ISO 27001"]]);

    const shared = parseWorkbook(
      buildWorkbook(
        [
          {
            name: "Rich",
            rowsXml: `<row r="1"><c r="A1" t="s"><v>0</v></c></row>`,
          },
        ],
        ["ISO 9001:2015"],
      ),
    );
    expect(shared.sheet("Rich")?.rows).toEqual([["ISO 9001:2015"]]);
  });

  it("reads a cached formula string and surfaces a cached formula error", () => {
    const workbook = parseWorkbook(
      buildWorkbook([
        {
          name: "Formulas",
          rowsXml:
            `<row r="1"><c r="A1" t="str"><f>CONCAT()</f><v>Amber</v></c>` +
            `<c r="B1" t="e"><f>1/0</f><v>#DIV/0!</v></c></row>`,
        },
      ]),
    );
    expect(workbook.sheet("Formulas")?.rows).toEqual([["Amber", "#DIV/0!"]]);
  });

  it("trims trailing empty rows so a padded print area is not counted", () => {
    const workbook = parseWorkbook(
      buildWorkbook(
        [
          {
            name: "Padded",
            rowsXml:
              `<row r="1"><c r="A1" t="s"><v>0</v></c></row>` +
              `<row r="2"><c r="A2"/></row><row r="3"/>`,
          },
        ],
        ["value"],
      ),
    );
    expect(workbook.sheet("Padded")?.rows).toEqual([["value"]]);
  });

  it("preserves the workbook tab order", () => {
    const workbook = parseWorkbook(
      buildWorkbook([
        { name: "First", rowsXml: `<row r="1"><c r="A1"><v>1</v></c></row>` },
        { name: "Second", rowsXml: `<row r="1"><c r="A1"><v>2</v></c></row>` },
      ]),
    );
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual([
      "First",
      "Second",
    ]);
    expect(workbook.sheets.map((sheet) => sheet.position)).toEqual([1, 2]);
  });

  it("reads an uncompressed workbook", () => {
    const workbook = parseWorkbook(
      buildWorkbook(
        [
          {
            name: "Plain",
            rowsXml: `<row r="1"><c r="A1" t="s"><v>0</v></c></row>`,
          },
        ],
        ["stored"],
        { deflate: false },
      ),
    );
    expect(workbook.sheet("Plain")?.rows).toEqual([["stored"]]);
  });

  it("rejects a non-workbook file with a safe message", () => {
    expect(() => parseWorkbook(Buffer.from("plain text"))).toThrow(
      WorkbookFormatError,
    );
    expect(() =>
      parseWorkbook(
        buildZip([
          { name: "readme.txt", data: Buffer.from("hi"), deflate: false },
        ]),
      ),
    ).toThrow(/missing xl\/workbook\.xml/);
  });

  it("rejects a worksheet relationship that escapes the archive", () => {
    const workbook = buildZip([
      {
        name: "xl/workbook.xml",
        deflate: false,
        data: Buffer.from(
          `<workbook xmlns:r="x"><sheets><sheet name="Evil" r:id="rId1"/></sheets></workbook>`,
        ),
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        deflate: false,
        data: Buffer.from(
          `<Relationships><Relationship Id="rId1" Target="../../../etc/passwd"/></Relationships>`,
        ),
      },
    ]);
    expect(() => parseWorkbook(workbook)).toThrow(/unsafe/);
  });
});
