"use strict";

const STORAGE_KEY = "gotcha-player-v1";
const STARTING_GUESSES = 3;
const MAX_COMPLETION_HISTORY = 100;

const prizes = [
  { label: "10 Gotcha Points", points: 10, weight: 60 },
  { label: "25 Gotcha Points", points: 25, weight: 24 },
  { label: "Extra Guess", extraGuess: 1, weight: 10 },
  { label: "$5 Store Reward", points: 50, weight: 5 },
  { label: "Rare Prize Entry", points: 100, weight: 1 }
];

const state = {
  hunts: [],
  player: null,
  scanner: null,
  scannerRunning: false,
  scanLocked: false,
  audioContext: null
};

const elements = {};

document.addEventListener("DOMContentLoaded", initializeApp);

async function initializeApp() {
  cacheElements();
  bindEvents();

  try {
    state.hunts = await loadHunts();
    state.player = loadPlayer();
    applyDailyReset();
    render();
    scheduleMidnightReset();
  } catch (error) {
    console.error("App initialization error:", error);
    showStatus(
      "The hunt database could not be loaded. Refresh the page to try again.",
      "fail"
    );
  }
}

function cacheElements() {
  elements.guessesValue = document.getElementById("guessesValue");
  elements.pointsValue = document.getElementById("pointsValue");
  elements.streakValue = document.getElementById("streakValue");
  elements.clueText = document.getElementById("clueText");
  elements.huntMeta = document.getElementById("huntMeta");
  elements.betterClueButton = document.getElementById("betterClueButton");
  elements.resetButton = document.getElementById("resetButton");
  elements.startScannerButton = document.getElementById("startScannerButton");
  elements.stopScannerButton = document.getElementById("stopScannerButton");
  elements.barcodeStatus = document.getElementById("barcodeStatus");
  elements.feedbackStatus = document.getElementById("feedbackStatus");
  elements.prizeOverlay = document.getElementById("prizeOverlay");
  elements.prizeItemText = document.getElementById("prizeItemText");
  elements.prizeOverlayText = document.getElementById("prizeOverlayText");
  elements.nextHuntButton = document.getElementById("nextHuntButton");
  elements.wrongOverlay = document.getElementById("wrongOverlay");
  elements.wrongScanText = document.getElementById("wrongScanText");
  elements.wrongActionButton = document.getElementById("wrongActionButton");
}

function bindEvents() {
  elements.betterClueButton.addEventListener("click", upgradeClue);
  elements.resetButton.addEventListener("click", resetDemo);
  elements.startScannerButton.addEventListener("click", startBarcodeScanner);
  elements.stopScannerButton.addEventListener("click", stopBarcodeScanner);
  elements.nextHuntButton.addEventListener("click", closePrizeOverlay);
  elements.wrongActionButton.addEventListener("click", closeWrongOverlay);
}

async function loadHunts() {
  const response = await fetch("hunts.json", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Hunt database request failed: " + response.status);
  }

  const hunts = await response.json();

  if (!Array.isArray(hunts) || hunts.length === 0) {
    throw new Error("Hunt database is empty.");
  }

  return hunts;
}

function createDefaultPlayer() {
  return {
    points: 0,
    streak: 0,
    guesses: STARTING_GUESSES,
    dailyDate: "",
    dailyProgress: 0,
    betterClueUsed: false,
    lastCompletionDate: "",
    completedHunts: []
  };
}

function loadPlayer() {
  const fallback = createDefaultPlayer();

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (!saved || typeof saved !== "object") {
      return fallback;
    }

    return {
      ...fallback,
      ...saved,
      completedHunts: Array.isArray(saved.completedHunts)
        ? saved.completedHunts
        : []
    };
  } catch (error) {
    console.error("Local progress could not be read:", error);
    return fallback;
  }
}

function savePlayer() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.player));
  } catch (error) {
    console.error("Local progress could not be saved:", error);
  }
}

