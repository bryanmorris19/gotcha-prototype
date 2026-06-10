"use strict";

const STORAGE_KEY = "gotcha-player-v1";
const STARTING_GUESSES = 3;
const MAX_GUESSES = 5;
const STARTING_COINS = 10;
const COIN_MODEL_VERSION = 2;
const BETTER_CLUE_COST = 10;
const EXTRA_GUESS_COST = 15;
const FRAGMENTS_PER_CACHE = 3;
const MAX_DAILY_CACHES = 3;
const MAX_COMPLETION_HISTORY = 100;
const MAX_REWARD_HISTORY = 50;
const DAILY_GOAL = 3;
const MAX_ANALYTICS_EVENTS = 250;
const MUSIC_VOLUME = 0.16;
const MUSIC_PREFERENCE_VERSION = 1;
const CLOUD_SYNC_DELAY = 900;
const TUTORIAL_VERSION = 1;

const prizes = [
  {
    id: "bronze-star",
    label: "10 Gotcha! Gold",
    subtitle: "Gold Reward",
    symbol: "*",
    rarity: "common",
    coins: 10,
    weight: 60
  },
  {
    id: "gold-coin",
    label: "25 Gotcha! Gold",
    subtitle: "Gold Reward",
    symbol: "O",
    rarity: "rare",
    coins: 25,
    weight: 24
  },
  {
    id: "bonus-guess",
    label: "Bonus Guess",
    subtitle: "Extra Guess",
    symbol: "+",
    rarity: "common",
    extraGuess: 1,
    weight: 10
  },
  {
    id: "store-trophy",
    label: "50 Gotcha! Gold",
    subtitle: "Gold Reward",
    symbol: "<>",
    rarity: "epic",
    coins: 50,
    weight: 5
  },
  {
    id: "royal-crown",
    label: "100 Gotcha! Gold",
    subtitle: "Gold Reward",
    symbol: "#",
    rarity: "legendary",
    coins: 100,
    weight: 1
  }
];

