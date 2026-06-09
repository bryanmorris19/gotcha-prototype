"use strict";

const STORAGE_KEY = "gotcha-player-v1";
const STARTING_GUESSES = 3;
const STARTING_COINS = 20;
const BETTER_CLUE_COST = 10;
const MAX_COMPLETION_HISTORY = 100;
const DAILY_GOAL = 4;
const MAX_ANALYTICS_EVENTS = 250;

const prizes = [
  {
    id: "bronze-star",
    label: "10 Gotcha Coins",
    subtitle: "Coin Reward",
    symbol: "*",
    rarity: "common",
    coins: 10,
    weight: 60
  },
  {
    id: "gold-coin",
    label: "25 Gotcha Coins",
    subtitle: "Coin Reward",
    symbol: "O",
    rarity: "rare",
    coins: 25,
    weight: 24
  },
  {
    id: "lucky-key",
    label: "Lucky Key",
    subtitle: "Extra Guess",
    symbol: "+",
    rarity: "common",
    extraGuess: 1,
    weight: 10
  },
  {
    id: "store-trophy",
    label: "50 Gotcha Coins",
    subtitle: "Coin Reward",
    symbol: "<>",
    rarity: "epic",
    coins: 50,
    weight: 5
  },
  {
    id: "royal-crown",
    label: "100 Gotcha Coins",
    subtitle: "Coin Reward",
    symbol: "#",
    rarity: "legendary",
    coins: 100,
    weight: 1
  }
];

const state = {
  hunts: [],
  player: null,
  scanner: null,
  scannerRunning: false,
  scanLocked: false,
  audioContext: null,
  torchOn: false,
  countdownTimer: null,
  deferredInstallPrompt: null,
  activeView: "home"
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
    startCountdown();
    registerServiceWorker();
    trackEvent("app_opened");
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
  elements.coinsValue = document.getElementById("coinsValue");
  elements.streakValue = document.getElementById("streakValue");
  elements.clueText = document.getElementById("clueText");
  elements.huntMeta = document.getElementById("huntMeta");
  elements.dailyProgressText = document.getElementById("dailyProgressText");
  elements.dailyProgressBar = document.getElementById("dailyProgressBar");
  elements.resetCountdown = document.getElementById("resetCountdown");
  elements.betterClueButton = document.getElementById("betterClueButton");
  elements.resetButton = document.getElementById("resetButton");
  elements.startScannerButton = document.getElementById("startScannerButton");
  elements.stopScannerButton = document.getElementById("stopScannerButton");
  elements.torchButton = document.getElementById("torchButton");
  elements.scannerShell = document.getElementById("scannerShell");
  elements.barcodeStatus = document.getElementById("barcodeStatus");
  elements.feedbackStatus = document.getElementById("feedbackStatus");
  elements.prizeOverlay = document.getElementById("prizeOverlay");
  elements.prizeItemText = document.getElementById("prizeItemText");
  elements.prizeOverlayText = document.getElementById("prizeOverlayText");
  elements.prizeCoinImage = document.getElementById("prizeCoinImage");
  elements.nextHuntButton = document.getElementById("nextHuntButton");
  elements.wrongOverlay = document.getElementById("wrongOverlay");
  elements.wrongScanText = document.getElementById("wrongScanText");
  elements.wrongActionButton = document.getElementById("wrongActionButton");
  elements.collectionGrid = document.getElementById("collectionGrid");
  elements.collectionCount = document.getElementById("collectionCount");
  elements.emptyCollection = document.getElementById("emptyCollection");
  elements.profileName = document.getElementById("profileName");
  elements.profileLevel = document.getElementById("profileLevel");
  elements.nicknameInput = document.getElementById("nicknameInput");
  elements.saveNicknameButton = document.getElementById("saveNicknameButton");
  elements.totalHuntsValue = document.getElementById("totalHuntsValue");
  elements.collectionMetricValue = document.getElementById("collectionMetricValue");
  elements.bestStreakValue = document.getElementById("bestStreakValue");
  elements.installButton = document.getElementById("installButton");
  elements.installHelp = document.getElementById("installHelp");
  elements.views = Array.from(document.querySelectorAll(".app-view"));
  elements.navButtons = Array.from(document.querySelectorAll("[data-view-button]"));
  elements.viewLinks = Array.from(document.querySelectorAll("[data-target-view]"));
}

