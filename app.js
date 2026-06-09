"use strict";

const STORAGE_KEY = "gotcha-player-v1";
const STARTING_GUESSES = 3;
const MAX_GUESSES = 5;
const STARTING_COINS = 20;
const BETTER_CLUE_COST = 10;
const EXTRA_GUESS_COST = 15;
const FRAGMENTS_PER_CACHE = 3;
const MAX_DAILY_CACHES = 3;
const MAX_COMPLETION_HISTORY = 100;
const MAX_REWARD_HISTORY = 50;
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

const cacheRewards = [
  {
    id: "cache-coins-2",
    label: "2 Gotcha Coins",
    subtitle: "Discovery Cache",
    rarity: "common",
    coins: 2,
    weight: 55
  },
  {
    id: "cache-coins-3",
    label: "3 Gotcha Coins",
    subtitle: "Discovery Cache",
    rarity: "common",
    coins: 3,
    weight: 30
  },
  {
    id: "cache-coins-5",
    label: "5 Gotcha Coins",
    subtitle: "Discovery Cache",
    rarity: "rare",
    coins: 5,
    weight: 12
  },
  {
    id: "cache-extra-guess",
    label: "+1 Bonus Guess",
    subtitle: "Discovery Cache",
    symbol: "+",
    rarity: "rare",
    extraGuess: 1,
    weight: 3
  }
];

const dailyChestRewards = [
  {
    id: "daily-coins-25",
    label: "25 Gotcha Coins",
    subtitle: "Daily Chest",
    rarity: "common",
    coins: 25,
    weight: 50
  },
  {
    id: "daily-coins-50",
    label: "50 Gotcha Coins",
    subtitle: "Daily Chest",
    rarity: "rare",
    coins: 50,
    weight: 30
  },
  {
    id: "daily-coins-75",
    label: "75 Gotcha Coins",
    subtitle: "Daily Chest",
    rarity: "epic",
    coins: 75,
    weight: 15
  },
  {
    id: "daily-gift-card-5",
    label: "$5 Gift Card",
    subtitle: "Simulated MVP Reward",
    symbol: "$",
    rarity: "legendary",
    simulatedGiftCard: true,
    weight: 5
  }
];

const rewardCatalog = [...prizes, ...cacheRewards, ...dailyChestRewards];

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
  activeView: "home",
  pendingRewards: [],
  resumeScannerAfterRewards: false
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
  elements.fragmentText = document.getElementById("fragmentText");
  elements.fragmentPips = Array.from(
    document.querySelectorAll("#fragmentPips span")
  );
  elements.cacheLimitText = document.getElementById("cacheLimitText");
  elements.dailyChestText = document.getElementById("dailyChestText");
  elements.dailyChestProgressBar = document.getElementById(
    "dailyChestProgressBar"
  );
  elements.buyGuessButton = document.getElementById("buyGuessButton");
  elements.rewardOddsButton = document.getElementById("rewardOddsButton");
  elements.rewardOddsOverlay = document.getElementById("rewardOddsOverlay");
  elements.closeRewardOddsButton = document.getElementById(
    "closeRewardOddsButton"
  );
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
  elements.rewardOverlayLabel = document.getElementById("rewardOverlayLabel");
  elements.rewardTreasureImage = document.getElementById("rewardTreasureImage");
  elements.simulatedGiftCard = document.getElementById("simulatedGiftCard");
  elements.prizeHeading = document.getElementById("prizeHeading");
  elements.rewardFinePrint = document.getElementById("rewardFinePrint");
  elements.rewardActionText = document.getElementById("rewardActionText");
  elements.nextHuntButton = document.getElementById("nextHuntButton");
  elements.wrongOverlay = document.getElementById("wrongOverlay");
  elements.wrongScanText = document.getElementById("wrongScanText");
  elements.wrongRewardText = document.getElementById("wrongRewardText");
  elements.wrongActionButton = document.getElementById("wrongActionButton");
  elements.collectionGrid = document.getElementById("collectionGrid");
  elements.collectionCount = document.getElementById("collectionCount");
  elements.emptyCollection = document.getElementById("emptyCollection");
  elements.rewardHistoryList = document.getElementById("rewardHistoryList");
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
  elements.buyGuessButton.addEventListener("click", buyExtraGuess);
  elements.rewardOddsButton.addEventListener("click", openRewardOdds);
  elements.closeRewardOddsButton.addEventListener("click", closeRewardOdds);
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
    signalFragments: 0,
    dailyCachesOpened: 0,
    dailyScannedBarcodes: [],
    dailyChestClaimed: false,
    lastCompletionDate: "",
    completedHunts: [],
    nickname: "Treasure Hunter",
    bestStreak: 0,
    collection: {},
    rewardHistory: [],
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
      dailyScannedBarcodes: Array.isArray(saved.dailyScannedBarcodes)
        ? saved.dailyScannedBarcodes
        : [],
      rewardHistory: Array.isArray(saved.rewardHistory)
        ? saved.rewardHistory
        : [],
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
  state.player.signalFragments = 0;
  state.player.dailyCachesOpened = 0;
  state.player.dailyScannedBarcodes = [];
  state.player.dailyChestClaimed = false;
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
    state.pendingRewards = [];
    state.resumeScannerAfterRewards = false;
    elements.prizeOverlay.classList.add("hidden");
    elements.wrongOverlay.classList.add("hidden");
    elements.rewardOddsOverlay.classList.add("hidden");
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
  renderRewardProgress();
  renderCollection();
  renderProfile();
}