const cacheRewards = [
  {
    id: "cache-coins-2",
    label: "2 Gotcha! Gold",
    subtitle: "Discovery Cache",
    rarity: "common",
    coins: 2,
    weight: 55
  },
  {
    id: "cache-coins-3",
    label: "3 Gotcha! Gold",
    subtitle: "Discovery Cache",
    rarity: "common",
    coins: 3,
    weight: 30
  },
  {
    id: "cache-coins-5",
    label: "5 Gotcha! Gold",
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

const rewardCatalog = [...prizes, ...cacheRewards];
const artifactCatalog = [
  {
    id: "lucky-key",
    label: "Tablet Fragment I",
    subtitle: "The first section of the glowing route",
    rarity: "common",
    icon: "icon-map"
  },
  {
    id: "signal-compass",
    label: "Tablet Fragment II",
    subtitle: "The route turns toward a distant marker",
    rarity: "rare",
    icon: "icon-map"
  },
  {
    id: "emerald-lantern",
    label: "Tablet Fragment III",
    subtitle: "Ancient lines continue across the stone",
    rarity: "rare",
    icon: "icon-map"
  },
  {
    id: "secret-map",
    label: "Tablet Fragment IV",
    subtitle: "A hidden landmark appears on the route",
    rarity: "epic",
    icon: "icon-map"
  },
  {
    id: "vault-crown",
    label: "Tablet Fragment V",
    subtitle: "The path approaches its final destination",
    rarity: "legendary",
    icon: "icon-map"
  },
  {
    id: "star-relic",
    label: "Tablet Fragment VI",
    subtitle: "The final route and scanner seal",
    rarity: "legendary",
    icon: "icon-map"
  }
];
const artifactIds = new Set(artifactCatalog.map(artifact => artifact.id));

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
  resumeScannerAfterRewards: false,
  scannerSessionId: 0,
  supabase: null,
  accountUser: null,
  accountReady: false,
  accountBusy: false,
  accountSyncedUserId: "",
  accountStatusMessage: "Connecting account services...",
  accountStatusType: "",
  accountSyncTimer: null,
  cloudSyncing: false,
  cloudSyncPending: false,
  cloudSyncBlocked: false,
  cloudHydrating: false,
  lastCloudSyncAt: null,
  tutorialIndex: 0,
  tutorialTouchStartX: null,
  tutorialTouchStartY: null,
  tutorialPreviousFocus: null,
  tabletPreviewEnabled:
    new URLSearchParams(window.location.search).get("tablet-preview") === "1",
  tabletPreviewCount: 0,
  tabletPreviewFinalSuccess: false,
  scanPreviewProgress: 0,
  scanPreviewGuesses: STARTING_GUESSES,
  scanPreviewSignalFragments: 0,
  scanPreviewRewardActive: false,
  scanPreviewRewardQueue: [],
  scanPreviewReturnToTablet: false
};

const elements = {};

document.addEventListener("DOMContentLoaded", initializeApp);

async function initializeApp() {
  cacheElements();
  bindEvents();

  try {
    state.hunts = await loadHunts();
    state.player = loadPlayer();
    applyDailyReset(!state.tabletPreviewEnabled);
    if (
      !state.tabletPreviewEnabled &&
      state.player.dailyProgress >= DAILY_GOAL &&
      !state.player.dailyArtifactClaimed
    ) {
      unlockDailyArtifact(false);
      savePlayer();
    }
    render();
    initializeTabletPreview();
    scheduleMidnightReset();
    startCountdown();
    registerServiceWorker();
    if (state.tabletPreviewEnabled) {
      state.accountReady = true;
      state.accountStatusMessage =
        "Admin walkthrough mode does not connect or sync account progress.";
      renderAccount();
      maybeOpenTutorial();
    } else {
      trackEvent("app_opened");
      initializeAccount().finally(maybeOpenTutorial);
    }
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
  elements.musicToggleButton = document.getElementById("musicToggleButton");
  elements.musicToggleIcon = document.getElementById("musicToggleIcon");
  elements.backgroundMusic = document.getElementById("backgroundMusic");
  elements.coinsValue = document.getElementById("coinsValue");
  elements.streakValue = document.getElementById("streakValue");
  elements.clueText = document.getElementById("clueText");
  elements.huntMeta = document.getElementById("huntMeta");
  elements.dailyProgressText = document.getElementById("dailyProgressText");
  elements.dailyProgressBar = document.getElementById("dailyProgressBar");
  elements.dailyArtifactMessage = document.getElementById(
    "dailyArtifactMessage"
  );
  elements.resetCountdown = document.getElementById("resetCountdown");
  elements.fragmentText = document.getElementById("fragmentText");
  elements.fragmentPips = Array.from(
    document.querySelectorAll("#fragmentPips span")
  );
  elements.cacheLimitText = document.getElementById("cacheLimitText");
  elements.buyGuessButton = document.getElementById("buyGuessButton");
  elements.buyGuessLabel = document.getElementById("buyGuessLabel");
  elements.huntNotice = document.getElementById("huntNotice");
  elements.rewardOddsButton = document.getElementById("rewardOddsButton");
  elements.rewardOddsOverlay = document.getElementById("rewardOddsOverlay");
  elements.closeRewardOddsButton = document.getElementById(
    "closeRewardOddsButton"
  );
  elements.betterClueButton = document.getElementById("betterClueButton");
  elements.resetButton = document.getElementById("resetButton");
  elements.scannerLaunchButton = document.getElementById(
    "scannerLaunchButton"
  );
  elements.scannerOverlay = document.getElementById("scannerOverlay");
  elements.scannerState = document.getElementById("scannerState");
  elements.stopScannerButton = document.getElementById("stopScannerButton");
  elements.torchButton = document.getElementById("torchButton");
  elements.scannerShell = document.getElementById("scannerShell");
  elements.barcodeStatus = document.getElementById("barcodeStatus");
  elements.feedbackStatus = document.getElementById("feedbackStatus");
  elements.prizeOverlay = document.getElementById("prizeOverlay");
  elements.prizeItemText = document.getElementById("prizeItemText");
  elements.prizeOverlayText = document.getElementById("prizeOverlayText");
  elements.prizeCoinImage = document.getElementById("prizeCoinImage");
  elements.prizeArtifactIcon = document.getElementById("prizeArtifactIcon");
  elements.prizeArtifactIconUse = document.getElementById(
    "prizeArtifactIconUse"
  );
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
  elements.collectionCount = document.getElementById("collectionCount");
  elements.artifactPuzzleText = document.getElementById(
    "artifactPuzzleText"
  );
  elements.artifactPuzzleBar = document.getElementById("artifactPuzzleBar");
  elements.artifactPuzzleMessage = document.getElementById(
    "artifactPuzzleMessage"
  );
  elements.tabletStage = document.getElementById("tabletStage");
  elements.tabletPieces = Array.from(
    document.querySelectorAll("[data-tablet-piece]")
  );
  elements.finalHuntPanel = document.getElementById("finalHuntPanel");
  elements.finalHuntSealUse = document.getElementById("finalHuntSealUse");
  elements.finalHuntLocked = document.getElementById("finalHuntLocked");
  elements.finalHuntUnlocked = document.getElementById("finalHuntUnlocked");
  elements.openFinalScannerButton = document.getElementById(
    "openFinalScannerButton"
  );
  elements.tabletAdminPanel = document.getElementById("tabletAdminPanel");
  elements.scanAdminPanel = document.getElementById("scanAdminPanel");
  elements.scanPreviewStatus = document.getElementById("scanPreviewStatus");
  elements.scanPreviewComplete = document.getElementById(
    "scanPreviewComplete"
  );
  elements.scanPreviewReset = document.getElementById("scanPreviewReset");
  elements.scanPreviewViewTablet = document.getElementById(
    "scanPreviewViewTablet"
  );
  elements.previewScannerControls = document.getElementById(
    "previewScannerControls"
  );
  elements.previewCorrectScanButton = document.getElementById(
    "previewCorrectScanButton"
  );
  elements.previewWrongScanButton = document.getElementById(
    "previewWrongScanButton"
  );
  elements.tabletPreviewViewHunt = document.getElementById(
    "tabletPreviewViewHunt"
  );
  elements.tabletPreviewStatus = document.getElementById(
    "tabletPreviewStatus"
  );
  elements.tabletPreviewPrevious = document.getElementById(
    "tabletPreviewPrevious"
  );
  elements.tabletPreviewNext = document.getElementById("tabletPreviewNext");
  elements.tabletPreviewComplete = document.getElementById(
    "tabletPreviewComplete"
  );
  elements.tabletPreviewReset = document.getElementById("tabletPreviewReset");
  elements.finalScannerOverlay = document.getElementById(
    "finalScannerOverlay"
  );
  elements.finalScannerReady = document.getElementById("finalScannerReady");
  elements.finalScannerSuccess = document.getElementById(
    "finalScannerSuccess"
  );
  elements.simulateFinalScanButton = document.getElementById(
    "simulateFinalScanButton"
  );
  elements.closeFinalScannerButton = document.getElementById(
    "closeFinalScannerButton"
  );
  elements.closeFinalSuccessButton = document.getElementById(
    "closeFinalSuccessButton"
  );
  elements.rewardHistoryList = document.getElementById("rewardHistoryList");
  elements.groceryListCount = document.getElementById("groceryListCount");
  elements.groceryForm = document.getElementById("groceryForm");
  elements.groceryInput = document.getElementById("groceryInput");
  elements.groceryList = document.getElementById("groceryList");
  elements.emptyGroceryList = document.getElementById("emptyGroceryList");
  elements.clearCompletedButton = document.getElementById(
    "clearCompletedButton"
  );
  elements.profileName = document.getElementById("profileName");
  elements.profileLevel = document.getElementById("profileLevel");
  elements.nicknameInput = document.getElementById("nicknameInput");
  elements.saveNicknameButton = document.getElementById("saveNicknameButton");
  elements.accountSignedOut = document.getElementById("accountSignedOut");
  elements.accountSignedIn = document.getElementById("accountSignedIn");
  elements.accountForm = document.getElementById("accountForm");
  elements.accountEmailInput = document.getElementById("accountEmailInput");
  elements.accountSubmitButton = document.getElementById(
    "accountSubmitButton"
  );
  elements.accountEmail = document.getElementById("accountEmail");
  elements.accountStatus = document.getElementById("accountStatus");
  elements.syncAccountButton = document.getElementById("syncAccountButton");
  elements.signOutButton = document.getElementById("signOutButton");
  elements.totalHuntsValue = document.getElementById("totalHuntsValue");
  elements.collectionMetricValue = document.getElementById("collectionMetricValue");
  elements.bestStreakValue = document.getElementById("bestStreakValue");
  elements.installButton = document.getElementById("installButton");
  elements.installHelp = document.getElementById("installHelp");
  elements.replayTutorialButton = document.getElementById(
    "replayTutorialButton"
  );
  elements.tutorialOverlay = document.getElementById("tutorialOverlay");
  elements.tutorialViewport = document.getElementById("tutorialViewport");
  elements.tutorialTrack = document.getElementById("tutorialTrack");
  elements.tutorialSlides = Array.from(
    document.querySelectorAll("[data-tutorial-slide]")
  );
  elements.tutorialDots = Array.from(
    document.querySelectorAll("[data-tutorial-dot]")
  );
  elements.skipTutorialButton = document.getElementById(
    "skipTutorialButton"
  );
  elements.tutorialBackButton = document.getElementById(
    "tutorialBackButton"
  );
  elements.tutorialNextButton = document.getElementById(
    "tutorialNextButton"
  );
  elements.tutorialNextLabel = document.getElementById("tutorialNextLabel");
  elements.views = Array.from(document.querySelectorAll(".app-view"));
  elements.navButtons = Array.from(document.querySelectorAll("[data-view-button]"));
  elements.viewLinks = Array.from(document.querySelectorAll("[data-target-view]"));
}

function bindEvents() {
  elements.musicToggleButton.addEventListener("click", toggleBackgroundMusic);
  elements.betterClueButton.addEventListener("click", upgradeClue);
  elements.buyGuessButton.addEventListener("click", buyExtraGuess);
  elements.rewardOddsButton.addEventListener("click", openRewardOdds);
  elements.closeRewardOddsButton.addEventListener("click", closeRewardOdds);
  elements.resetButton.addEventListener("click", resetDemo);
  elements.scannerLaunchButton.addEventListener("click", startBarcodeScanner);
  elements.stopScannerButton.addEventListener("click", stopBarcodeScanner);
  elements.torchButton.addEventListener("click", toggleTorch);
  elements.nextHuntButton.addEventListener("click", closePrizeOverlay);
  elements.wrongActionButton.addEventListener("click", closeWrongOverlay);
  elements.openFinalScannerButton.addEventListener("click", openFinalScanner);
  elements.closeFinalScannerButton.addEventListener(
    "click",
    closeFinalScanner
  );
  elements.closeFinalSuccessButton.addEventListener(
    "click",
    closeFinalScanner
  );
  elements.simulateFinalScanButton.addEventListener(
    "click",
    simulateFinalScanSuccess
  );
  elements.previewCorrectScanButton.addEventListener(
    "click",
    simulatePreviewCorrectScan
  );
  elements.previewWrongScanButton.addEventListener(
    "click",
    simulatePreviewWrongScan
  );
  elements.scanPreviewComplete.addEventListener(
    "click",
    completePreviewDailyHunt
  );
  elements.scanPreviewReset.addEventListener(
    "click",
    resetPreviewScans
  );
  elements.scanPreviewViewTablet.addEventListener(
    "click",
    () => switchView("collection")
  );
  elements.tabletPreviewViewHunt.addEventListener(
    "click",
    () => switchView("home")
  );
  elements.tabletPreviewPrevious.addEventListener(
    "click",
    previewPreviousTabletFragment
  );
  elements.tabletPreviewNext.addEventListener(
    "click",
    previewNextTabletFragment
  );
  elements.tabletPreviewComplete.addEventListener(
    "click",
    previewCompleteTablet
  );
  elements.tabletPreviewReset.addEventListener(
    "click",
    resetTabletPreview
  );
  elements.groceryForm.addEventListener("submit", addGroceryItem);
  elements.groceryList.addEventListener("change", handleGroceryListChange);
  elements.groceryList.addEventListener("click", handleGroceryListClick);
  elements.clearCompletedButton.addEventListener(
    "click",
    clearCompletedGroceryItems
  );
  elements.saveNicknameButton.addEventListener("click", saveNickname);
  elements.accountForm.addEventListener("submit", requestMagicLink);
  elements.syncAccountButton.addEventListener("click", syncAccountNow);
  elements.signOutButton.addEventListener("click", signOutAccount);
  elements.installButton.addEventListener("click", installApp);
  elements.replayTutorialButton.addEventListener("click", openTutorial);
  elements.skipTutorialButton.addEventListener("click", skipTutorial);
  elements.tutorialBackButton.addEventListener("click", showPreviousTutorialSlide);
  elements.tutorialNextButton.addEventListener("click", advanceTutorial);
  elements.tutorialDots.forEach(button => {
    button.addEventListener("click", () => {
      setTutorialSlide(Number(button.dataset.tutorialDot));
    });
  });
  elements.tutorialViewport.addEventListener(
    "touchstart",
    handleTutorialTouchStart,
    { passive: true }
  );
  elements.tutorialViewport.addEventListener(
    "touchend",
    handleTutorialTouchEnd,
    { passive: true }
  );
  elements.navButtons.forEach(button => {
    button.addEventListener("click", () => switchView(button.dataset.viewButton));
  });
  elements.viewLinks.forEach(button => {
    button.addEventListener("click", () => switchView(button.dataset.targetView));
  });
  document.addEventListener("click", unlockBackgroundMusic, {
    passive: true
  });
  document.addEventListener("keydown", unlockBackgroundMusic);
  document.addEventListener("keydown", handleTutorialKeydown);
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
    coinModelVersion: COIN_MODEL_VERSION,
    streak: 0,
    guesses: STARTING_GUESSES,
    dailyDate: "",
    dailyProgress: 0,
    betterClueUsed: false,
    signalFragments: 0,
    dailyCachesOpened: 0,
    dailyScannedBarcodes: [],
    dailyArtifactClaimed: false,
    lastCompletionDate: "",
    completedHunts: [],
    nickname: "Treasure Hunter",
    bestStreak: 0,
    collection: {},
    rewardHistory: [],
    groceryItems: [],
    tutorialVersion: 0,
    musicMuted: true,
    musicPreferenceVersion: MUSIC_PREFERENCE_VERSION,
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
    const hasRecordedActivity =
      (Array.isArray(saved.completedHunts) && saved.completedHunts.length > 0) ||
      (Array.isArray(saved.dailyScannedBarcodes) &&
        saved.dailyScannedBarcodes.length > 0) ||
      (Array.isArray(saved.rewardHistory) && saved.rewardHistory.length > 0) ||
      Number(saved.analytics?.counters?.scan_correct || 0) > 0 ||
      Number(saved.analytics?.counters?.scan_wrong || 0) > 0 ||
      Number(saved.analytics?.counters?.better_clue_used || 0) > 0 ||
      Number(saved.analytics?.counters?.extra_guess_purchased || 0) > 0;
    const rawSavedCollection =
      saved.collection && typeof saved.collection === "object"
        ? saved.collection
        : {};
    const savedCollection = Object.fromEntries(
      Object.entries(rawSavedCollection).filter(([id]) =>
        artifactIds.has(id)
      )
    );
    const savedRewardHistory = Array.isArray(saved.rewardHistory)
      ? saved.rewardHistory
      : [];
    const hasTrainingReward =
      Boolean(rawSavedCollection["training-bonus-20"]) ||
      savedRewardHistory.some(entry => entry.id === "training-bonus-20");
    const needsCoinMigration =
      Number(saved.coinModelVersion) !== COIN_MODEL_VERSION;
    let currentCoins = migratedCoins;
    let lifetimeCoins = migratedLifetimeCoins;
    let collection = savedCollection;
    let rewardHistory = savedRewardHistory;

    if (needsCoinMigration && hasTrainingReward) {
      currentCoins =
        Math.max(0, migratedCoins - 20) + STARTING_COINS;
      lifetimeCoins = Math.max(0, migratedLifetimeCoins - 20);
      delete collection["training-bonus-20"];
      rewardHistory = rewardHistory.filter(
        entry => entry.id !== "training-bonus-20"
      );
    } else if (
      needsCoinMigration &&
      !hasRecordedActivity &&
      migratedLifetimeCoins === 0
    ) {
      currentCoins = STARTING_COINS;
    }

    const savedPlayer = { ...saved };
    delete savedPlayer.trainingBonusClaimed;

    return {
      ...fallback,
      ...savedPlayer,
      coins: currentCoins,
      lifetimeCoins,
      coinEconomyInitialized: true,
      coinModelVersion: COIN_MODEL_VERSION,
      completedHunts: Array.isArray(saved.completedHunts)
        ? saved.completedHunts
        : [],
      collection,
      dailyArtifactClaimed: Boolean(
        saved.dailyArtifactClaimed ?? saved.dailyChestClaimed
      ),
      dailyScannedBarcodes: Array.isArray(saved.dailyScannedBarcodes)
        ? saved.dailyScannedBarcodes
        : [],
      rewardHistory,
      groceryItems: Array.isArray(saved.groceryItems)
        ? saved.groceryItems
            .filter(item => item && typeof item.text === "string")
            .map(item => ({
              id: String(item.id || createGroceryItemId()),
              text: item.text.trim().slice(0, 80),
              checked: Boolean(item.checked),
              createdAt: item.createdAt || new Date().toISOString()
            }))
            .filter(item => item.text)
        : [],
      musicMuted:
        Number(saved.musicPreferenceVersion) === MUSIC_PREFERENCE_VERSION
          ? Boolean(saved.musicMuted)
          : true,
      musicPreferenceVersion: MUSIC_PREFERENCE_VERSION,
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
  if (state.tabletPreviewEnabled) {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.player));
    scheduleCloudSync();
  } catch (error) {
    console.error("Local progress could not be saved:", error);
  }
}

function applyDailyReset(persist = true) {
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
  state.player.dailyArtifactClaimed = false;
  if (persist) {
    savePlayer();
  }
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
  renderMusicToggle();
  elements.coinsValue.textContent = state.player.coins;
  elements.streakValue.textContent = state.player.streak;
  elements.clueText.textContent = state.player.betterClueUsed
    ? hunt.betterClue
    : hunt.clue;
  elements.huntMeta.textContent =
    `Hunt ${state.player.dailyProgress + 1} for ${formatDate(state.player.dailyDate)}`;
  const dailyCompleted = Math.min(state.player.dailyProgress, DAILY_GOAL);
  elements.dailyProgressText.textContent =
    `${dailyCompleted} of ${DAILY_GOAL} correct scans`;
  elements.dailyProgressBar.style.width =
    `${Math.min(100, (dailyCompleted / DAILY_GOAL) * 100)}%`;
  elements.dailyProgressBar.parentElement.setAttribute(
    "aria-valuenow",
    String(dailyCompleted)
  );
  const scansRemaining = DAILY_GOAL - dailyCompleted;
  const puzzleComplete = artifactCatalog.every(
    artifact => state.player.collection[artifact.id]
  );
  elements.dailyArtifactMessage.textContent =
    state.player.dailyArtifactClaimed
      ? puzzleComplete
        ? "Daily fragment recovered. The complete tablet reveals the final scanner."
        : "Daily fragment recovered. Return tomorrow to reveal another route section."
      : `${scansRemaining} more correct ${
          scansRemaining === 1 ? "scan" : "scans"
        } to recover today's tablet fragment.`;
  elements.scannerLaunchButton.disabled =
    state.player.guesses <= 0 || state.scannerRunning;
  elements.betterClueButton.disabled =
    state.player.coins < BETTER_CLUE_COST || state.player.betterClueUsed;
  renderRewardProgress();
  renderCollection();
  renderGroceryList();
  renderProfile();
  if (state.tabletPreviewEnabled) {
    renderScanPreview();
  }
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
  elements.buyGuessButton.disabled =
    state.player.coins < EXTRA_GUESS_COST ||
    state.player.guesses >= MAX_GUESSES;
  elements.buyGuessLabel.textContent =
    state.player.guesses >= MAX_GUESSES ? "Guesses Full" : "+1 Guess";
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
    showHuntNotice("You already have the better clue.", "neutral");
    return;
  }

  if (state.player.coins < BETTER_CLUE_COST) {
    showHuntNotice(
      `You need ${BETTER_CLUE_COST} Gotcha! Gold for the easier clue.`,
      "fail"
    );
    return;
  }

  state.player.coins -= BETTER_CLUE_COST;
  state.player.betterClueUsed = true;
  savePlayer();
  render();
  showHuntNotice(
    `Easier clue unlocked for ${BETTER_CLUE_COST} Gotcha! Gold.`,
    "neutral"
  );
  trackEvent("better_clue_used");
}