function applyDailyReset() {
  const today = getDateKey();

  if (state.player.dailyDate === today) {
    return;
  }

  state.player.dailyDate = today;
  state.player.dailyProgress = 0;
  state.player.guesses = STARTING_GUESSES;
  state.player.betterClueUsed = false;
  savePlayer();
}

function scheduleMidnightReset() {
  const now = new Date();
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  );
  const delay = nextMidnight.getTime() - now.getTime() + 100;

  window.setTimeout(() => {
    stopBarcodeScanner();
    applyDailyReset();
    state.scanLocked = false;
    elements.prizeOverlay.classList.add("hidden");
    elements.wrongOverlay.classList.add("hidden");
    clearStatus();
    render();
    scheduleMidnightReset();
  }, delay);
}

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hashDate(dateKey) {
  let hash = 0;

  for (const character of dateKey) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

function getDailyStartIndex() {
  return hashDate(state.player.dailyDate) % state.hunts.length;
}

function getActiveHunt() {
  const index =
    (getDailyStartIndex() + state.player.dailyProgress) % state.hunts.length;
  return state.hunts[index];
}

function render() {
  if (!state.player || state.hunts.length === 0) {
    return;
  }

  const hunt = getActiveHunt();
  elements.guessesValue.textContent = state.player.guesses;
  elements.pointsValue.textContent = state.player.points;
  elements.streakValue.textContent = state.player.streak;
  elements.clueText.textContent = state.player.betterClueUsed
    ? hunt.betterClue
    : hunt.clue;
  elements.huntMeta.textContent =
    `Hunt ${state.player.dailyProgress + 1} for ${formatDate(state.player.dailyDate)}`;
  elements.startScannerButton.disabled = state.player.guesses <= 0;
  elements.betterClueButton.disabled =
    state.player.guesses <= 0 || state.player.betterClueUsed;
}

function formatDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function upgradeClue() {
  if (state.player.betterClueUsed) {
    showStatus("You already have the better clue.", "neutral");
    return;
  }

  if (state.player.guesses <= 0) {
    showStatus("No guesses left to spend on a clue.", "fail");
    return;
  }

  state.player.guesses -= 1;
  state.player.betterClueUsed = true;
  savePlayer();
  render();
  showStatus("Better clue unlocked for 1 guess.", "neutral");
}

function startBarcodeScanner() {
  if (state.player.guesses <= 0) {
    showStatus("No guesses left for this hunt.", "fail");
    return;
  }

  if (state.scannerRunning) {
    showStatus("Scanner is already running.", "neutral");
    return;
  }

  if (typeof Html5Qrcode === "undefined") {
    showStatus("The barcode scanner could not be loaded.", "fail");
    return;
  }

  clearStatus();
  enableFeedback();

  const formatsToSupport = [
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39
  ];

  state.scanner = new Html5Qrcode("reader", { formatsToSupport });
  state.scanLocked = false;

  state.scanner.start(
    { facingMode: "environment" },
    {
      fps: 10,
      qrbox: { width: 260, height: 160 },
      aspectRatio: 1.333
    },
    onBarcodeScanned,
    () => {
      // Scanning errors are expected while the camera searches.
    }
  ).then(() => {
    state.scannerRunning = true;
    showStatus(
      "Scanner running. Point the camera at a product barcode.",
      "neutral"
    );
  }).catch(error => {
    state.scanner = null;
    showStatus(
      "Scanner failed to start. Check HTTPS and camera permission.",
      "fail"
    );
    console.error("Scanner start error:", error);
  });
}

function stopBarcodeScanner() {
  if (!state.scanner) {
    state.scannerRunning = false;
    return Promise.resolve();
  }

  const scanner = state.scanner;
  state.scanner = null;
  state.scannerRunning = false;

  return scanner.stop()
    .then(() => scanner.clear())
    .catch(error => {
      console.error("Scanner stop error:", error);
    });
}

function onBarcodeScanned(decodedText) {
  if (state.scanLocked) {
    return;
  }

  state.scanLocked = true;
  const scanned = normalizeBarcode(decodedText);
  const hunt = findActiveHuntByBarcode(scanned);

  state.player.guesses = Math.max(0, state.player.guesses - 1);

  if (hunt) {
    completeHunt(hunt, scanned);
  } else {
    handleWrongScan(scanned);
  }

  savePlayer();
  render();
}

function completeHunt(hunt, scanned) {
  updateStreak();
  recordCompletion(hunt.id);

  state.player.dailyProgress += 1;
  state.player.guesses = STARTING_GUESSES;
  state.player.betterClueUsed = false;

  const prize = revealPrize();
  showStatus(
    `Gotcha! ${hunt.name} verified.<br>Scanned: ${scanned}`,
    "success"
  );
  playSuccessFeedback();
  showPrizeOverlay(hunt.name, prize.label);
  stopBarcodeScanner();
}

function handleWrongScan(scanned) {
  showStatus(
    `Wrong item.<br>Scanned: ${scanned}<br>Target does not match.`,
    "fail"
  );
  playWrongFeedback();
  pauseBarcodeScanner();
  showWrongOverlay(scanned);
}

function updateStreak() {
  const today = state.player.dailyDate;

  if (state.player.lastCompletionDate === today) {
    return;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  state.player.streak =
    state.player.lastCompletionDate === getDateKey(yesterday)
      ? state.player.streak + 1
      : 1;
  state.player.lastCompletionDate = today;
}

function recordCompletion(huntId) {
  state.player.completedHunts.push({
    huntId,
    date: state.player.dailyDate,
    completedAt: new Date().toISOString()
  });

  state.player.completedHunts =
    state.player.completedHunts.slice(-MAX_COMPLETION_HISTORY);
}

function revealPrize() {
  const prize = weightedPrizePick();

  if (prize.points) {
    state.player.points += prize.points;
  }

  if (prize.extraGuess) {
    state.player.guesses += prize.extraGuess;
  }

  return prize;
}

function weightedPrizePick() {
  const totalWeight = prizes.reduce((sum, prize) => sum + prize.weight, 0);
  let random = Math.random() * totalWeight;

  for (const prize of prizes) {
    random -= prize.weight;

    if (random <= 0) {
      return prize;
    }
  }

  return prizes[0];
}

function findActiveHuntByBarcode(barcode) {
  const hunt = getActiveHunt();
  const scannedVariants = getBarcodeVariants(barcode);
  const matches = hunt.barcodes.some(savedBarcode => {
    const savedVariants = getBarcodeVariants(savedBarcode);
    return savedVariants.some(variant => scannedVariants.includes(variant));
  });

  return matches ? hunt : null;
}

function normalizeBarcode(value) {
  return String(value || "").trim().replace(/\D+/g, "");
}

function getBarcodeVariants(value) {
  const barcode = normalizeBarcode(value);
  const variants = new Set([barcode]);
  let upc = barcode;

  if (upc.length === 13 && upc.startsWith("0")) {
    upc = upc.slice(1);
    variants.add(upc);
  }

  if (upc.length === 12) {
    variants.add(upc.slice(1, -1));
    variants.add(upc.slice(0, -1));
  }

  variants.add(barcode.replace(/^0+/, ""));
  return Array.from(variants).filter(Boolean);
}

function pauseBarcodeScanner() {
  if (!state.scanner || !state.scannerRunning) {
    return;
  }

  try {
    state.scanner.pause(true);
  } catch (error) {
    console.error("Scanner pause error:", error);
  }
}

function showWrongOverlay(scanned) {
  elements.wrongScanText.textContent =
    `Barcode ${scanned} is not the correct item.`;
  elements.wrongActionButton.textContent =
    state.player.guesses > 0 ? "Scan Another Item" : "No Guesses Left";
  elements.wrongOverlay.classList.remove("hidden");
}

function closeWrongOverlay() {
  elements.wrongOverlay.classList.add("hidden");

  if (state.player.guesses <= 0) {
    showStatus("No guesses left for this hunt.", "fail");
    stopBarcodeScanner();
    return;
  }

  try {
    state.scanner.resume();
    state.scanLocked = false;
    showStatus(
      "Scanner ready. Point the camera at another product barcode.",
      "neutral"
    );
  } catch (error) {
    console.error("Scanner resume error:", error);
    state.scanLocked = false;
    state.scannerRunning = false;
    state.scanner = null;
    showStatus(
      "Scanner could not resume. Tap Start Scanner to try again.",
      "fail"
    );
  }
}

function showPrizeOverlay(itemName, prizeLabel) {
  elements.prizeItemText.textContent = itemName + " found";
  elements.prizeOverlayText.textContent = "Prize: " + prizeLabel;
  elements.prizeOverlay.classList.remove("hidden");
}

function closePrizeOverlay() {
  elements.prizeOverlay.classList.add("hidden");
  state.scanLocked = false;
  clearStatus();
  render();
}

function enableFeedback() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (AudioContextClass && !state.audioContext) {
    state.audioContext = new AudioContextClass();
  }

  if (state.audioContext?.state === "suspended") {
    state.audioContext.resume().catch(error => {
      console.error("Audio resume error:", error);
    });
  }

  if (state.audioContext) {
    playToneSequence([660], {
      duration: 0.1,
      gap: 0.06,
      volume: 0.2,
      type: "triangle"
    });
  }

  const soundMessage = state.audioContext
    ? "Sound is ready."
    : "This browser could not enable sound.";

  if ("vibrate" in navigator) {
    const vibrationAccepted = navigator.vibrate(60);
    elements.feedbackStatus.textContent = vibrationAccepted
      ? soundMessage + " Vibration is supported."
      : soundMessage + " Vibration was blocked by this browser.";
  } else {
    elements.feedbackStatus.textContent =
      soundMessage + " This device does not support web vibration.";
  }
}

function playSuccessFeedback() {
  if ("vibrate" in navigator) {
    navigator.vibrate([250, 100, 250, 100, 500]);
  }

  playToneSequence([523.25, 659.25, 783.99, 1046.5], {
    duration: 0.2,
    gap: 0.04,
    volume: 0.38,
    type: "triangle"
  });
  pulseBody("success-pulse");
}

function playWrongFeedback() {
  if ("vibrate" in navigator) {
    navigator.vibrate([120, 70, 120]);
  }

  playToneSequence([220, 164.81], {
    duration: 0.25,
    gap: 0.04,
    volume: 0.34,
    type: "square"
  });
  pulseBody("wrong-pulse");
}

function pulseBody(className) {
  document.body.classList.remove(className);
  void document.body.offsetWidth;
  document.body.classList.add(className);
}

function playToneSequence(frequencies, options) {
  if (!state.audioContext) {
    return;
  }

  const now = state.audioContext.currentTime;
  frequencies.forEach((frequency, index) => {
    const oscillator = state.audioContext.createOscillator();
    const gain = state.audioContext.createGain();
    const start = now + index * (options.duration + options.gap);

    oscillator.frequency.value = frequency;
    oscillator.type = options.type;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(options.volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + options.duration
    );
    oscillator.connect(gain);
    gain.connect(state.audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + options.duration + 0.02);
  });
}

function showStatus(message, type) {
  elements.barcodeStatus.innerHTML = message;
  elements.barcodeStatus.className = "status show " + type;
}

function clearStatus() {
  elements.barcodeStatus.innerHTML = "";
  elements.barcodeStatus.className = "status";
}

function resetDemo() {
  stopBarcodeScanner();
  localStorage.removeItem(STORAGE_KEY);
  state.player = createDefaultPlayer();
  applyDailyReset();
  state.scanLocked = false;
  elements.prizeOverlay.classList.add("hidden");
  elements.wrongOverlay.classList.add("hidden");
  elements.feedbackStatus.textContent = "";
  clearStatus();
  render();
}