function bindEvents() {
  elements.betterClueButton.addEventListener("click", upgradeClue);
  elements.resetButton.addEventListener("click", resetDemo);
  elements.startScannerButton.addEventListener("click", startBarcodeScanner);
  elements.stopScannerButton.addEventListener("click", stopBarcodeScanner);
  elements.torchButton.addEventListener("click", toggleTorch);
  elements.nextHuntButton.addEventListener("click", closePrizeOverlay);
  elements.wrongActionButton.addEventListener("click", closeWrongOverlay);
  elements.saveNicknameButton.addEventListener("click", saveNickname);
  elements.installButton.addEventListener("click", installApp);
  elements.navButtons.forEach(button => {
    button.addEventListener("click", () => switchView(button.dataset.viewButton));
  });
  elements.viewLinks.forEach(button => {
    button.addEventListener("click", () => switchView(button.dataset.targetView));
  });
  window.addEventListener("beforeinstallprompt", handleInstallPrompt);
  window.addEventListener("appinstalled", handleAppInstalled);
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

  const today = getDateKey();
  const availableHunts = hunts.filter(
    hunt => !hunt.availableFrom || hunt.availableFrom <= today
  );

  if (availableHunts.length === 0) {
    throw new Error("No hunts are currently available.");
  }

  return availableHunts;
}

function createDefaultPlayer() {
  return {
    coins: STARTING_COINS,
    lifetimeCoins: 0,
    coinEconomyInitialized: true,
    streak: 0,
    guesses: STARTING_GUESSES,
    dailyDate: "",
    dailyProgress: 0,
    betterClueUsed: false,
    lastCompletionDate: "",
    completedHunts: [],
    nickname: "Treasure Hunter",
    bestStreak: 0,
    collection: {},
    analytics: {
      counters: {},
      events: []
    }
  };
}

