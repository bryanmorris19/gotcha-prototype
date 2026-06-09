"use strict";

const REPOSITORY = "bryanmorris19/gotcha-prototype";
const BRANCH = "main";
const HUNTS_PATH = "hunts.json";
const TOKEN_KEY = "gotcha-admin-github-token";
const API_VERSION = "2022-11-28";

const state = {
  token: "",
  catalog: [],
  catalogSha: "",
  barcodes: [],
  scanner: null,
  scannerSessionId: 0
};

const elements = {};

document.addEventListener("DOMContentLoaded", initializeAdmin);

function initializeAdmin() {
  cacheElements();
  bindEvents();
  setDefaultDate();
  loadPublicCatalog();
  registerServiceWorker();

  const savedToken = sessionStorage.getItem(TOKEN_KEY);
  if (savedToken) {
    elements.githubToken.value = savedToken;
    connectToGitHub();
  }
}

function cacheElements() {
  [
    "githubToken",
    "connectButton",
    "disconnectButton",
    "connectionBadge",
    "connectionStatus",
    "huntFieldset",
    "productName",
    "itemId",
    "availableFrom",
    "hardClue",
    "easierClue",
    "barcodeInput",
    "addBarcodeButton",
    "openScannerButton",
    "barcodeList",
    "barcodeStatus",
    "publishButton",
    "publishStatus",
    "refreshCatalogButton",
    "catalogSummary",
    "catalogList",
    "scannerOverlay",
    "scannerState",
    "scannerMessage",
    "stopScannerButton"
  ].forEach(id => {
    elements[id] = document.getElementById(id);
  });
}

function bindEvents() {
  elements.connectButton.addEventListener("click", connectToGitHub);
  elements.disconnectButton.addEventListener("click", disconnectFromGitHub);
  elements.githubToken.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      connectToGitHub();
    }
  });
  elements.addBarcodeButton.addEventListener("click", addBarcodeFromInput);
  elements.barcodeInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      addBarcodeFromInput();
    }
  });
  elements.openScannerButton.addEventListener("click", startScanner);
  elements.stopScannerButton.addEventListener("click", stopScanner);
  elements.publishButton.addEventListener("click", publishHunt);
  elements.refreshCatalogButton.addEventListener("click", refreshCatalog);
}

function setDefaultDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  elements.availableFrom.value = formatDateKey(tomorrow);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  navigator.serviceWorker.register("service-worker.js").catch(error => {
    console.error("Admin service worker registration error:", error);
  });
}

async function connectToGitHub() {
  const token = elements.githubToken.value.trim();
  if (!token) {
    showStatus(elements.connectionStatus, "Enter a GitHub token first.", "fail");
    return;
  }

  elements.connectButton.disabled = true;
  elements.connectButton.textContent = "Connecting...";
  showStatus(elements.connectionStatus, "Checking repository access...", "neutral");

  try {
    state.token = token;
    await loadCatalogFromGitHub();
    sessionStorage.setItem(TOKEN_KEY, token);
    elements.huntFieldset.disabled = false;
    elements.connectionBadge.textContent = "Connected";
    elements.connectionBadge.classList.add("connected");
    elements.disconnectButton.classList.remove("hidden");
    showStatus(
      elements.connectionStatus,
      "Connected. You can now publish catalog items.",
      "success"
    );
  } catch (error) {
    state.token = "";
    elements.huntFieldset.disabled = true;
    showStatus(elements.connectionStatus, getFriendlyApiError(error), "fail");
  } finally {
    elements.connectButton.disabled = false;
    elements.connectButton.textContent = "Connect";
  }
}

function disconnectFromGitHub() {
  stopScanner();
  state.token = "";
  state.catalogSha = "";
  sessionStorage.removeItem(TOKEN_KEY);
  elements.githubToken.value = "";
  elements.huntFieldset.disabled = true;
  elements.connectionBadge.textContent = "Not connected";
  elements.connectionBadge.classList.remove("connected");
  elements.disconnectButton.classList.add("hidden");
  clearStatus(elements.connectionStatus);
  showStatus(elements.publishStatus, "Disconnected from GitHub.", "neutral");
  loadPublicCatalog();
}