function renderRewardProgress() {
  const fragmentCount = Math.min(
    state.player.signalFragments,
    FRAGMENTS_PER_CACHE
  );
  const cachesRemaining = Math.max(
    0,
    MAX_DAILY_CACHES - state.player.dailyCachesOpened
  );
  const dailyCompleted = Math.min(state.player.dailyProgress, DAILY_GOAL);

  elements.fragmentText.textContent =
    `${fragmentCount} of ${FRAGMENTS_PER_CACHE} Signal Fragments`;
  document.getElementById("fragmentPips").setAttribute(
    "aria-valuenow",
    String(fragmentCount)
  );
  elements.fragmentPips.forEach((pip, index) => {
    pip.classList.toggle("earned", index < fragmentCount);
  });
  elements.cacheLimitText.textContent = cachesRemaining === 0
    ? "Daily cache limit reached"
    : `${cachesRemaining} ${cachesRemaining === 1 ? "cache" : "caches"} available today`;
  elements.dailyChestText.textContent = state.player.dailyChestClaimed
    ? "Daily Chest opened"
    : `${dailyCompleted} of ${DAILY_GOAL} hunts complete`;
  elements.dailyChestProgressBar.style.width =
    `${Math.min(100, (dailyCompleted / DAILY_GOAL) * 100)}%`;
  elements.dailyChestProgressBar.parentElement.setAttribute(
    "aria-valuenow",
    String(dailyCompleted)
  );
  elements.buyGuessButton.disabled =
    state.player.coins < EXTRA_GUESS_COST ||
    state.player.guesses >= MAX_GUESSES;
  elements.buyGuessButton.querySelector("span:first-child").textContent =
    state.player.guesses >= MAX_GUESSES ? "Guess Wallet Full" : "Buy +1 Guess";
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

function buyExtraGuess() {
  if (state.player.guesses >= MAX_GUESSES) {
    showStatus(`You can hold up to ${MAX_GUESSES} guesses.`, "neutral");
    return;
  }

  if (state.player.coins < EXTRA_GUESS_COST) {
    showStatus(
      `You need ${EXTRA_GUESS_COST} Gotcha Coins for an extra guess.`,
      "fail"
    );
    return;
  }

  state.player.coins -= EXTRA_GUESS_COST;
  state.player.guesses += 1;
  savePlayer();
  render();
  showStatus(
    `Extra guess purchased for ${EXTRA_GUESS_COST} Gotcha Coins.`,
    "neutral"
  );
  trackEvent("extra_guess_purchased");
}

function openRewardOdds() {
  elements.rewardOddsOverlay.classList.remove("hidden");
}

function closeRewardOdds() {
  elements.rewardOddsOverlay.classList.add("hidden");
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
    handleWrongScan(scanned, awardSignalFragment(scanned));
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

  const prize = weightedRewardPick(prizes);
  grantReward(prize, "Correct Hunt");

  if (
    state.player.dailyProgress >= DAILY_GOAL &&
    !state.player.dailyChestClaimed
  ) {
    state.player.dailyChestClaimed = true;
    const dailyReward = weightedRewardPick(dailyChestRewards);
    grantReward(dailyReward, "Daily Chest");
    queueReward({
      label: "Daily Chest opened!",
      title: "Daily reward",
      context: `${DAILY_GOAL} hunts completed today`,
      reward: dailyReward,
      finePrint: dailyReward.simulatedGiftCard
        ? "This gift card is a simulated MVP reward with no cash value."
        : "Daily Chest rewards are limited to one per day.",
      actionLabel: "Continue"
    });
  }

  showStatus(
    `Gotcha! ${hunt.name} verified.<br>Scanned: ${scanned}`,
    "success"
  );
  playSuccessFeedback();
  showRewardOverlay({
    label: "Treasure found!",
    title: "Gotcha!",
    context: `${hunt.name} found`,
    reward: prize,
    finePrint: "Your guesses have been refreshed for the next hunt.",
    actionLabel: state.pendingRewards.length > 0
      ? "Open Daily Chest"
      : "Start Next Hunt"
  });
  stopBarcodeScanner();
}

function handleWrongScan(scanned, fragmentResult) {
  showStatus(
    `Wrong item.<br>Scanned: ${scanned}<br>Target does not match.`,
    "fail"
  );
  playWrongFeedback();
  pauseBarcodeScanner();
  showWrongOverlay(scanned, fragmentResult);
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

function grantReward(reward, source) {
  if (reward.coins) {
    state.player.coins += reward.coins;
    state.player.lifetimeCoins += reward.coins;
  }

  if (reward.extraGuess) {
    state.player.guesses = Math.min(
      MAX_GUESSES,
      state.player.guesses + reward.extraGuess
    );
  }

  addPrizeToCollection(reward);
  recordRewardHistory(reward, source);
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

function recordRewardHistory(reward, source) {
  state.player.rewardHistory.unshift({
    id: reward.id,
    label: reward.label,
    source,
    simulated: Boolean(reward.simulatedGiftCard),
    earnedAt: new Date().toISOString()
  });
  state.player.rewardHistory =
    state.player.rewardHistory.slice(0, MAX_REWARD_HISTORY);
}

function weightedRewardPick(rewards) {
  const totalWeight = rewards.reduce((sum, reward) => sum + reward.weight, 0);
  let random = Math.random() * totalWeight;

  for (const reward of rewards) {
    random -= reward.weight;

    if (random <= 0) {
      return reward;
    }
  }

  return rewards[0];
}

function awardSignalFragment(scanned) {
  const barcode = getBarcodeFingerprint(scanned);

  if (barcode.length < 8) {
    return {
      status: "invalid",
      message: "This scan did not contain a valid product barcode."
    };
  }

  if (state.player.dailyCachesOpened >= MAX_DAILY_CACHES) {
    return {
      status: "capped",
      message: "You reached today's Discovery Cache limit."
    };
  }

  if (state.player.dailyScannedBarcodes.includes(barcode)) {
    return {
      status: "duplicate",
      message: "You already scanned this barcode today, so no new fragment was earned."
    };
  }

  state.player.dailyScannedBarcodes.push(barcode);
  state.player.signalFragments += 1;

  if (state.player.signalFragments < FRAGMENTS_PER_CACHE) {
    return {
      status: "earned",
      message:
        `Signal Fragment earned: ${state.player.signalFragments} of ${FRAGMENTS_PER_CACHE}.`
    };
  }

  state.player.signalFragments = 0;
  state.player.dailyCachesOpened += 1;
  const reward = weightedRewardPick(cacheRewards);
  grantReward(reward, "Discovery Cache");
  queueReward({
    label: "Discovery Cache!",
    title: "Signal decoded",
    context: "Three unique product signals collected",
    reward,
    finePrint:
      `${state.player.dailyCachesOpened} of ${MAX_DAILY_CACHES} Discovery Caches opened today.`,
    actionLabel: "Keep Scanning"
  });

  return {
    status: "cache",
    message: "Third fragment found. Your Discovery Cache is ready to open."
  };
}

function getBarcodeFingerprint(value) {
  return normalizeBarcode(value).replace(/^0+/, "");
}

function queueReward(rewardDetails) {
  state.pendingRewards.push(rewardDetails);
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

function showWrongOverlay(scanned, fragmentResult) {
  elements.wrongScanText.textContent =
    `Barcode ${scanned} is not the correct item.`;
  elements.wrongRewardText.textContent = fragmentResult.message;
  elements.wrongRewardText.className =
    `wrong-reward-text reward-${fragmentResult.status}`;
  elements.wrongActionButton.textContent =
    fragmentResult.status === "cache"
      ? "Open Discovery Cache"
      : state.player.guesses > 0
        ? "Scan Another Item"
        : "No Guesses Left";
  elements.wrongOverlay.classList.remove("hidden");
}

function closeWrongOverlay() {
  elements.wrongOverlay.classList.add("hidden");

  if (state.pendingRewards.length > 0) {
    state.resumeScannerAfterRewards = true;
    showNextQueuedReward();
    return;
  }

  resumeScannerAfterOverlay();
}

function resumeScannerAfterOverlay() {
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

function showRewardOverlay(details) {
  const reward = details.reward;
  elements.rewardOverlayLabel.textContent = details.label;
  elements.prizeHeading.textContent = details.title;
  elements.prizeItemText.textContent = details.context;
  elements.prizeOverlayText.textContent =
    `${reward.label} - ${reward.subtitle}`;
  elements.prizeCoinImage.classList.toggle("hidden", !reward.coins);
  elements.simulatedGiftCard.classList.toggle(
    "hidden",
    !reward.simulatedGiftCard
  );
  elements.rewardTreasureImage.classList.toggle(
    "hidden",
    Boolean(reward.simulatedGiftCard)
  );
  elements.rewardFinePrint.textContent = details.finePrint;
  elements.rewardActionText.textContent = details.actionLabel;
  elements.prizeOverlay.classList.remove("hidden");
}

function showNextQueuedReward() {
  const nextReward = state.pendingRewards.shift();
  if (nextReward) {
    showRewardOverlay(nextReward);
  }
}

function closePrizeOverlay() {
  if (state.pendingRewards.length > 0) {
    showNextQueuedReward();
    return;
  }

  elements.prizeOverlay.classList.add("hidden");
  state.scanLocked = false;
  clearStatus();
  render();

  if (state.resumeScannerAfterRewards) {
    state.resumeScannerAfterRewards = false;
    resumeScannerAfterOverlay();
  }
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
    const currentPrize = rewardCatalog.find(prize => prize.id === reward.id);
    const displayReward = currentPrize || reward;
    const card = document.createElement("article");
    card.className = `reward-card rarity-${reward.rarity}`;
    card.innerHTML = `
      <span class="reward-rarity">${reward.rarity}</span>
      ${displayReward.coins
        ? '<img class="reward-coin-image" src="assets/gotcha-coin.png" alt="">'
        : displayReward.simulatedGiftCard
          ? '<span class="reward-gift-badge" aria-hidden="true">$5</span>'
        : `<span class="reward-symbol" aria-hidden="true">${displayReward.symbol}</span>`}
      <strong>${escapeHtml(displayReward.label)}</strong>
      <small>${escapeHtml(displayReward.subtitle)}</small>
      <span class="reward-count">x${reward.count}</span>
    `;
    elements.collectionGrid.appendChild(card);
  });

  renderRewardHistory();
}

function renderRewardHistory() {
  const history = state.player.rewardHistory.slice(0, 8);

  if (history.length === 0) {
    elements.rewardHistoryList.innerHTML =
      '<p class="history-empty">Your rewards will appear here.</p>';
    return;
  }

  elements.rewardHistoryList.innerHTML = history.map(entry => {
    const reward = rewardCatalog.find(item => item.id === entry.id);
    const label = reward?.label || entry.label;
    const historyVisual = entry.simulated
      ? "$"
      : reward?.coins
        ? '<img src="assets/gotcha-coin.png" alt="">'
        : escapeHtml(reward?.symbol || "+");
    return `
      <article class="history-row">
        <span class="history-icon ${entry.simulated ? "history-gift" : ""}">
          ${historyVisual}
        </span>
        <div>
          <strong>${escapeHtml(label)}</strong>
          <small>${escapeHtml(entry.source)}</small>
        </div>
        <time datetime="${escapeHtml(entry.earnedAt)}">
          ${formatRewardTime(entry.earnedAt)}
        </time>
      </article>
    `;
  }).join("");
}

function formatRewardTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(date);
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
  state.pendingRewards = [];
  state.resumeScannerAfterRewards = false;
  elements.prizeOverlay.classList.add("hidden");
  elements.wrongOverlay.classList.add("hidden");
  elements.rewardOddsOverlay.classList.add("hidden");
  elements.feedbackStatus.textContent = "";
  clearStatus();
  render();
  trackEvent("progress_reset");
}