function buyExtraGuess() {
  if (state.player.guesses >= MAX_GUESSES) {
    showHuntNotice(
      `You can hold up to ${MAX_GUESSES} guesses.`,
      "neutral"
    );
    return;
  }

  if (state.player.coins < EXTRA_GUESS_COST) {
    showHuntNotice(
      `You need ${EXTRA_GUESS_COST} Gotcha! Gold for an extra guess.`,
      "fail"
    );
    return;
  }

  state.player.coins -= EXTRA_GUESS_COST;
  state.player.guesses += 1;
  savePlayer();
  render();
  showHuntNotice(
    `Extra guess purchased for ${EXTRA_GUESS_COST} Gotcha! Gold.`,
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
  if (state.tabletPreviewEnabled) {
    openPreviewScanner();
    return Promise.resolve();
  }

  if (state.player.guesses <= 0) {
    showHuntNotice("No guesses left for this hunt.", "fail");
    return Promise.resolve();
  }

  if (state.scannerRunning) {
    elements.scannerOverlay.classList.remove("hidden");
    return Promise.resolve();
  }

  elements.scannerOverlay.classList.remove("hidden");
  elements.scannerState.textContent = "Starting";
  elements.scannerLaunchButton.disabled = true;
  clearHuntNotice();

  if (typeof Html5Qrcode === "undefined") {
    elements.scannerState.textContent = "Unavailable";
    showStatus("The barcode scanner could not be loaded.", "fail");
    return Promise.resolve();
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

  const sessionId = ++state.scannerSessionId;
  const scanner = new Html5Qrcode("reader", { formatsToSupport });
  state.scanner = scanner;
  state.scanLocked = false;

  return scanner.start(
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
  ).then(async () => {
    if (sessionId !== state.scannerSessionId) {
      try {
        await scanner.stop();
        await scanner.clear();
      } catch (error) {
        console.error("Scanner cleanup error:", error);
      }
      return;
    }

    state.scannerRunning = true;
    elements.scannerShell.classList.add("is-live");
    elements.scannerState.textContent = "Live";
    updateTorchAvailability();
    showStatus(
      "Scanner running. Point the camera at a product barcode.",
      "neutral"
    );
  }).catch(error => {
    if (sessionId !== state.scannerSessionId) {
      return;
    }

    state.scanner = null;
    state.scannerRunning = false;
    elements.scannerShell.classList.remove("is-live");
    elements.scannerState.textContent = "Error";
    elements.scannerLaunchButton.disabled = state.player.guesses <= 0;
    showStatus(
      "Scanner failed to start. Check camera permission, then close and try again.",
      "fail"
    );
    console.error("Scanner start error:", error);
  });
}

function stopBarcodeScanner() {
  if (state.tabletPreviewEnabled) {
    elements.scannerOverlay.classList.add("hidden");
    elements.scannerState.textContent = "Starting";
    elements.scannerShell.classList.remove("is-live");
    elements.scannerShell.classList.remove("is-preview");
    elements.previewScannerControls.classList.add("hidden");
    state.scanLocked = false;
    return Promise.resolve();
  }

  state.scannerSessionId += 1;
  elements.scannerOverlay.classList.add("hidden");
  elements.scannerState.textContent = "Starting";

  if (!state.scanner) {
    state.scannerRunning = false;
    elements.scannerLaunchButton.disabled = state.player?.guesses <= 0;
    return Promise.resolve();
  }

  const scanner = state.scanner;
  state.scanner = null;
  state.scannerRunning = false;
  state.torchOn = false;
  elements.torchButton.classList.add("hidden");
  elements.torchButton.classList.remove("active");
  elements.scannerShell.classList.remove("is-live");
  elements.scannerLaunchButton.disabled = state.player.guesses <= 0;

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
    !state.player.dailyArtifactClaimed
  ) {
    unlockDailyArtifact();
  }

  showStatus(
    `Gotcha! ${hunt.name} verified.<br>Scanned: ${scanned}`,
    "success"
  );
  playSuccessFeedback();
  stopBarcodeScanner();
  showRewardOverlay({
    label: "Treasure found!",
    title: "Gotcha!",
    context: `${hunt.name} found`,
    reward: prize,
    finePrint: "Your guesses have been refreshed for the next hunt.",
    actionLabel: "Start Next Hunt"
  });
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

  recordRewardHistory(reward, source);
  trackEvent("reward_earned", {
    rewardId: reward.id,
    rarity: reward.rarity
  });
}

function addPrizeToCollection(prize) {
  if (!artifactIds.has(prize.id)) {
    return;
  }

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
}

function unlockDailyArtifact(showOverlay = true) {
  state.player.dailyArtifactClaimed = true;
  const artifact = artifactCatalog.find(
    item => !state.player.collection[item.id]
  );

  if (!artifact) {
    trackEvent("daily_artifact_completed");
    return;
  }

  addPrizeToCollection(artifact);
  recordRewardHistory(artifact, "Daily Artifact");
  trackEvent("daily_artifact_unlocked", {
    artifactId: artifact.id
  });

  const remainingArtifacts = artifactCatalog.filter(
    item => !state.player.collection[item.id]
  ).length;
  if (showOverlay) {
    queueReward({
      openActionLabel: "Reveal Daily Artifact",
      label: "Stone fragment recovered!",
      title: artifact.label,
      context: `${DAILY_GOAL} correct scans completed`,
      reward: artifact,
      finePrint: remainingArtifacts === 0
        ? "Tablet complete. The special final scanner is now unlocked."
        : `${remainingArtifacts} ${
            remainingArtifacts === 1 ? "fragment remains" : "fragments remain"
          } in the stone tablet.`,
      actionLabel: remainingArtifacts === 0
        ? "View Completed Tablet"
        : "Add to Tablet"
    });
  }
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
    openActionLabel: "Open Discovery Cache",
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
  elements.wrongActionButton.textContent = getNextRewardActionLabel(
    fragmentResult.status === "cache"
      ? "Open Discovery Cache"
      : state.player.guesses > 0
        ? "Scan Another Item"
        : "No Guesses Left"
  );
  elements.wrongOverlay.classList.remove("hidden");
}

function closeWrongOverlay() {
  elements.wrongOverlay.classList.add("hidden");

  if (state.tabletPreviewEnabled) {
    if (state.scanPreviewGuesses <= 0) {
      stopBarcodeScanner();
      showHuntNotice(
        "Preview guesses reached zero. Reset the scan preview to continue.",
        "fail"
      );
    } else {
      state.scanLocked = false;
      elements.scannerState.textContent = "Preview";
      showStatus(
        "Preview scanner ready. Choose another simulated barcode result.",
        "neutral"
      );
    }
    renderScanPreview();
    return;
  }

  if (state.pendingRewards.length > 0) {
    state.resumeScannerAfterRewards = true;
    showNextQueuedReward();
    return;
  }

  resumeScannerAfterOverlay();
}

function resumeScannerAfterOverlay() {
  if (state.player.guesses <= 0) {
    showHuntNotice("No guesses left for this hunt.", "fail");
    stopBarcodeScanner();
    return;
  }

  try {
    state.scanner.resume();
    state.scanLocked = false;
    elements.scannerState.textContent = "Live";
    showStatus(
      "Scanner ready. Point the camera at another product barcode.",
      "neutral"
    );
  } catch (error) {
    console.error("Scanner resume error:", error);
    state.scanLocked = false;
    state.scannerRunning = false;
    state.scanner = null;
    elements.scannerState.textContent = "Error";
    showStatus(
      "Scanner could not resume. Close it and tap the scan icon to try again.",
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
  elements.prizeArtifactIcon.classList.toggle("hidden", !reward.icon);
  if (reward.icon) {
    elements.prizeArtifactIconUse.setAttribute("href", `#${reward.icon}`);
  }
  elements.simulatedGiftCard.classList.toggle(
    "hidden",
    !reward.simulatedGiftCard
  );
  elements.rewardTreasureImage.classList.toggle(
    "hidden",
    !details.showChest
  );
  elements.rewardFinePrint.textContent = details.finePrint;
  elements.rewardActionText.textContent =
    getNextRewardActionLabel(details.actionLabel);
  elements.prizeOverlay.classList.remove("hidden");
}

function getNextRewardActionLabel(fallback) {
  return state.pendingRewards[0]?.openActionLabel || fallback;
}

function showNextQueuedReward() {
  const nextReward = state.pendingRewards.shift();
  if (nextReward) {
    showRewardOverlay(nextReward);
  }
}

function closePrizeOverlay() {
  if (
    state.tabletPreviewEnabled &&
    state.scanPreviewRewardActive
  ) {
    const nextPreviewReward = state.scanPreviewRewardQueue.shift();
    if (nextPreviewReward) {
      showRewardOverlay(nextPreviewReward);
      return;
    }

    elements.prizeOverlay.classList.add("hidden");
    state.scanPreviewRewardActive = false;
    state.scanLocked = false;
    render();
    if (state.scanPreviewReturnToTablet) {
      state.scanPreviewReturnToTablet = false;
      switchView("collection");
    }
    return;
  }

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

function getPreviewHunt() {
  const huntOffset = Math.min(
    state.scanPreviewProgress,
    DAILY_GOAL - 1
  );
  const index =
    (getDailyStartIndex() + huntOffset) % state.hunts.length;
  return state.hunts[index];
}

function renderScanPreview() {
  if (!state.tabletPreviewEnabled || state.hunts.length === 0) {
    return;
  }

  const hunt = getPreviewHunt();
  const completed = Math.min(state.scanPreviewProgress, DAILY_GOAL);
  const scansRemaining = Math.max(0, DAILY_GOAL - completed);
  elements.scanAdminPanel.classList.remove("hidden");
  elements.guessesValue.textContent = state.scanPreviewGuesses;
  elements.clueText.textContent = hunt.clue;
  elements.huntMeta.textContent =
    `Admin preview - Hunt ${Math.min(completed + 1, DAILY_GOAL)} of ${DAILY_GOAL}`;
  elements.dailyProgressText.textContent =
    `${completed} of ${DAILY_GOAL} correct scans`;
  elements.dailyProgressBar.style.width =
    `${Math.min(100, (completed / DAILY_GOAL) * 100)}%`;
  elements.dailyProgressBar.parentElement.setAttribute(
    "aria-valuenow",
    String(completed)
  );
  elements.dailyArtifactMessage.textContent = completed >= DAILY_GOAL
    ? "Daily hunt complete. A tablet fragment has been recovered."
    : `${scansRemaining} more correct ${
        scansRemaining === 1 ? "scan" : "scans"
      } to recover a tablet fragment.`;
  elements.scanPreviewStatus.textContent = completed >= DAILY_GOAL
    ? "Daily hunt complete - tablet fragment recovered"
    : `${completed} of ${DAILY_GOAL} correct scans completed`;
  elements.resetButton.textContent = "Reset walkthrough";
  elements.resetButton.disabled = false;
  elements.scannerLaunchButton.disabled =
    state.scanPreviewGuesses <= 0 || completed >= DAILY_GOAL;
  elements.scanPreviewComplete.disabled = completed >= DAILY_GOAL;
  elements.scanPreviewReset.disabled =
    completed === 0 &&
    state.scanPreviewGuesses === STARTING_GUESSES &&
    state.scanPreviewSignalFragments === 0;
  elements.previewCorrectScanButton.disabled =
    state.scanPreviewGuesses <= 0 || completed >= DAILY_GOAL;
  elements.previewWrongScanButton.disabled =
    state.scanPreviewGuesses <= 0 || completed >= DAILY_GOAL;

  const fragmentCount = Math.min(
    state.scanPreviewSignalFragments,
    FRAGMENTS_PER_CACHE
  );
  elements.fragmentText.textContent =
    `${fragmentCount} of ${FRAGMENTS_PER_CACHE} Preview Signal Fragments`;
  document.getElementById("fragmentPips").setAttribute(
    "aria-valuenow",
    String(fragmentCount)
  );
  elements.fragmentPips.forEach((pip, index) => {
    pip.classList.toggle("earned", index < fragmentCount);
  });
  elements.cacheLimitText.textContent =
    "Wrong scan rewards are simulated in walkthrough mode";
}

function openPreviewScanner() {
  if (
    state.scanPreviewGuesses <= 0 ||
    state.scanPreviewProgress >= DAILY_GOAL
  ) {
    return;
  }

  clearHuntNotice();
  enableFeedback();
  state.scanLocked = false;
  elements.scannerOverlay.classList.remove("hidden");
  elements.scannerShell.classList.add("is-live");
  elements.scannerShell.classList.add("is-preview");
  elements.scannerState.textContent = "Preview";
  elements.previewScannerControls.classList.remove("hidden");
  elements.torchButton.classList.add("hidden");
  showStatus(
    "Admin scanner preview. Choose a correct or wrong barcode result below.",
    "neutral"
  );
  renderScanPreview();
}

function simulatePreviewCorrectScan() {
  if (
    !state.tabletPreviewEnabled ||
    state.scanPreviewGuesses <= 0 ||
    state.scanPreviewProgress >= DAILY_GOAL
  ) {
    return;
  }

  const hunt = getPreviewHunt();
  state.scanPreviewProgress += 1;
  state.scanPreviewGuesses = STARTING_GUESSES;
  state.scanLocked = true;
  state.scanPreviewRewardActive = true;
  state.scanPreviewRewardQueue = [];
  state.scanPreviewReturnToTablet = false;
  stopBarcodeScanner();

  const reward = prizes[
    (state.scanPreviewProgress - 1) % prizes.length
  ];
  const completedDailyHunt = state.scanPreviewProgress >= DAILY_GOAL;

  if (completedDailyHunt) {
    const previousTabletCount = state.tabletPreviewCount;
    state.tabletPreviewCount = Math.min(
      artifactCatalog.length,
      previousTabletCount + 1
    );
    const fragment =
      artifactCatalog[Math.min(previousTabletCount, artifactCatalog.length - 1)];
    state.scanPreviewRewardQueue.push({
      label: "Stone fragment recovered!",
      title: fragment.label,
      context: `${DAILY_GOAL} correct scans completed`,
      reward: fragment,
      finePrint: state.tabletPreviewCount >= artifactCatalog.length
        ? "Tablet complete. The special final scanner is now unlocked."
        : `${artifactCatalog.length - state.tabletPreviewCount} fragments remain in the stone tablet.`,
      actionLabel: "View Stone Tablet"
    });
    state.scanPreviewReturnToTablet = true;
  }

  render();
  playSuccessFeedback();
  showRewardOverlay({
    label: "Treasure found!",
    title: "Gotcha!",
    context: `${hunt.name} found`,
    reward,
    finePrint:
      "Preview reward only. Your walkthrough guesses have been refreshed.",
    actionLabel: completedDailyHunt
      ? "Reveal Tablet Fragment"
      : "Start Next Preview Hunt"
  });
}

function simulatePreviewWrongScan() {
  if (
    !state.tabletPreviewEnabled ||
    state.scanPreviewGuesses <= 0 ||
    state.scanPreviewProgress >= DAILY_GOAL
  ) {
    return;
  }

  state.scanPreviewGuesses = Math.max(
    0,
    state.scanPreviewGuesses - 1
  );
  state.scanLocked = true;
  state.scanPreviewSignalFragments += 1;
  const cacheReady =
    state.scanPreviewSignalFragments >= FRAGMENTS_PER_CACHE;
  if (cacheReady) {
    state.scanPreviewSignalFragments = 0;
  }

  elements.wrongScanText.textContent =
    "The simulated barcode is not the correct item.";
  elements.wrongRewardText.textContent = cacheReady
    ? "Third preview signal found. A Discovery Cache would now open."
    : `Preview Signal Fragment earned: ${state.scanPreviewSignalFragments} of ${FRAGMENTS_PER_CACHE}.`;
  elements.wrongRewardText.className =
    `wrong-reward-text reward-${cacheReady ? "cache" : "earned"}`;
  elements.wrongActionButton.textContent =
    state.scanPreviewGuesses > 0
      ? "Scan Another Preview Item"
      : "No Preview Guesses Left";
  elements.wrongOverlay.classList.remove("hidden");
  playWrongFeedback();
  renderScanPreview();
}

function completePreviewDailyHunt() {
  if (
    !state.tabletPreviewEnabled ||
    state.scanPreviewProgress >= DAILY_GOAL
  ) {
    return;
  }

  state.scanPreviewProgress = DAILY_GOAL - 1;
  state.scanPreviewGuesses = STARTING_GUESSES;
  simulatePreviewCorrectScan();
}

function resetPreviewScans() {
  if (!state.tabletPreviewEnabled) {
    return;
  }

  state.scanPreviewProgress = 0;
  state.scanPreviewGuesses = STARTING_GUESSES;
  state.scanPreviewSignalFragments = 0;
  state.scanPreviewRewardActive = false;
  state.scanPreviewRewardQueue = [];
  state.scanPreviewReturnToTablet = false;
  state.scanLocked = false;
  elements.prizeOverlay.classList.add("hidden");
  elements.wrongOverlay.classList.add("hidden");
  stopBarcodeScanner();
  clearHuntNotice();
  render();
}

function renderCollection() {
  const unlockedArtifacts = artifactCatalog.filter(
    artifact => state.player.collection[artifact.id]
  );
  const actualUnlockedCount = unlockedArtifacts.length;
  const unlockedCount = state.tabletPreviewEnabled
    ? state.tabletPreviewCount
    : actualUnlockedCount;
  const puzzleComplete = unlockedCount === artifactCatalog.length;

  elements.collectionCount.textContent =
    `${unlockedCount} of ${artifactCatalog.length} fragments`;
  elements.artifactPuzzleText.textContent =
    `${unlockedCount} of ${artifactCatalog.length} tablet fragments recovered`;
  elements.artifactPuzzleBar.style.width =
    `${Math.min(100, (unlockedCount / artifactCatalog.length) * 100)}%`;
  elements.artifactPuzzleBar.parentElement.setAttribute(
    "aria-valuenow",
    String(unlockedCount)
  );
  elements.artifactPuzzleMessage.textContent = puzzleComplete
    ? "The glowing route is complete. The final scanner is active."
    : "Every recovered fragment restores another glowing section of the route.";

  elements.tabletPieces.forEach((piece, index) => {
    const unlocked = index < unlockedCount;
    piece.classList.toggle("unlocked", unlocked);
    piece.classList.toggle("locked", !unlocked);
    piece.setAttribute(
      "aria-label",
      unlocked
        ? `${artifactCatalog[index].label} recovered`
        : `Tablet fragment ${index + 1} locked`
    );
  });
  elements.tabletStage.classList.toggle("complete", puzzleComplete);
  elements.finalHuntPanel.classList.toggle("unlocked", puzzleComplete);
  elements.finalHuntPanel.classList.toggle("locked", !puzzleComplete);
  elements.finalHuntLocked.classList.toggle("hidden", puzzleComplete);
  elements.finalHuntUnlocked.classList.toggle("hidden", !puzzleComplete);
  elements.finalHuntSealUse.setAttribute(
    "href",
    puzzleComplete ? "#icon-scan" : "#icon-lock"
  );

  elements.tabletAdminPanel.classList.toggle(
    "hidden",
    !state.tabletPreviewEnabled
  );
  if (state.tabletPreviewEnabled) {
    elements.tabletPreviewStatus.textContent =
      `${unlockedCount} of ${artifactCatalog.length} fragments visible`;
    elements.tabletPreviewPrevious.disabled = unlockedCount === 0;
    elements.tabletPreviewNext.disabled =
      unlockedCount === artifactCatalog.length;
    elements.tabletPreviewComplete.disabled = puzzleComplete;
    elements.tabletPreviewReset.disabled =
      unlockedCount === 0 && !state.tabletPreviewFinalSuccess;
  }

  renderRewardHistory();
}

function initializeTabletPreview() {
  if (!state.tabletPreviewEnabled) {
    return;
  }

  state.tabletPreviewCount = 0;
  state.tabletPreviewFinalSuccess = false;
  state.scanPreviewProgress = 0;
  state.scanPreviewGuesses = STARTING_GUESSES;
  state.scanPreviewSignalFragments = 0;
  state.activeView = "home";
  elements.views.forEach(view => {
    view.classList.toggle("active", view.dataset.view === "home");
  });
  elements.navButtons.forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.viewButton === "home"
    );
  });
  renderScanPreview();
  renderCollection();
}

function previewPreviousTabletFragment() {
  if (!state.tabletPreviewEnabled) {
    return;
  }

  state.tabletPreviewCount = Math.max(0, state.tabletPreviewCount - 1);
  state.tabletPreviewFinalSuccess = false;
  closeFinalScanner();
  renderCollection();
}

function previewNextTabletFragment() {
  if (!state.tabletPreviewEnabled) {
    return;
  }

  state.tabletPreviewCount = Math.min(
    artifactCatalog.length,
    state.tabletPreviewCount + 1
  );
  state.tabletPreviewFinalSuccess = false;
  renderCollection();
}

function previewCompleteTablet() {
  if (!state.tabletPreviewEnabled) {
    return;
  }

  state.tabletPreviewCount = artifactCatalog.length;
  state.tabletPreviewFinalSuccess = false;
  renderCollection();
}

function resetTabletPreview() {
  if (!state.tabletPreviewEnabled) {
    return;
  }

  state.tabletPreviewCount = 0;
  state.tabletPreviewFinalSuccess = false;
  closeFinalScanner();
  renderCollection();
}

function openFinalScanner() {
  const unlockedCount = state.tabletPreviewEnabled
    ? state.tabletPreviewCount
    : artifactCatalog.filter(
        artifact => state.player.collection[artifact.id]
      ).length;

  if (unlockedCount < artifactCatalog.length) {
    return;
  }

  elements.finalScannerReady.classList.remove("hidden");
  elements.finalScannerSuccess.classList.add("hidden");
  elements.simulateFinalScanButton.classList.toggle(
    "hidden",
    !state.tabletPreviewEnabled
  );
  elements.finalScannerOverlay.classList.remove("hidden");
}

function closeFinalScanner() {
  elements.finalScannerOverlay.classList.add("hidden");
  elements.finalScannerReady.classList.remove("hidden");
  elements.finalScannerSuccess.classList.add("hidden");
}

function simulateFinalScanSuccess() {
  if (!state.tabletPreviewEnabled) {
    return;
  }

  state.tabletPreviewFinalSuccess = true;
  elements.finalScannerReady.classList.add("hidden");
  elements.finalScannerSuccess.classList.remove("hidden");
  playSuccessFeedback();
  renderCollection();
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
    const artifact = artifactCatalog.find(item => item.id === entry.id);
    const label = reward?.label || artifact?.label || entry.label;
    const historyVisual = entry.simulated
      ? "$"
      : reward?.coins
        ? '<img src="assets/gotcha-coin.png" alt="">'
        : artifact
          ? `<svg aria-hidden="true"><use href="#${escapeHtml(artifact.icon)}"></use></svg>`
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

function renderGroceryList() {
  const items = [...state.player.groceryItems].sort(
    (left, right) => Number(left.checked) - Number(right.checked)
  );
  const remaining = items.filter(item => !item.checked).length;
  const completed = items.length - remaining;

  elements.groceryListCount.textContent =
    `${remaining} ${remaining === 1 ? "item" : "items"} remaining`;
  elements.groceryList.innerHTML = items.map(item => `
    <article class="grocery-item ${item.checked ? "completed" : ""}">
      <label>
        <input
          type="checkbox"
          data-grocery-check="${escapeHtml(item.id)}"
          ${item.checked ? "checked" : ""}
        />
        <span>${escapeHtml(item.text)}</span>
      </label>
      <button
        class="grocery-remove-button"
        type="button"
        data-remove-grocery="${escapeHtml(item.id)}"
        aria-label="Remove ${escapeHtml(item.text)}"
      >
        <svg><use href="#icon-close"></use></svg>
      </button>
    </article>
  `).join("");
  elements.groceryList.classList.toggle("hidden", items.length === 0);
  elements.emptyGroceryList.classList.toggle("hidden", items.length > 0);
  elements.clearCompletedButton.classList.toggle("hidden", completed === 0);
}

function addGroceryItem(event) {
  event.preventDefault();
  const text = elements.groceryInput.value.trim().slice(0, 80);

  if (!text) {
    elements.groceryInput.focus();
    return;
  }

  state.player.groceryItems.push({
    id: createGroceryItemId(),
    text,
    checked: false,
    createdAt: new Date().toISOString()
  });
  elements.groceryInput.value = "";
  savePlayer();
  renderGroceryList();
  trackEvent("grocery_item_added");
  elements.groceryInput.focus();
}

function handleGroceryListChange(event) {
  const checkbox = event.target.closest("[data-grocery-check]");

  if (!checkbox) {
    return;
  }

  const item = state.player.groceryItems.find(
    candidate => candidate.id === checkbox.dataset.groceryCheck
  );
  if (!item) {
    return;
  }

  item.checked = checkbox.checked;
  savePlayer();
  renderGroceryList();
  trackEvent(item.checked
    ? "grocery_item_completed"
    : "grocery_item_reopened");
}

function handleGroceryListClick(event) {
  const removeButton = event.target.closest("[data-remove-grocery]");

  if (!removeButton) {
    return;
  }

  state.player.groceryItems = state.player.groceryItems.filter(
    item => item.id !== removeButton.dataset.removeGrocery
  );
  savePlayer();
  renderGroceryList();
  trackEvent("grocery_item_removed");
}

function clearCompletedGroceryItems() {
  const completedCount = state.player.groceryItems.filter(
    item => item.checked
  ).length;

  if (completedCount === 0) {
    return;
  }

  state.player.groceryItems = state.player.groceryItems.filter(
    item => !item.checked
  );
  savePlayer();
  renderGroceryList();
  trackEvent("grocery_completed_cleared", {
    count: completedCount
  });
}

function createGroceryItemId() {
  return `grocery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderProfile() {
  const totalCollectibles = artifactCatalog.filter(
    artifact => state.player.collection[artifact.id]
  ).length;
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
  renderAccount();
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

function maybeOpenTutorial() {
  if (
    state.tabletPreviewEnabled ||
    !state.player ||
    Number(state.player.tutorialVersion || 0) >= TUTORIAL_VERSION
  ) {
    return;
  }

  openTutorial();
}

function openTutorial() {
  if (state.scannerRunning) {
    stopBarcodeScanner();
  }

  state.tutorialPreviousFocus =
    document.activeElement instanceof HTMLElement &&
    document.activeElement !== document.body
      ? document.activeElement
      : null;
  elements.tutorialOverlay.classList.remove("hidden");
  document.body.classList.add("tutorial-open");
  setTutorialSlide(0);
  window.setTimeout(() => {
    elements.skipTutorialButton.focus();
  }, 0);
  trackEvent("tutorial_started", {
    version: TUTORIAL_VERSION,
    replay: Number(state.player.tutorialVersion || 0) >= TUTORIAL_VERSION
  });
}

function setTutorialSlide(index) {
  const lastIndex = elements.tutorialSlides.length - 1;
  state.tutorialIndex = Math.max(0, Math.min(lastIndex, index));
  elements.tutorialTrack.style.transform =
    `translateX(-${state.tutorialIndex * 100}%)`;

  elements.tutorialSlides.forEach((slide, slideIndex) => {
    slide.setAttribute(
      "aria-hidden",
      String(slideIndex !== state.tutorialIndex)
    );
  });
  elements.tutorialDots.forEach((dot, dotIndex) => {
    const active = dotIndex === state.tutorialIndex;
    dot.classList.toggle("active", active);
    dot.setAttribute("aria-current", active ? "step" : "false");
  });

  elements.tutorialBackButton.classList.toggle(
    "hidden",
    state.tutorialIndex === 0
  );
  elements.tutorialNextLabel.textContent =
    state.tutorialIndex === lastIndex ? "Start Hunting" : "Next";
}

function showPreviousTutorialSlide() {
  setTutorialSlide(state.tutorialIndex - 1);
}

function advanceTutorial() {
  if (state.tutorialIndex < elements.tutorialSlides.length - 1) {
    setTutorialSlide(state.tutorialIndex + 1);
    return;
  }

  closeTutorial("completed");
}

function skipTutorial() {
  closeTutorial("skipped");
}

function closeTutorial(reason) {
  if (elements.tutorialOverlay.classList.contains("hidden")) {
    return;
  }

  state.player.tutorialVersion = TUTORIAL_VERSION;
  elements.tutorialOverlay.classList.add("hidden");
  document.body.classList.remove("tutorial-open");
  savePlayer();
  trackEvent(`tutorial_${reason}`, {
    version: TUTORIAL_VERSION,
    lastStep: state.tutorialIndex + 1
  });

  const previousFocus = state.tutorialPreviousFocus;
  state.tutorialPreviousFocus = null;
  if (previousFocus?.isConnected) {
    previousFocus.focus();
  } else {
    elements.scannerLaunchButton.focus();
  }
}

function handleTutorialTouchStart(event) {
  state.tutorialTouchStartX = event.changedTouches[0]?.clientX ?? null;
  state.tutorialTouchStartY = event.changedTouches[0]?.clientY ?? null;
}

function handleTutorialTouchEnd(event) {
  if (
    state.tutorialTouchStartX === null ||
    state.tutorialTouchStartY === null
  ) {
    return;
  }

  const touch = event.changedTouches[0];
  const endX = touch?.clientX;
  const endY = touch?.clientY;
  if (!Number.isFinite(endX) || !Number.isFinite(endY)) {
    state.tutorialTouchStartX = null;
    state.tutorialTouchStartY = null;
    return;
  }

  const distanceX = endX - state.tutorialTouchStartX;
  const distanceY = endY - state.tutorialTouchStartY;
  state.tutorialTouchStartX = null;
  state.tutorialTouchStartY = null;

  if (
    Math.abs(distanceX) < 45 ||
    Math.abs(distanceX) <= Math.abs(distanceY)
  ) {
    return;
  }

  if (distanceX < 0) {
    if (state.tutorialIndex < elements.tutorialSlides.length - 1) {
      setTutorialSlide(state.tutorialIndex + 1);
    }
  } else {
    setTutorialSlide(state.tutorialIndex - 1);
  }
}

function handleTutorialKeydown(event) {
  if (elements.tutorialOverlay?.classList.contains("hidden")) {
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    advanceTutorial();
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    showPreviousTutorialSlide();
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    skipTutorial();
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const focusable = Array.from(
    elements.tutorialOverlay.querySelectorAll(
      'button:not([disabled]):not(.hidden), [href], input:not([disabled])'
    )
  ).filter(element => element.offsetParent !== null);

  if (focusable.length === 0) {
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function initializeAccount() {
  state.supabase = window.gotchaSupabase || null;
  state.accountReady = true;

  if (!state.supabase) {
    setAccountStatus(
      "Cloud accounts are unavailable right now. Progress is still saved on this device.",
      "fail"
    );
    return;
  }

  try {
    const { data, error } = await state.supabase.auth.getSession();
    if (error) {
      throw error;
    }

    if (data.session?.user) {
      await connectAccount(data.session.user);
    } else {
      setAccountStatus(
        "Playing as a guest. Sign in to back up this device's progress."
      );
    }

    const { data: authListener } =
      state.supabase.auth.onAuthStateChange((event, session) => {
        window.setTimeout(() => {
          handleAuthStateChange(event, session);
        }, 0);
      });
    state.accountSubscription = authListener.subscription;
  } catch (error) {
    handleCloudError(error, "Account connection failed");
  }
}

async function handleAuthStateChange(event, session) {
  if (session?.user) {
    await connectAccount(session.user);
    return;
  }

  if (event === "SIGNED_OUT") {
    applySignedOutAccount();
  }
}

async function connectAccount(user) {
  state.accountUser = user;
  state.accountBusy = false;
  state.cloudSyncBlocked = false;
  renderAccount();

  if (state.accountSyncedUserId === user.id) {
    return;
  }

  await synchronizePlayerAccount(user);
}

async function synchronizePlayerAccount(user) {
  setAccountStatus("Checking for saved cloud progress...", "pending");

  try {
    const { data, error } = await state.supabase
      .from("player_progress")
      .select("progress, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data?.progress) {
      state.cloudHydrating = true;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.progress));
        state.player = loadPlayer();
        applyDailyReset();
        savePlayer();
      } finally {
        state.cloudHydrating = false;
      }

      state.accountSyncedUserId = user.id;
      state.lastCloudSyncAt = data.updated_at
        ? new Date(data.updated_at)
        : new Date();
      render();
      setAccountStatus("Cloud progress restored on this device.", "success");
      scheduleCloudSync(250);
      return;
    }

    setAccountStatus(
      "Creating your cloud save from this device...",
      "pending"
    );
    await uploadPlayerProgress();
  } catch (error) {
    handleCloudError(error, "Cloud progress could not be loaded");
  }
}

async function requestMagicLink(event) {
  event.preventDefault();

  if (!state.supabase || state.accountBusy) {
    return;
  }

  if (!elements.accountEmailInput.reportValidity()) {
    return;
  }

  const email = elements.accountEmailInput.value.trim();
  state.accountBusy = true;
  setAccountStatus("Sending your secure sign-in link...", "pending");

  try {
    const { error } = await state.supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: getAuthRedirectUrl(),
        data: {
          nickname: state.player.nickname
        }
      }
    });

    if (error) {
      throw error;
    }

    setAccountStatus(
      `Check ${email} and open the Gotcha sign-in link on this device.`,
      "success"
    );
    trackEvent("magic_link_requested");
  } catch (error) {
    handleCloudError(error, "The sign-in email could not be sent");
  } finally {
    state.accountBusy = false;
    renderAccount();
  }
}

function getAuthRedirectUrl() {
  let pathname = window.location.pathname.replace(/index\.html$/i, "");
  if (!pathname.endsWith("/")) {
    pathname += "/";
  }
  return `${window.location.origin}${pathname}`;
}

function scheduleCloudSync(delay = CLOUD_SYNC_DELAY) {
  if (
    state.tabletPreviewEnabled ||
    !state.supabase ||
    !state.accountUser ||
    state.cloudSyncBlocked ||
    state.cloudHydrating
  ) {
    return;
  }

  if (state.cloudSyncing) {
    state.cloudSyncPending = true;
    return;
  }

  window.clearTimeout(state.accountSyncTimer);
  state.accountSyncTimer = window.setTimeout(() => {
    uploadPlayerProgress();
  }, delay);
}

async function uploadPlayerProgress() {
  if (
    state.tabletPreviewEnabled ||
    !state.supabase ||
    !state.accountUser ||
    state.cloudHydrating
  ) {
    return false;
  }

  if (state.cloudSyncing) {
    state.cloudSyncPending = true;
    return false;
  }

  const user = state.accountUser;
  const progress = JSON.parse(JSON.stringify(state.player));
  state.cloudSyncing = true;
  state.cloudSyncPending = false;
  window.clearTimeout(state.accountSyncTimer);
  setAccountStatus("Syncing progress...", "pending");

  try {
    const now = new Date().toISOString();
    const { error: profileError } = await state.supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          nickname: state.player.nickname,
          updated_at: now
        },
        { onConflict: "id" }
      );

    if (profileError) {
      throw profileError;
    }

    const { error: progressError } = await state.supabase
      .from("player_progress")
      .upsert(
        {
          user_id: user.id,
          progress,
          updated_at: now
        },
        { onConflict: "user_id" }
      );

    if (progressError) {
      throw progressError;
    }

    state.accountSyncedUserId = user.id;
    state.lastCloudSyncAt = new Date();
    setAccountStatus(
      `Progress synced at ${formatSyncTime(state.lastCloudSyncAt)}.`,
      "success"
    );
    return true;
  } catch (error) {
    handleCloudError(error, "Progress could not be synced");
    return false;
  } finally {
    state.cloudSyncing = false;
    renderAccount();
    if (state.cloudSyncPending && state.accountUser) {
      state.cloudSyncPending = false;
      scheduleCloudSync(250);
    }
  }
}

async function syncAccountNow() {
  if (!state.accountUser || state.cloudSyncing) {
    return;
  }

  state.cloudSyncBlocked = false;
  window.clearTimeout(state.accountSyncTimer);
  await uploadPlayerProgress();
}

async function signOutAccount() {
  if (!state.supabase || !state.accountUser || state.accountBusy) {
    return;
  }

  state.accountBusy = true;
  renderAccount();
  window.clearTimeout(state.accountSyncTimer);
  await uploadPlayerProgress();

  try {
    const { error } = await state.supabase.auth.signOut();
    if (error) {
      throw error;
    }
    applySignedOutAccount();
  } catch (error) {
    state.accountBusy = false;
    handleCloudError(error, "Could not sign out");
  }
}

function applySignedOutAccount() {
  window.clearTimeout(state.accountSyncTimer);
  state.accountUser = null;
  state.accountBusy = false;
  state.accountSyncedUserId = "";
  state.cloudSyncBlocked = false;
  state.lastCloudSyncAt = null;
  setAccountStatus(
    "Signed out. Progress remains available on this device."
  );
}

function renderAccount() {
  if (!elements.accountSignedOut) {
    return;
  }

  const signedIn = Boolean(state.accountUser);
  const accountAvailable = state.accountReady && Boolean(state.supabase);

  elements.accountSignedOut.classList.toggle("hidden", signedIn);
  elements.accountSignedIn.classList.toggle("hidden", !signedIn);
  elements.accountEmail.textContent = state.accountUser?.email || "";
  elements.accountEmailInput.disabled =
    !accountAvailable || state.accountBusy;
  elements.accountSubmitButton.disabled =
    !accountAvailable || state.accountBusy;
  elements.accountSubmitButton.textContent =
    state.accountBusy && !signedIn ? "Sending..." : "Email Link";
  elements.syncAccountButton.disabled =
    !signedIn || state.cloudSyncing || state.accountBusy;
  elements.syncAccountButton.textContent =
    state.cloudSyncing ? "Syncing..." : "Sync Now";
  elements.signOutButton.disabled = !signedIn || state.accountBusy;
  elements.accountStatus.textContent = state.accountStatusMessage;
  elements.accountStatus.className =
    `account-status ${state.accountStatusType}`.trim();
}

function setAccountStatus(message, type = "") {
  state.accountStatusMessage = message;
  state.accountStatusType = type;
  renderAccount();
}

function handleCloudError(error, fallbackMessage) {
  const message = String(error?.message || "");
  const setupRequired =
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes("player_progress") ||
    message.includes("profiles");

  state.cloudSyncBlocked = setupRequired;
  setAccountStatus(
    setupRequired
      ? "Account connected. Run the Supabase database migration to enable cloud saves."
      : `${fallbackMessage}. Progress is still safe on this device.`,
    "fail"
  );
  console.error(fallbackMessage, error);
}

function formatSyncTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
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
  if (!state.tabletPreviewEnabled) {
    trackEvent("view_opened", { view: viewName });
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function trackEvent(name, details = {}) {
  if (!state.player || state.tabletPreviewEnabled) {
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

function ensureAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (AudioContextClass && !state.audioContext) {
    state.audioContext = new AudioContextClass();
  }

  if (state.audioContext?.state === "suspended") {
    state.audioContext.resume().catch(error => {
      console.error("Audio resume error:", error);
    });
  }

  return state.audioContext;
}

function unlockBackgroundMusic(event) {
  if (!state.player || event?.target?.closest?.("#musicToggleButton")) {
    return;
  }

  if (!state.player.musicMuted) {
    startBackgroundMusic();
  }
  document.removeEventListener("click", unlockBackgroundMusic);
  document.removeEventListener("keydown", unlockBackgroundMusic);
}

function toggleBackgroundMusic() {
  if (!state.player) {
    return;
  }

  state.player.musicMuted = !state.player.musicMuted;
  state.player.musicPreferenceVersion = MUSIC_PREFERENCE_VERSION;
  if (state.player.musicMuted) {
    stopBackgroundMusic();
  } else {
    startBackgroundMusic();
  }
  savePlayer();
  renderMusicToggle();
  trackEvent("music_toggled", {
    muted: state.player.musicMuted
  });
}

function renderMusicToggle() {
  const muted = Boolean(state.player?.musicMuted);
  const label = muted ? "Turn on background music" : "Mute background music";

  elements.musicToggleButton.classList.toggle("muted", muted);
  elements.musicToggleButton.setAttribute("aria-label", "Background music");
  elements.musicToggleButton.setAttribute("aria-pressed", String(!muted));
  elements.musicToggleButton.title = label;
  elements.musicToggleIcon.setAttribute(
    "href",
    muted ? "#icon-music-off" : "#icon-music"
  );
}

function startBackgroundMusic() {
  if (
    state.player?.musicMuted ||
    !elements.backgroundMusic ||
    !elements.backgroundMusic.paused
  ) {
    return;
  }

  elements.backgroundMusic.volume = MUSIC_VOLUME;
  elements.backgroundMusic.play().catch(error => {
    console.error("Background music playback error:", error);
  });
}

function stopBackgroundMusic() {
  elements.backgroundMusic?.pause();
}

function enableFeedback() {
  ensureAudioContext();
  if (!state.player.musicMuted) {
    startBackgroundMusic();
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

function showHuntNotice(message, type) {
  elements.huntNotice.textContent = message;
  elements.huntNotice.className = "hunt-notice show " + type;
}

function clearHuntNotice() {
  elements.huntNotice.textContent = "";
  elements.huntNotice.className = "hunt-notice";
}

function resetDemo() {
  if (state.tabletPreviewEnabled) {
    state.tabletPreviewCount = 0;
    state.tabletPreviewFinalSuccess = false;
    resetPreviewScans();
    renderCollection();
    return;
  }

  stopBarcodeScanner();
  const groceryItems = state.player?.groceryItems || [];
  const musicMuted = Boolean(state.player?.musicMuted);
  localStorage.removeItem(STORAGE_KEY);
  state.player = createDefaultPlayer();
  state.player.groceryItems = groceryItems;
  state.player.musicMuted = musicMuted;
  applyDailyReset();
  state.scanLocked = false;
  state.pendingRewards = [];
  state.resumeScannerAfterRewards = false;
  elements.prizeOverlay.classList.add("hidden");
  elements.wrongOverlay.classList.add("hidden");
  elements.rewardOddsOverlay.classList.add("hidden");
  elements.feedbackStatus.textContent = "";
  clearStatus();
  clearHuntNotice();
  render();
  maybeOpenTutorial();
  trackEvent("progress_reset");
}