async function loadPublicCatalog() {
  try {
    const response = await fetch(`hunts.json?admin=${Date.now()}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error("Catalog request failed.");
    }
    state.catalog = await response.json();
    renderCatalog();
  } catch (error) {
    elements.catalogSummary.textContent = "The public catalog could not be loaded.";
  }
}

async function loadCatalogFromGitHub() {
  const response = await githubRequest(
    `/repos/${REPOSITORY}/contents/${HUNTS_PATH}?ref=${BRANCH}`
  );
  const file = await response.json();
  const content = decodeBase64Utf8(file.content);
  const catalog = JSON.parse(content);

  if (!Array.isArray(catalog)) {
    throw new Error("hunts.json does not contain a catalog array.");
  }

  state.catalog = catalog;
  state.catalogSha = file.sha;
  renderCatalog();
}

async function refreshCatalog() {
  elements.refreshCatalogButton.disabled = true;
  try {
    if (state.token) {
      await loadCatalogFromGitHub();
    } else {
      await loadPublicCatalog();
    }
    showStatus(elements.publishStatus, "Catalog refreshed.", "success");
  } catch (error) {
    showStatus(elements.publishStatus, getFriendlyApiError(error), "fail");
  } finally {
    elements.refreshCatalogButton.disabled = false;
  }
}

function renderCatalog() {
  const catalog = Array.isArray(state.catalog) ? state.catalog : [];
  elements.catalogSummary.textContent =
    `${catalog.length} ${catalog.length === 1 ? "item" : "items"} in the catalog`;
  elements.catalogList.innerHTML = catalog.map(hunt => {
    const barcodes = Array.isArray(hunt.barcodes)
      ? hunt.barcodes.join(", ")
      : "";
    const availability = hunt.availableFrom
      ? `Available ${hunt.availableFrom}`
      : "Available now";
    return `
      <article class="catalog-item">
        <strong>${escapeHtml(hunt.name || hunt.id)}</strong>
        <code>${escapeHtml(barcodes)}</code>
        <small>${escapeHtml(availability)} &middot; ${escapeHtml(hunt.clue || "")}</small>
      </article>
    `;
  }).join("");
}

function addBarcodeFromInput() {
  const barcode = normalizeBarcode(elements.barcodeInput.value);
  addBarcode(barcode);
}

function addBarcode(barcode) {
  const validation = validateBarcode(barcode);
  if (validation) {
    showStatus(elements.barcodeStatus, validation, "fail");
    return false;
  }

  state.barcodes.push(barcode);
  elements.barcodeInput.value = "";
  renderBarcodes();
  showStatus(elements.barcodeStatus, `Barcode ${barcode} added.`, "success");
  return true;
}

function validateBarcode(barcode) {
  if (!barcode) {
    return "Enter or scan a barcode.";
  }

  if (barcode.length < 8 || barcode.length > 14) {
    return "Barcodes must contain between 8 and 14 digits.";
  }

  if (state.barcodes.some(saved => barcodesOverlap(saved, barcode))) {
    return "That barcode is already attached to this new item.";
  }

  for (const hunt of state.catalog) {
    for (const saved of hunt.barcodes || []) {
      if (barcodesOverlap(saved, barcode)) {
        return `That barcode already belongs to ${hunt.name}.`;
      }
    }
  }

  return "";
}

function renderBarcodes() {
  elements.barcodeList.innerHTML = state.barcodes.map(barcode => `
    <span class="barcode-chip">
      ${escapeHtml(barcode)}
      <button type="button" data-remove-barcode="${escapeHtml(barcode)}" aria-label="Remove barcode ${escapeHtml(barcode)}">
        <svg><use href="#icon-close"></use></svg>
      </button>
    </span>
  `).join("");

  elements.barcodeList.querySelectorAll("[data-remove-barcode]").forEach(button => {
    button.addEventListener("click", () => {
      state.barcodes = state.barcodes.filter(
        barcode => barcode !== button.dataset.removeBarcode
      );
      renderBarcodes();
      clearStatus(elements.barcodeStatus);
    });
  });
}

async function publishHunt() {
  clearStatus(elements.publishStatus);
  const item = buildItemFromForm();
  const validation = validateItem(item);

  if (validation) {
    showStatus(elements.publishStatus, validation, "fail");
    return;
  }

  elements.publishButton.disabled = true;
  elements.publishButton.textContent = "Publishing...";

  try {
    await loadCatalogFromGitHub();
    const latestValidation = validateItem(item);
    if (latestValidation) {
      throw new Error(latestValidation);
    }

    const updatedCatalog = [
      ...state.catalog,
      {
        id: item.id,
        name: item.name,
        clue: item.clue,
        betterClue: item.betterClue,
        barcodes: item.barcodes,
        availableFrom: item.availableFrom
      }
    ];
    const response = await githubRequest(
      `/repos/${REPOSITORY}/contents/${HUNTS_PATH}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message: `Add hunt item: ${item.name}`,
          content: encodeBase64Utf8(
            `${JSON.stringify(updatedCatalog, null, 2)}\n`
          ),
          sha: state.catalogSha,
          branch: BRANCH
        })
      }
    );
    const result = await response.json();
    const commitUrl =
      result.commit?.html_url ||
      `https://github.com/${REPOSITORY}/commits/${BRANCH}`;

    state.catalog = updatedCatalog;
    state.catalogSha = result.content?.sha || "";
    renderCatalog();
    resetItemForm();
    showStatus(
      elements.publishStatus,
      `Published ${escapeHtml(item.name)}. ` +
        `<a href="${escapeHtml(commitUrl)}" target="_blank" rel="noreferrer">View commit</a>. ` +
        "GitHub Pages will update after deployment.",
      "success",
      true
    );
  } catch (error) {
    showStatus(elements.publishStatus, getFriendlyApiError(error), "fail");
  } finally {
    elements.publishButton.disabled = false;
    elements.publishButton.innerHTML =
      '<svg><use href="#icon-check"></use></svg> Publish Hunt';
  }
}