function loadPlayer() {
  const fallback = createDefaultPlayer();

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (!saved || typeof saved !== "object") {
      return fallback;
    }

    const existingBalance = Number(saved.coins ?? saved.points);
    const migratedCoins = saved.coinEconomyInitialized === true
      ? Number.isFinite(existingBalance)
        ? existingBalance
        : fallback.coins
      : existingBalance > 0
        ? existingBalance
        : fallback.coins;
    const migratedLifetimeCoins = Number.isFinite(Number(saved.lifetimeCoins))
      ? Number(saved.lifetimeCoins)
      : Number.isFinite(Number(saved.points))
        ? Number(saved.points)
        : 0;

    return {
      ...fallback,
      ...saved,
      coins: migratedCoins,
      lifetimeCoins: migratedLifetimeCoins,
      coinEconomyInitialized: true,
      completedHunts: Array.isArray(saved.completedHunts)
        ? saved.completedHunts
        : [],
      collection: saved.collection && typeof saved.collection === "object"
        ? saved.collection
        : {},
      analytics: {
        counters: saved.analytics?.counters || {},
        events: Array.isArray(saved.analytics?.events)
          ? saved.analytics.events
          : []
      }
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

function startCountdown() {
  updateCountdown();
  window.clearInterval(state.countdownTimer);
  state.countdownTimer = window.setInterval(updateCountdown, 1000);
}

function updateCountdown() {
  const now = new Date();
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  );
  const remaining = Math.max(0, nextMidnight.getTime() - now.getTime());
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  elements.resetCountdown.textContent =
    `${String(hours).padStart(2, "0")}:` +
    `${String(minutes).padStart(2, "0")}:` +
    `${String(seconds).padStart(2, "0")}`;
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
  elements.coinsValue.textContent = state.player.coins;
  elements.streakValue.textContent = state.player.streak;
  elements.clueText.textContent = state.player.betterClueUsed
    ? hunt.betterClue
    : hunt.clue;
  elements.huntMeta.textContent =
    `Hunt ${state.player.dailyProgress + 1} for ${formatDate(state.player.dailyDate)}`;
  const dailyCompleted = Math.min(state.player.dailyProgress, DAILY_GOAL);
  elements.dailyProgressText.textContent =
    `${dailyCompleted} of ${DAILY_GOAL} treasures found`;
  elements.dailyProgressBar.style.width =
    `${Math.min(100, (dailyCompleted / DAILY_GOAL) * 100)}%`;
  elements.startScannerButton.disabled =
    state.player.guesses <= 0 || state.scannerRunning;
  elements.stopScannerButton.disabled = !state.scannerRunning;
  elements.betterClueButton.disabled =
    state.player.coins < BETTER_CLUE_COST || state.player.betterClueUsed;
  renderCollection();
  renderProfile();
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

  if (state.player.coins < BETTER_CLUE_COST) {
    showStatus(
      `You need ${BETTER_CLUE_COST} Gotcha Coins for the easier clue.`,
      "fail"
    );
    return;
  }

  state.player.coins -= BETTER_CLUE_COST;
  state.player.betterClueUsed = true;
  savePlayer();
  render();
  showStatus(
    `Easier clue unlocked for ${BETTER_CLUE_COST} Gotcha Coins.`,
    "neutral"
  );
  trackEvent("better_clue_used");
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
  trackEvent("scanner_started");

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
    elements.scannerShell.classList.add("is-live");
    elements.startScannerButton.disabled = true;
    elements.stopScannerButton.disabled = false;
    updateTorchAvailability();
    showStatus(
      "Scanner running. Point the camera at a product barcode.",
      "neutral"
    );
  }).catch(error => {
    state.scanner = null;
    elements.scannerShell.classList.remove("is-live");
    elements.startScannerButton.disabled = state.player.guesses <= 0;
    elements.stopScannerButton.disabled = true;
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
  state.torchOn = false;
  elements.torchButton.classList.add("hidden");
  elements.torchButton.classList.remove("active");
  elements.scannerShell.classList.remove("is-live");
  elements.startScannerButton.disabled = state.player.guesses <= 0;
  elements.stopScannerButton.disabled = true;

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
    trackEvent("scan_correct", { huntId: hunt.id });
    completeHunt(hunt, scanned);
  } else {
    trackEvent("scan_wrong");
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
  addPrizeToCollection(prize);
  showStatus(
    `Gotcha! ${hunt.name} verified.<br>Scanned: ${scanned}`,
    "success"
  );
  playSuccessFeedback();
  showPrizeOverlay(hunt.name, prize);
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
  state.player.bestStreak = Math.max(
    state.player.bestStreak || 0,
    state.player.streak
  );
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

  if (prize.coins) {
    state.player.coins += prize.coins;
    state.player.lifetimeCoins += prize.coins;
  }

  if (prize.extraGuess) {
    state.player.guesses += prize.extraGuess;
  }

  return prize;
}

function addPrizeToCollection(prize) {
  const existing = state.player.collection[prize.id] || {
    id: prize.id,
    label: prize.label,
    subtitle: prize.subtitle,
    symbol: prize.symbol,
    rarity: prize.rarity,
    count: 0,
    firstEarnedAt: new Date().toISOString()
  };

  existing.count += 1;
  existing.lastEarnedAt = new Date().toISOString();
  state.player.collection[prize.id] = existing;
  trackEvent("reward_earned", {
    rewardId: prize.id,
    rarity: prize.rarity
  });
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

function showPrizeOverlay(itemName, prize) {
  elements.prizeItemText.textContent = itemName + " found";
  elements.prizeOverlayText.textContent =
    `Prize: ${prize.label} - ${prize.subtitle}`;
  elements.prizeCoinImage.classList.toggle("hidden", !prize.coins);
  elements.prizeOverlay.classList.remove("hidden");
}

function closePrizeOverlay() {
  elements.prizeOverlay.classList.add("hidden");
  state.scanLocked = false;
  clearStatus();
  render();
}

function renderCollection() {
  const rewards = Object.values(state.player.collection)
    .sort((a, b) => new Date(b.lastEarnedAt) - new Date(a.lastEarnedAt));
  const totalItems = rewards.reduce((sum, reward) => sum + reward.count, 0);

  elements.collectionCount.textContent =
    `${totalItems} ${totalItems === 1 ? "item" : "items"}`;
  elements.collectionGrid.innerHTML = "";
  elements.emptyCollection.classList.toggle("hidden", rewards.length > 0);
  elements.collectionGrid.classList.toggle("hidden", rewards.length === 0);

  rewards.forEach(reward => {
    const currentPrize = prizes.find(prize => prize.id === reward.id);
    const displayReward = currentPrize || reward;
    const card = document.createElement("article");
    card.className = `reward-card rarity-${reward.rarity}`;
    card.innerHTML = `
      <span class="reward-rarity">${reward.rarity}</span>
      ${displayReward.coins
        ? '<img class="reward-coin-image" src="assets/gotcha-coin.png" alt="">'
        : `<span class="reward-symbol" aria-hidden="true">${displayReward.symbol}</span>`}
      <strong>${escapeHtml(displayReward.label)}</strong>
      <small>${escapeHtml(displayReward.subtitle)}</small>
      <span class="reward-count">x${reward.count}</span>
    `;
    elements.collectionGrid.appendChild(card);
  });
}

function renderProfile() {
  const totalCollectibles = Object.values(state.player.collection)
    .reduce((sum, reward) => sum + reward.count, 0);
  const level = Math.max(
    1,
    Math.floor(state.player.lifetimeCoins / 250) + 1
  );

  elements.profileName.textContent = state.player.nickname;
  elements.nicknameInput.value = state.player.nickname;
  elements.profileLevel.textContent = `Level ${level}`;
  elements.totalHuntsValue.textContent = state.player.completedHunts.length;
  elements.collectionMetricValue.textContent = totalCollectibles;
  elements.bestStreakValue.textContent =
    Math.max(state.player.bestStreak || 0, state.player.streak);
}

function saveNickname() {
  const nickname = elements.nicknameInput.value.trim().slice(0, 24);

  if (!nickname) {
    elements.nicknameInput.focus();
    return;
  }

  state.player.nickname = nickname;
  savePlayer();
  renderProfile();
  trackEvent("nickname_saved");
  elements.saveNicknameButton.textContent = "Saved";
  window.setTimeout(() => {
    elements.saveNicknameButton.textContent = "Save";
  }, 1200);
}

function switchView(viewName) {
  if (viewName !== "home" && state.scannerRunning) {
    stopBarcodeScanner();
  }

  state.activeView = viewName;
  elements.views.forEach(view => {
    view.classList.toggle("active", view.dataset.view === viewName);
  });
  elements.navButtons.forEach(button => {
    button.classList.toggle("active", button.dataset.viewButton === viewName);
  });
  trackEvent("view_opened", { view: viewName });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function trackEvent(name, details = {}) {
  if (!state.player) {
    return;
  }

  const analytics = state.player.analytics;
  analytics.counters[name] = (analytics.counters[name] || 0) + 1;
  analytics.events.push({
    name,
    details,
    at: new Date().toISOString()
  });
  analytics.events = analytics.events.slice(-MAX_ANALYTICS_EVENTS);
  savePlayer();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function updateTorchAvailability() {
  try {
    const capabilities =
      typeof state.scanner.getRunningTrackCapabilities === "function"
        ? state.scanner.getRunningTrackCapabilities()
        : {};
    const hasTorch = Boolean(capabilities?.torch);
    elements.torchButton.classList.toggle("hidden", !hasTorch);
  } catch (error) {
    elements.torchButton.classList.add("hidden");
  }
}

async function toggleTorch() {
  if (!state.scanner || !state.scannerRunning) {
    return;
  }

  state.torchOn = !state.torchOn;

  try {
    await state.scanner.applyVideoConstraints({
      advanced: [{ torch: state.torchOn }]
    });
    elements.torchButton.classList.toggle("active", state.torchOn);
    elements.torchButton.lastChild.textContent =
      state.torchOn ? " Light On" : " Light";
    trackEvent("torch_toggled", { on: state.torchOn });
  } catch (error) {
    state.torchOn = false;
    elements.torchButton.classList.add("hidden");
    console.error("Torch error:", error);
  }
}

function handleInstallPrompt(event) {
  event.preventDefault();
  state.deferredInstallPrompt = event;
  elements.installButton.classList.remove("hidden");
  elements.installHelp.classList.add("hidden");
}

async function installApp() {
  if (!state.deferredInstallPrompt) {
    elements.installHelp.textContent =
      "Use your browser menu and choose Add to Home Screen.";
    elements.installHelp.classList.remove("hidden");
    return;
  }

  state.deferredInstallPrompt.prompt();
  const result = await state.deferredInstallPrompt.userChoice;
  trackEvent("install_prompt_result", { outcome: result.outcome });
  state.deferredInstallPrompt = null;
  elements.installButton.classList.add("hidden");
}

function handleAppInstalled() {
  state.deferredInstallPrompt = null;
  elements.installButton.classList.add("hidden");
  elements.installHelp.textContent = "Gotcha! is installed on this device.";
  elements.installHelp.classList.remove("hidden");
  trackEvent("app_installed");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.register("service-worker.js").catch(error => {
    console.error("Service worker registration error:", error);
  });
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
  trackEvent("progress_reset");
}
