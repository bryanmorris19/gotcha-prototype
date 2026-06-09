import { readFile, writeFile } from "node:fs/promises";

const huntsPath = new URL("../hunts.json", import.meta.url);

const input = {
  id: process.env.HUNT_ID?.trim() || "",
  name: process.env.HUNT_NAME?.trim() || "",
  clue: process.env.HUNT_CLUE?.trim() || "",
  betterClue: process.env.HUNT_BETTER_CLUE?.trim() || "",
  barcodes: process.env.HUNT_BARCODES?.trim() || "",
  availableFrom: process.env.HUNT_AVAILABLE_FROM?.trim() || ""
};

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseBarcodes(value) {
  return [...new Set(
    value
      .split(/[\s,]+/)
      .map(barcode => barcode.replace(/\D/g, ""))
      .filter(Boolean)
  )];
}

function getTomorrowDateKey() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const year = tomorrow.getFullYear();
  const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const day = String(tomorrow.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

if (!input.name) {
  fail("Product name is required.");
}

if (!input.clue) {
  fail("Hard clue is required.");
}

if (!input.betterClue) {
  fail("Easier clue is required.");
}

if (input.clue.toLowerCase() === input.betterClue.toLowerCase()) {
  fail("The hard clue and easier clue must be different.");
}

const id = input.id ? slugify(input.id) : slugify(input.name);
if (!id) {
  fail("A valid item ID could not be generated.");
}

const barcodes = parseBarcodes(input.barcodes);
if (barcodes.length === 0) {
  fail("At least one barcode is required.");
}

const invalidBarcode = barcodes.find(
  barcode => barcode.length < 8 || barcode.length > 14
);
if (invalidBarcode) {
  fail(`Barcode ${invalidBarcode} must contain between 8 and 14 digits.`);
}

const availableFrom = input.availableFrom || getTomorrowDateKey();
if (!/^\d{4}-\d{2}-\d{2}$/.test(availableFrom)) {
  fail("Available date must use YYYY-MM-DD format.");
}

const parsedAvailableDate = new Date(`${availableFrom}T00:00:00`);
if (
  Number.isNaN(parsedAvailableDate.getTime()) ||
  getDateParts(parsedAvailableDate) !== availableFrom
) {
  fail("Available date is not a valid calendar date.");
}

const hunts = JSON.parse(await readFile(huntsPath, "utf8"));
if (!Array.isArray(hunts)) {
  fail("hunts.json must contain an array.");
}

if (hunts.some(hunt => hunt.id === id)) {
  fail(`Item ID "${id}" already exists.`);
}

const existingBarcodes = new Map();
for (const hunt of hunts) {
  for (const barcode of hunt.barcodes || []) {
    existingBarcodes.set(String(barcode), hunt.name);
  }
}

for (const barcode of barcodes) {
  if (existingBarcodes.has(barcode)) {
    fail(`Barcode ${barcode} already belongs to ${existingBarcodes.get(barcode)}.`);
  }
}

hunts.push({
  id,
  name: input.name,
  clue: input.clue,
  betterClue: input.betterClue,
  barcodes,
  availableFrom
});

await writeFile(huntsPath, `${JSON.stringify(hunts, null, 2)}\n`);
console.log(`Added ${input.name} (${id}) with ${barcodes.length} barcode(s).`);

function getDateParts(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