function buildItemFromForm() {
  const name = elements.productName.value.trim();
  return {
    id: slugify(elements.itemId.value.trim() || name),
    name,
    clue: elements.hardClue.value.trim(),
    betterClue: elements.easierClue.value.trim(),
    barcodes: [...state.barcodes],
    availableFrom: elements.availableFrom.value
  };
}

function validateItem(item) {
  if (!item.name) {
    return "Product name is required.";
  }
  if (!item.id) {
    return "A valid item ID could not be generated.";
  }
  if (!item.clue || !item.betterClue) {
    return "Both the hard clue and easier clue are required.";
  }
  if (item.clue.toLowerCase() === item.betterClue.toLowerCase()) {
    return "The hard clue and easier clue must be different.";
  }
  if (item.barcodes.length === 0) {
    return "Add at least one product barcode.";
  }
  if (!isValidDateKey(item.availableFrom)) {
    return "Choose a valid activation date.";
  }
  if (state.catalog.some(hunt => hunt.id === item.id)) {
    return `Item ID "${item.id}" already exists.`;
  }

  for (const barcode of item.barcodes) {
    const barcodeError = validateBarcodeAgainstCatalog(barcode);
    if (barcodeError) {
      return barcodeError;
    }
  }

  return "";
}

function validateBarcodeAgainstCatalog(barcode) {
  for (const hunt of state.catalog) {
    for (const saved of hunt.barcodes || []) {
      if (barcodesOverlap(saved, barcode)) {
        return `Barcode ${barcode} already belongs to ${hunt.name}.`;
      }
    }
  }
  return "";
}

function resetItemForm() {
  elements.productName.value = "";
  elements.itemId.value = "";
  elements.hardClue.value = "";
  elements.easierClue.value = "";
  state.barcodes = [];
  renderBarcodes();
  clearStatus(elements.barcodeStatus);
  setDefaultDate();
}

async function startScanner() {
  if (typeof Html5Qrcode === "undefined") {
    showStatus(
      elements.barcodeStatus,
      "The barcode scanner library could not be loaded.",
      "fail"
    );
    return;
  }

  const sessionId = ++state.scannerSessionId;
  elements.scannerOverlay.classList.remove("hidden");
  elements.scannerState.textContent = "Starting";
  elements.scannerMessage.textContent =
    "Line up the barcode inside the camera frame.";

  const formatsToSupport = [
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39
  ];
  const scanner = new Html5Qrcode("adminReader", { formatsToSupport });
  state.scanner = scanner;

  try {
    await scanner.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 280, height: 170 },
        aspectRatio: 1.333
      },
      decodedText => handleScannedBarcode(decodedText, sessionId),
      () => {
        // Camera search misses are expected.
      }
    );

    if (sessionId !== state.scannerSessionId) {
      await cleanupScanner(scanner);
      return;
    }
    elements.scannerState.textContent = "Live";
  } catch (error) {
    if (sessionId !== state.scannerSessionId) {
      return;
    }
    state.scanner = null;
    elements.scannerState.textContent = "Error";
    elements.scannerMessage.textContent =
      "Camera access failed. Check browser permission and try again.";
    console.error("Admin scanner error:", error);
  }
}

async function handleScannedBarcode(decodedText, sessionId) {
  if (sessionId !== state.scannerSessionId) {
    return;
  }

  const barcode = normalizeBarcode(decodedText);
  if (addBarcode(barcode)) {
    await stopScanner();
  }
}

async function stopScanner() {
  state.scannerSessionId += 1;
  elements.scannerOverlay.classList.add("hidden");
  const scanner = state.scanner;
  state.scanner = null;
  if (scanner) {
    await cleanupScanner(scanner);
  }
}

async function cleanupScanner(scanner) {
  try {
    await scanner.stop();
  } catch (error) {
    // The camera may not have finished starting.
  }
  try {
    await scanner.clear();
  } catch (error) {
    // The reader may already be clear.
  }
}

async function githubRequest(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${state.token}`,
      "X-GitHub-Api-Version": API_VERSION,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    let details = "";
    try {
      const body = await response.json();
      details = body.message || "";
    } catch (error) {
      details = "";
    }
    const apiError = new Error(details || `GitHub request failed (${response.status}).`);
    apiError.status = response.status;
    throw apiError;
  }

  return response;
}

function getFriendlyApiError(error) {
  if (error.status === 401) {
    return "GitHub rejected the token. Create a new fine-grained token and try again.";
  }
  if (error.status === 403) {
    return "The token needs Contents: Read and write access to this repository.";
  }
  if (error.status === 404) {
    return "The token cannot access the repository or hunts.json.";
  }
  if (error.status === 409 || error.status === 422) {
    return "The catalog changed while publishing. Refresh the catalog and try again.";
  }
  return error.message || "The GitHub request could not be completed.";
}

function normalizeBarcode(value) {
  return String(value || "").replace(/\D+/g, "");
}

function barcodeVariants(value) {
  const barcode = normalizeBarcode(value);
  const variants = new Set([barcode, barcode.replace(/^0+/, "")]);
  let upc = barcode;

  if (upc.length === 13 && upc.startsWith("0")) {
    upc = upc.slice(1);
    variants.add(upc);
  }
  if (upc.length === 12) {
    variants.add(upc.slice(1, -1));
    variants.add(upc.slice(0, -1));
  }
  return [...variants].filter(Boolean);
}

function barcodesOverlap(left, right) {
  const leftVariants = barcodeVariants(left);
  const rightVariants = barcodeVariants(right);
  return leftVariants.some(value => rightVariants.includes(value));
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && formatDateKey(date) === value;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function decodeBase64Utf8(value) {
  const binary = atob(String(value || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function showStatus(element, message, type, allowHtml = false) {
  if (allowHtml) {
    element.innerHTML = message;
  } else {
    element.textContent = message;
  }
  element.className = `${element.className.split(" ")[0]} show ${type}`;
}

function clearStatus(element) {
  element.textContent = "";
  element.className = element.className.split(" ")[0];
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
