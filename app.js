import { cleanText, normalizeCategory, daysAgo, sum, isToday, sameDate, getEntriesSince, getLastDays, averageDaily, categoryTotals, formatImpact, escapeHtml, parseJsonResponse } from './src/utils.js';

const STORAGE_KEY = "carbon_atlas_ledger_v1";
const SETTINGS_KEY = "carbon_atlas_settings_v1";
const EXTENDED_KEY = "carbon_atlas_extended_v1";

const emissionFactors = { metro: 0.02, ev: 0.05, bike: 0, car: 0.18 };
const modeLabels = { metro: "Metro", ev: "Electric vehicle", bike: "Bike/walk", car: "Gasoline car" };
const cityGrid = { Delhi: 0.82, Mumbai: 0.7, Bengaluru: 0.64, Chennai: 0.72, Kolkata: 0.86, Hyderabad: 0.68, Pune: 0.69 };
const shoppingFactors = { clothing: 0.0028, electronics: 0.0065, groceries: 0.0011, appliances: 0.0048 };
const cabinMultipliers = { economy: 1, premium: 1.6, business: 2.8, first: 4 };
const airportCoords = {
  DEL: [28.556, 77.1], Delhi: [28.6139, 77.209],
  BOM: [19.0896, 72.8656], Mumbai: [19.076, 72.8777],
  BLR: [13.1986, 77.7066], Bengaluru: [12.9716, 77.5946],
  MAA: [12.9941, 80.1709], Chennai: [13.0827, 80.2707],
  CCU: [22.6547, 88.4467], Kolkata: [22.5726, 88.3639],
  HYD: [17.24, 78.4294], Hyderabad: [17.385, 78.4867],
  PNQ: [18.5822, 73.9197], Pune: [18.5204, 73.8567],
  GOI: [15.3808, 73.8314], Goa: [15.2993, 74.124],
  DXB: [25.2532, 55.3657], Dubai: [25.2048, 55.2708],
  LHR: [51.47, -0.4543], London: [51.5072, -0.1276],
  JFK: [40.6413, -73.7781], NewYork: [40.7128, -74.006]
};
const foodDatabase = [
  { name: "Dal tadka", value: 0.7 }, { name: "Rajma chawal", value: 0.9 },
  { name: "Chole bhature", value: 1.2 }, { name: "Paneer butter masala", value: 2.4 },
  { name: "Chicken curry", value: 3.1 }, { name: "Mutton biryani", value: 5.8 },
  { name: "Vegetable biryani", value: 1.6 }, { name: "Masala dosa", value: 0.8 },
  { name: "Idli sambar", value: 0.5 }, { name: "Egg curry", value: 1.7 },
  { name: "Fish curry", value: 2.2 }, { name: "Aloo paratha", value: 1.1 },
  { name: "Poha", value: 0.4 }, { name: "Khichdi", value: 0.5 }
];
const badgeCatalog = [
  { id: "first-log", name: "First Log", desc: "Logged your first activity." },
  { id: "first-offset", name: "First Offset Purchase", desc: "Retired verified carbon." },
  { id: "neutral-day", name: "Carbon Neutral Day", desc: "Finished a day at or below 0 kg net." },
  { id: "green-streak-7", name: "7-Day Green Streak", desc: "Stayed under budget for 7 days." },
  { id: "vegan-week", name: "Plant-Forward Week", desc: "Logged 5 low-carbon meals in 7 days." },
  { id: "ai-tips", name: "AI Tip Actor", desc: "Logged an AI-suggested alternative." }
];
const demoEntries = [
  { name: "Home electricity: 9 kWh", category: "Home energy", value: 6.4, createdAt: daysAgo(0, 8, 20) },
  { name: "Metro instead of car", category: "Transport", value: -2.4, createdAt: daysAgo(0, 9, 10) },
  { name: "Vegetarian lunch", category: "Food", value: -1.6, createdAt: daysAgo(0, 13, 5) },
  { name: "Gasoline car errand", category: "Transport", value: 3.2, createdAt: daysAgo(1, 18, 40) },
  { name: "Composted food scraps", category: "Waste", value: -0.8, createdAt: daysAgo(2, 20, 0) },
  { name: "Imported apparel purchase", category: "Shopping", value: 8.7, createdAt: daysAgo(3, 16, 30) },
  { name: "Solar microgrid offset", category: "Offset", value: -4.0, createdAt: daysAgo(4, 11, 15) }
];

let state = {
  ledger: loadLedger(),
  settings: loadSettings(),
  extended: loadExtended(),
  activeMode: "metro",
  trendRange: "week",
  latestReceipt: null,
  parsedTextReceipt: null,
  toastTimer: null,
  charts: {}
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  setupAmbientCanvas();
  setupClockSignals();
  setupActivityForm();
  setupPlanner();
  setupReceiptScanner();
  setupOffsets();
  setupLedgerActions();
  setupSettings();
  setupAi();
  setupTrackers();
  setupAnalyticsControls();
  setupLiveData();
  renderFoodResults("");
  render();
  refreshLiveData();
}

function loadLedger() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadSettings() {
  const defaults = {
    dailyBudget: 12,
    geminiKey: "",
    waqiKey: "",
    weatherKey: "",
    electricityKey: "",
    liveCity: "Delhi"
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return defaults;
  }
}

function loadExtended() {
  const defaults = { badges: [], aiTipsActed: 0, live: {}, reportName: "Carbon Atlas" };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(EXTENDED_KEY) || "{}") };
  } catch {
    return defaults;
  }
}

function persistLedger() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.ledger));
}

function persistSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function persistExtended() {
  localStorage.setItem(EXTENDED_KEY, JSON.stringify(state.extended));
}

function addEntry(name, category, value, createdAt = new Date().toISOString(), meta = {}) {
  const entry = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    name: cleanText(name),
    category: normalizeCategory(category),
    value: Number(value),
    createdAt,
    meta
  };
  if (!entry.name || Number.isNaN(entry.value)) {
    showToast("Add a name and a valid carbon value.");
    return;
  }
  state.ledger.unshift(entry);
  if (meta.aiTipActed) state.extended.aiTipsActed += 1;
  persistLedger();
  updateAchievements();
  render();
  showToast(`${entry.name} logged (${formatImpact(entry.value)}).`);
  generateSmartSuggestions(entry);
}


function setupActivityForm() {
  const form = document.getElementById("activity-form");
  const nameInput = document.getElementById("activity-name");
  const categoryInput = document.getElementById("activity-category");
  const valueInput = document.getElementById("activity-value");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    addEntry(nameInput.value, categoryInput.value, valueInput.value);
    form.reset();
    categoryInput.value = "Transport";
    nameInput.focus();
  });
  document.querySelectorAll(".preset").forEach((button) => {
    button.addEventListener("click", () => addEntry(button.dataset.name, button.dataset.category, button.dataset.value));
  });
}

function setupPlanner() {
  const slider = document.getElementById("travel-distance");
  slider.addEventListener("input", renderPlanner);
  document.querySelectorAll(".mode").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeMode = button.dataset.mode;
      document.querySelectorAll(".mode").forEach((modeButton) => {
        const isActive = modeButton === button;
        modeButton.classList.toggle("active", isActive);
        modeButton.setAttribute("aria-pressed", String(isActive));
      });
      renderPlanner();
    });
  });
  document.getElementById("log-trip-btn").addEventListener("click", () => {
    const distance = Number(slider.value);
    addEntry(`${modeLabels[state.activeMode]} trip (${distance} km)`, "Transport", getTripImpact(distance, state.activeMode));
  });
}

function getTripImpact(distance, mode) {
  const selectedFactor = emissionFactors[mode];
  if (mode === "car") return Number((selectedFactor * distance).toFixed(2));
  return Number(((selectedFactor - emissionFactors.car) * distance).toFixed(2));
}

function renderPlanner() {
  const distance = Number(document.getElementById("travel-distance").value);
  const value = getTripImpact(distance, state.activeMode);
  setText("distance-pill", `${distance} km`);
  setText("planner-label", state.activeMode === "car" ? "Trip emissions" : "Saved vs car");
  setText("planner-value", Math.abs(value).toFixed(2));
}

function setupReceiptScanner() {
  const dropzone = document.getElementById("receipt-dropzone");
  const input = document.getElementById("receipt-input");
  const browse = document.getElementById("browse-files-btn");
  browse.addEventListener("click", (event) => {
    event.stopPropagation();
    input.click();
  });
  dropzone.addEventListener("click", () => input.click());
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input.click();
    }
  });
  ["dragenter", "dragover"].forEach((type) => {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((type) => dropzone.addEventListener(type, () => dropzone.classList.remove("dragover")));
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    if (event.dataTransfer.files[0]) parseReceipt(event.dataTransfer.files[0]);
  });
  input.addEventListener("change", () => {
    if (input.files[0]) parseReceipt(input.files[0]);
  });
  document.getElementById("approve-receipt-btn").addEventListener("click", () => {
    if (!state.latestReceipt) return;
    addEntry(`Receipt: ${state.latestReceipt.vendor}`, state.latestReceipt.category, state.latestReceipt.value);
    state.latestReceipt = null;
    document.getElementById("scanner-result").classList.add("hidden");
  });
}

async function parseReceipt(file) {
  const imageUrl = URL.createObjectURL(file);
  document.getElementById("receipt-image").src = imageUrl;
  document.getElementById("dropzone-empty").classList.add("hidden");
  document.getElementById("receipt-preview").classList.remove("hidden");
  setText("receipt-title", "Analyzing receipt...");
  setText("receipt-details", file.name);
  const result = state.settings.geminiKey
    ? await parseImageWithGemini(file).catch(() => estimateReceiptOffline(file.name))
    : await wait(650).then(() => estimateReceiptOffline(file.name));
  state.latestReceipt = result;
  setText("receipt-title", result.vendor);
  setText("receipt-details", `${result.category} - ${Math.round(result.confidence)}% confidence`);
  const carbon = document.getElementById("scanner-carbon");
  carbon.textContent = `${formatImpact(result.value)} CO2`;
  carbon.className = result.value >= 0 ? "impact-positive" : "impact-negative";
  document.getElementById("scanner-result").classList.remove("hidden");
}

async function parseImageWithGemini(file) {
  const base64 = await fileToBase64(file);
  const text = await callGemini([
    "Return only JSON for this receipt image with keys: vendor, category, valueKgCO2, confidence.",
    "Categories: Transport, Food, Home energy, Shopping, Waste, Offset.",
    "Estimate kg CO2e with Indian context."
  ].join(" "), [{ inlineData: { mimeType: file.type, data: base64 } }]);
  const json = parseJsonResponse(text);
  return {
    vendor: cleanText(json.vendor || "Parsed receipt"),
    category: normalizeCategory(json.category || "Shopping"),
    value: Number(json.valueKgCO2 || 0),
    confidence: Number(json.confidence || 82)
  };
}

function estimateReceiptOffline(filename) {
  const name = filename.toLowerCase();
  if (name.includes("electric") || name.includes("power") || name.includes("bill")) return { vendor: "Utility bill estimate", category: "Home energy", value: 18.6, confidence: 89 };
  if (name.includes("fuel") || name.includes("petrol") || name.includes("gas")) return { vendor: "Fuel receipt estimate", category: "Transport", value: 24.2, confidence: 86 };
  if (name.includes("metro") || name.includes("train")) return { vendor: "Transit receipt estimate", category: "Transport", value: -3.8, confidence: 84 };
  if (name.includes("food") || name.includes("grocery")) return { vendor: "Grocery receipt estimate", category: "Food", value: 4.5, confidence: 78 };
  return { vendor: "Purchase receipt estimate", category: "Shopping", value: 6.2, confidence: 72 };
}

function setupOffsets() {
  document.querySelectorAll(".offset").forEach((button) => {
    button.addEventListener("click", () => {
      addEntry(button.dataset.name, "Offset", button.dataset.value);
      showToast(`${button.dataset.name} retired. Estimated cost: INR ${button.dataset.cost}.`);
    });
  });
}

function setupLedgerActions() {
  document.getElementById("clear-ledger-btn").addEventListener("click", () => {
    state.ledger = [];
    persistLedger();
    updateAchievements();
    render();
    showToast("Ledger cleared.");
  });
  document.getElementById("seed-demo-btn").addEventListener("click", () => {
    fetch('/api/demo-entries').then((r) => r.json()).then((demo) => {
      state.ledger = demo.map((entry, index) => ({ ...entry, id: `demo-${index}-${Date.now()}` }));
      persistLedger();
      updateAchievements();
      render();
      showToast('Demo data loaded from server.');
    }).catch(() => {
      state.ledger = demoEntries.map((entry, index) => ({ ...entry, id: `demo-${index}-${Date.now()}` }));
      persistLedger();
      updateAchievements();
      render();
      showToast('Demo data loaded (offline fallback).');
    });
  });

  const genBtn = document.getElementById("generate-demo-btn");
  if (genBtn) {
    genBtn.addEventListener("click", () => {
      state.ledger = demoEntries.map((entry, index) => ({ ...entry, id: `demo-${index}-${Date.now()}` }));
      persistLedger();
      updateAchievements();
      render();
      showToast('Demo session generated.');
    });
  }
  document.getElementById("export-csv-btn").addEventListener("click", exportCsv);
}

function setupSettings() {
  const modal = document.getElementById("settings-modal");
  const fields = {
    budgetInput: document.getElementById("budget-input"),
    geminiKey: document.getElementById("gemini-api-key"),
    waqiKey: document.getElementById("waqi-api-key"),
    weatherKey: document.getElementById("weather-api-key"),
    electricityKey: document.getElementById("electricity-api-key"),
    liveCity: document.getElementById("live-city-input")
  };
  document.getElementById("open-settings-btn").addEventListener("click", () => {
    fields.budgetInput.value = state.settings.dailyBudget;
    fields.geminiKey.value = state.settings.geminiKey || "";
    fields.waqiKey.value = state.settings.waqiKey || "";
    fields.weatherKey.value = state.settings.weatherKey || "";
    fields.electricityKey.value = state.settings.electricityKey || "";
    fields.liveCity.value = state.settings.liveCity || "Delhi";
    modal.classList.remove("hidden");
    fields.budgetInput.focus();
  });
  document.getElementById("close-settings-btn").addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.classList.add("hidden");
  });
  document.getElementById("save-settings-btn").addEventListener("click", () => {
    state.settings.dailyBudget = Math.max(1, Number(fields.budgetInput.value) || 12);
    state.settings.geminiKey = fields.geminiKey.value.trim();
    state.settings.waqiKey = fields.waqiKey.value.trim();
    state.settings.weatherKey = fields.weatherKey.value.trim();
    state.settings.electricityKey = fields.electricityKey.value.trim();
    state.settings.liveCity = cleanText(fields.liveCity.value || "Delhi");
    persistSettings();
    modal.classList.add("hidden");
    render();
    refreshLiveData();
    showToast("Settings saved.");
  });
  document.getElementById("clear-key-btn").addEventListener("click", () => {
    state.settings.geminiKey = "";
    state.settings.waqiKey = "";
    state.settings.weatherKey = "";
    state.settings.electricityKey = "";
    fields.geminiKey.value = "";
    fields.waqiKey.value = "";
    fields.weatherKey.value = "";
    fields.electricityKey.value = "";
    persistSettings();
    showToast("API keys cleared. Fallback estimates enabled.");
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") modal.classList.add("hidden");
  });
}

function setupAi() {
  document.getElementById("coach-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("coach-input");
    const question = cleanText(input.value);
    if (!question) return;
    input.value = "";
    appendCoachMessage(question, "user");
    appendCoachMessage("Thinking through your ledger...", "assistant");
    const answer = state.settings.geminiKey
      ? await askGeminiCoach(question).catch(() => localCoachAdvice(question))
      : localCoachAdvice(question);
    replaceLastCoachMessage(answer);
  });
  document.getElementById("generate-insight-btn").addEventListener("click", generateWeeklyInsight);
}

async function askGeminiCoach(question) {
  const prompt = [
    "You are Carbon Atlas AI Carbon Coach. Give concise, personalized carbon reduction advice.",
    "Use this ledger context:",
    ledgerSummary(),
    `User question: ${question}`
  ].join("\n\n");
  return callGemini(prompt);
}

async function generateWeeklyInsight() {
  const target = document.getElementById("weekly-ai-summary");
  target.innerHTML = "<p class=\"muted-copy\">Generating weekly insight...</p>";
  const prompt = [
    "Create a 3-bullet markdown summary of carbon habits from this last 7 day ledger and one actionable tip.",
    ledgerSummary()
  ].join("\n\n");
  const text = state.settings.geminiKey
    ? await callGemini(prompt).catch(() => localWeeklySummary())
    : localWeeklySummary();
  target.innerHTML = markdownBullets(text);
}

function localCoachAdvice(question) {
  const categories = categoryTotals(getEntriesSince(state.ledger, 7));
  const top = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
  const topText = top ? `${top[0]} is your largest source this week at ${top[1].toFixed(1)} kg.` : "You have not logged much yet.";
  const extra = question.toLowerCase().includes("food")
    ? "Try dal, idli sambar, poha, or vegetable biryani in the food tracker."
    : "Prioritize metro trips, efficient AC settings, and checking electricity units weekly.";
  return `${topText}\n\n${extra}\n\nAim for one substitution that saves at least 2 kg CO2 this week.`;
}

function localWeeklySummary() {
  const last7 = getEntriesSince(state.ledger, 7);
  const total = sum(last7);
  const best = last7.filter((entry) => entry.value < 0).sort((a, b) => a.value - b.value)[0];
  return [
    `- Last 7 days net footprint: ${total.toFixed(1)} kg CO2.`,
    `- Top win: ${best ? `${best.name} (${formatImpact(best.value)})` : "no reduction logged yet"}.`,
    `- Tip: Replace one car trip or high-carbon meal with a low-carbon option this week.`
  ].join("\n");
}

function generateSmartSuggestions(entry) {
  const container = document.getElementById("smart-suggestions");
  const local = localSuggestions(entry);
  container.innerHTML = local.map((suggestion) => suggestionMarkup(suggestion)).join("");
  container.querySelectorAll("[data-suggestion]").forEach((button) => {
    button.addEventListener("click", () => {
      const suggestion = local[Number(button.dataset.suggestion)];
      addEntry(suggestion.name, suggestion.category, suggestion.value, new Date().toISOString(), { aiTipActed: true });
    });
  });
  if (state.settings.geminiKey) {
    geminiSuggestions(entry).then((suggestions) => {
      if (!suggestions.length) return;
      container.innerHTML = suggestions.map((suggestion, index) => suggestionMarkup(suggestion, index)).join("");
      container.querySelectorAll("[data-suggestion]").forEach((button) => {
        button.addEventListener("click", () => {
          const suggestion = suggestions[Number(button.dataset.suggestion)];
          addEntry(suggestion.name, suggestion.category, suggestion.value, new Date().toISOString(), { aiTipActed: true });
        });
      });
    }).catch(() => {});
  }
}

async function geminiSuggestions(entry) {
  const prompt = `Return JSON array of 1-2 lower-carbon alternatives for this activity. Keys: name, category, value, rationale. Activity: ${entry.name}, category ${entry.category}, impact ${entry.value} kg. Values should be negative savings or lower emission entries.`;
  const json = parseJsonResponse(await callGemini(prompt));
  return Array.isArray(json) ? json.slice(0, 2).map(normalizeSuggestion) : [];
}

function localSuggestions(entry) {
  const text = `${entry.name} ${entry.category}`.toLowerCase();
  if (text.includes("car") || text.includes("fuel")) return [
    { name: "Switch similar trip to metro", category: "Transport", value: -2.1, rationale: "Metro can save roughly 2 kg versus a short car trip." },
    { name: "Combine errands into one trip", category: "Transport", value: -1.0, rationale: "Fewer cold starts and shorter distance reduce fuel burn." }
  ];
  if (text.includes("chicken") || text.includes("mutton") || text.includes("paneer")) return [
    { name: "Dal or rajma meal swap", category: "Food", value: -1.5, rationale: "Legume meals are usually much lower impact per serving." }
  ];
  if (text.includes("electric") || text.includes("ac") || text.includes("energy")) return [
    { name: "AC set to 26 C for evening", category: "Home energy", value: -1.1, rationale: "Higher set point reduces compressor load." }
  ];
  return [
    { name: "Low-carbon alternative logged", category: entry.category, value: -0.8, rationale: "Choose a lower-impact version next time." }
  ];
}

function normalizeSuggestion(item) {
  return {
    name: cleanText(item.name || "AI suggested alternative"),
    category: normalizeCategory(item.category || "Shopping"),
    value: Number(item.value || -1),
    rationale: cleanText(item.rationale || "Lower-carbon alternative.")
  };
}

function suggestionMarkup(suggestion, index = 0) {
  return `<div class="suggestion-card"><div><strong>${escapeHtml(suggestion.name)}</strong><p>${escapeHtml(suggestion.rationale)}</p></div><button class="button secondary small" data-suggestion="${index}" type="button">Log tip</button></div>`;
}

function setupTrackers() {
  document.getElementById("food-search").addEventListener("input", (event) => renderFoodResults(event.target.value));
  document.getElementById("add-custom-food-btn").addEventListener("click", () => {
    addEntry(document.getElementById("custom-food-name").value || "Custom meal", "Food", Number(document.getElementById("custom-food-value").value || 0));
  });
  ["flight-origin", "flight-destination", "flight-cabin", "flight-passengers"].forEach((id) => document.getElementById(id).addEventListener("input", renderFlightEstimate));
  document.getElementById("log-flight-btn").addEventListener("click", () => {
    const value = calculateFlight();
    if (value <= 0) return showToast("Add a recognized origin and destination.");
    addEntry(`Flight ${document.getElementById("flight-origin").value} to ${document.getElementById("flight-destination").value}`, "Transport", value);
  });
  ["energy-kwh", "energy-city"].forEach((id) => document.getElementById(id).addEventListener("input", renderEnergyEstimate));
  document.getElementById("log-energy-btn").addEventListener("click", () => {
    const value = calculateEnergy();
    addEntry(`Electricity bill ${document.getElementById("energy-kwh").value || 0} kWh`, "Home energy", value);
  });
  ["shopping-category", "shopping-spend"].forEach((id) => document.getElementById(id).addEventListener("input", renderShoppingEstimate));
  document.getElementById("log-shopping-btn").addEventListener("click", () => {
    addEntry(`${document.getElementById("shopping-category").value} purchase`, "Shopping", calculateShopping());
  });
  document.getElementById("parse-receipt-text-btn").addEventListener("click", parseReceiptText);
  document.getElementById("log-receipt-text-btn").addEventListener("click", () => {
    if (!state.parsedTextReceipt) return;
    addEntry(state.parsedTextReceipt.name, state.parsedTextReceipt.category, state.parsedTextReceipt.value);
    state.parsedTextReceipt = null;
    document.getElementById("log-receipt-text-btn").disabled = true;
  });
  renderFlightEstimate();
  renderEnergyEstimate();
  renderShoppingEstimate();
}

function renderFoodResults(query) {
  const container = document.getElementById("food-results");
  const q = query.toLowerCase();
  const meals = foodDatabase.filter((meal) => meal.name.toLowerCase().includes(q)).slice(0, 8);
  container.innerHTML = meals.map((meal, index) => `
    <div class="food-item">
      <strong>${meal.name}</strong>
      <span>${meal.value.toFixed(1)} kg</span>
      <button class="button secondary small" data-food="${index}" type="button">Log</button>
    </div>
  `).join("") || "<p class=\"muted-copy\">No meal found. Add a custom meal below.</p>";
  container.querySelectorAll("[data-food]").forEach((button) => {
    button.addEventListener("click", () => {
      const meal = meals[Number(button.dataset.food)];
      addEntry(meal.name, "Food", meal.value);
    });
  });
}

function calculateFlight() {
  const origin = findCoord(document.getElementById("flight-origin").value);
  const destination = findCoord(document.getElementById("flight-destination").value);
  if (!origin || !destination) return 0;
  const km = haversine(origin, destination);
  const cabin = cabinMultipliers[document.getElementById("flight-cabin").value] || 1;
  const passengers = Math.max(1, Number(document.getElementById("flight-passengers").value) || 1);
  return Number((km * 0.115 * 1.9 * cabin * passengers).toFixed(1));
}

function renderFlightEstimate() {
  setText("flight-result", calculateFlight().toFixed(1));
}

function findCoord(value) {
  const key = cleanText(value);
  const exact = airportCoords[key] || airportCoords[key.toUpperCase()];
  if (exact) return exact;
  const match = Object.keys(airportCoords).find((name) => name.toLowerCase() === key.toLowerCase());
  return match ? airportCoords[match] : null;
}

function haversine(a, b) {
  const toRad = (deg) => deg * Math.PI / 180;
  const earth = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}

function calculateEnergy() {
  const kwh = Number(document.getElementById("energy-kwh").value) || 0;
  const city = document.getElementById("energy-city").value;
  return Number((kwh * (cityGrid[city] || 0.74)).toFixed(1));
}

function renderEnergyEstimate() {
  setText("energy-result", calculateEnergy().toFixed(1));
}

function calculateShopping() {
  const category = document.getElementById("shopping-category").value;
  const spend = Number(document.getElementById("shopping-spend").value) || 0;
  return Number((spend * (shoppingFactors[category] || 0.002)).toFixed(1));
}

function renderShoppingEstimate() {
  setText("shopping-spend-label", document.getElementById("shopping-spend").value);
  setText("shopping-result", calculateShopping().toFixed(1));
}

async function parseReceiptText() {
  const text = document.getElementById("receipt-text-input").value.trim();
  if (!text) return showToast("Paste receipt text first.");
  setText("receipt-text-status", "Parsing receipt text...");
  const result = state.settings.geminiKey
    ? await parseReceiptTextWithGemini(text).catch(() => parseReceiptTextOffline(text))
    : parseReceiptTextOffline(text);
  state.parsedTextReceipt = result;
  setText("receipt-text-status", `${result.category} estimate ready`);
  setText("receipt-text-result", `${result.name}: ${formatImpact(result.value)} CO2`);
  document.getElementById("log-receipt-text-btn").disabled = false;
}

async function parseReceiptTextWithGemini(text) {
  const prompt = `Parse this receipt text and return JSON only with name, category, valueKgCO2. Categories: Transport, Food, Home energy, Shopping, Waste, Offset. Receipt:\n${text}`;
  const json = parseJsonResponse(await callGemini(prompt));
  return { name: cleanText(json.name || "Parsed receipt text"), category: normalizeCategory(json.category || "Shopping"), value: Number(json.valueKgCO2 || 0) };
}

function parseReceiptTextOffline(text) {
  const lower = text.toLowerCase();
  const amountMatch = lower.match(/(?:inr|rs|total|amount)\s*[: -]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  const spend = amountMatch ? Number(amountMatch[1]) : 1000;
  if (lower.includes("kwh") || lower.includes("electricity")) return { name: "Parsed electricity receipt", category: "Home energy", value: Number((spend / 8 * 0.74).toFixed(1)) };
  if (lower.includes("fuel") || lower.includes("petrol") || lower.includes("diesel")) return { name: "Parsed fuel receipt", category: "Transport", value: Number((spend / 105 * 2.3).toFixed(1)) };
  if (lower.includes("paneer") || lower.includes("chicken") || lower.includes("meal") || lower.includes("restaurant")) return { name: "Parsed food receipt", category: "Food", value: Number((spend * 0.0016).toFixed(1)) };
  return { name: "Parsed shopping receipt", category: "Shopping", value: Number((spend * 0.0024).toFixed(1)) };
}

function setupAnalyticsControls() {
  document.querySelectorAll(".tab-switch button").forEach((button) => {
    button.addEventListener("click", () => {
      state.trendRange = button.dataset.range;
      document.querySelectorAll(".tab-switch button").forEach((tab) => tab.classList.toggle("active", tab === button));
      renderCharts();
    });
  });
  document.getElementById("share-report-btn").addEventListener("click", shareReportCard);
}

function setupLiveData() {
  document.getElementById("refresh-live-btn").addEventListener("click", refreshLiveData);
}

// check local backend status and show in UI
fetch('/api/ping').then((r) => r.json()).then((data) => {
  const badge = document.querySelector('.sync-badge');
  if (badge) {
    badge.innerHTML = `<span></span> Server: ${data.status}`;
  }
}).catch(() => {
  const badge = document.querySelector('.sync-badge');
  if (badge) badge.innerHTML = `<span style="background:var(--amber)"></span> Server: offline`;
});

async function refreshLiveData() {
  await Promise.allSettled([fetchAqi(), fetchWeather(), fetchGridIntensity()]);
  updateOffsetPrice();
}

async function fetchAqi() {
  if (!state.settings.waqiKey) {
    setText("live-aqi-station", "Connect WAQI key");
    setText("live-aqi-time", "Using simulated AQI on dashboard");
    return;
  }
  const city = encodeURIComponent(state.settings.liveCity || "Delhi");
  const response = await fetch(`https://api.waqi.info/feed/${city}/?token=${state.settings.waqiKey}`);
  const data = await response.json();
  if (data.status !== "ok") throw new Error("WAQI failed");
  setText("aqi-score", data.data.aqi);
  setText("live-aqi-station", data.data.city?.name || "WAQI station");
  setText("live-aqi-time", data.data.time?.s || "Live AQI updated");
}

async function fetchWeather() {
  if (!state.settings.weatherKey) {
    setText("live-weather", "Connect OpenWeather key");
    setText("weather-tip", "Weather suggestions unavailable");
    return;
  }
  const city = encodeURIComponent(state.settings.liveCity || "Delhi");
  const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city},IN&units=metric&appid=${state.settings.weatherKey}`);
  const data = await response.json();
  const temp = Number(data.main?.temp || 0);
  const raining = data.weather?.some((item) => /rain/i.test(item.main));
  setText("live-weather", `${temp.toFixed(1)} C`);
  setText("weather-tip", raining ? "Rainy: consider metro instead of car." : temp > 35 ? "Hot: set AC near 26 C to cut load." : "Mild: active transit may be comfortable.");
}

async function fetchGridIntensity() {
  const city = state.settings.liveCity || "Delhi";
  const fallback = cityGrid[city] || cityGrid.Delhi;
  if (!state.settings.electricityKey) {
    setText("grid-intensity", fallback.toFixed(2));
    setText("live-grid-carbon", `${Math.round(fallback * 1000)} gCO2/kWh`);
    setText("live-grid-note", "Static Indian city fallback");
    return;
  }
  try {
    const response = await fetch("https://api.electricitymap.org/v3/carbon-intensity/latest?zone=IN-NO", {
      headers: { "auth-token": state.settings.electricityKey }
    });
    const data = await response.json();
    const kg = Number(data.carbonIntensity || fallback * 1000) / 1000;
    setText("grid-intensity", kg.toFixed(2));
    setText("live-grid-carbon", `${Math.round(kg * 1000)} gCO2/kWh`);
    setText("live-grid-note", data.updatedAt ? `Updated ${new Date(data.updatedAt).toLocaleString()}` : "Electricity Maps live");
  } catch {
    setText("live-grid-carbon", `${Math.round(fallback * 1000)} gCO2/kWh`);
    setText("live-grid-note", "Live grid unavailable, using fallback");
  }
}

function updateOffsetPrice() {
  const price = 650 + Math.round((Math.sin(Date.now() / 600000) + 1) * 80);
  setText("live-offset-price", `INR ${price}/t`);
}

async function callGemini(prompt, extraParts = []) {
  if (!state.settings.geminiKey) throw new Error("No Gemini key");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${state.settings.geminiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, ...extraParts] }] })
  });
  if (!response.ok) throw new Error("Gemini request failed");
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

function appendCoachMessage(text, role) {
  const log = document.getElementById("coach-log");
  const div = document.createElement("div");
  div.className = `coach-message ${role}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function replaceLastCoachMessage(text) {
  const messages = document.querySelectorAll(".coach-message");
  messages[messages.length - 1].textContent = text;
}

function markdownBullets(text) {
  return `<div class="suggestion-card"><div>${escapeHtml(text).replace(/\n/g, "<br>")}</div></div>`;
}

function exportCsv() {
  const rows = [["time", "activity", "category", "kg_co2"], ...state.ledger.map((entry) => [new Date(entry.createdAt).toLocaleString(), entry.name, entry.category, entry.value.toFixed(2)])];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `carbon-atlas-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV exported.");
}

function render() {
  renderSummary();
  renderPlanner();
  renderLedger();
  renderBarChart();
  renderGamification();
  renderCharts();
  renderHeatmap();
  renderBenchmarks();
}

function renderSummary() {
  const todayEntries = state.ledger.filter((entry) => isToday(entry.createdAt));
  const total = sum(todayEntries);
  const reductions = todayEntries.filter((entry) => entry.value < 0).reduce((acc, entry) => acc + Math.abs(entry.value), 0);
  const budget = state.settings.dailyBudget;
  setText("today-total", total.toFixed(1));
  setText("metric-net", total.toFixed(1));
  setText("metric-reductions", reductions.toFixed(1));
  setText("today-saved", reductions.toFixed(1));
  setText("entry-count", todayEntries.length);
  setText("budget-limit-label", budget.toFixed(1));
  setText("budget-status", total <= budget ? "On track" : "Over budget");
  document.getElementById("budget-status").style.color = total <= budget ? "var(--green)" : "var(--red)";
  document.getElementById("hero-meter-fill").style.width = `${Math.max(0, Math.min(1, total / budget)) * 100}%`;
  setText("streak-count", calculateStreak());
  setText("carbon-score", calculateScore());
}

function renderLedger() {
  const body = document.getElementById("ledger-body");
  const empty = document.getElementById("empty-ledger");
  body.innerHTML = "";
  empty.classList.toggle("hidden", state.ledger.length > 0);
  state.ledger.forEach((entry) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${formatDate(entry.createdAt)}</td>
      <td>${escapeHtml(entry.name)}</td>
      <td><span class="tag">${escapeHtml(entry.category)}</span></td>
      <td class="${entry.value >= 0 ? "impact-positive" : "impact-negative"}">${formatImpact(entry.value)}</td>
    `;
    body.appendChild(row);
  });
}

function renderBarChart() {
  const chart = document.getElementById("week-chart");
  const days = getLastDays(7);
  chart.innerHTML = "";
  days.forEach((day) => {
    const value = sum(state.ledger.filter((entry) => sameDate(new Date(entry.createdAt), day.date)));
    const height = Math.max(3, Math.min(100, Math.abs(value) / state.settings.dailyBudget * 100));
    const item = document.createElement("div");
    item.className = "bar";
    item.innerHTML = `<div class="bar-fill-wrap" title="${formatImpact(value)}"><div class="bar-fill ${value > state.settings.dailyBudget ? "over" : ""}" style="height:${height}%"></div></div><label>${day.label}</label>`;
    chart.appendChild(item);
  });
}

function renderGamification() {
  updateAchievements();
  const score = calculateScore();
  setText("score-ring-label", score);
  setText("report-title", `${score}/100 weekly carbon score`);
  setText("report-summary", `Top win: ${topWin()}. Streak: ${calculateStreak()} days under budget.`);
  setText("report-meta", `${state.extended.badges.length} badges earned`);
  const badgeList = document.getElementById("badge-list");
  badgeList.innerHTML = badgeCatalog.map((badge) => {
    const earned = state.extended.badges.includes(badge.id);
    return `<div class="badge ${earned ? "" : "locked"}"><strong>${earned ? "Earned" : "Locked"}: ${badge.name}</strong><span>${badge.desc}</span></div>`;
  }).join("");
  renderScoreChart(score);
}

function calculateStreak() {
  let streak = 0;
  for (let i = 0; i < 90; i++) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const total = sum(state.ledger.filter((entry) => sameDate(new Date(entry.createdAt), day)));
    const hasEntries = state.ledger.some((entry) => sameDate(new Date(entry.createdAt), day));
    if (total <= state.settings.dailyBudget && (hasEntries || i === 0)) streak += 1;
    else break;
  }
  return streak;
}

function updateAchievements() {
  const badges = new Set(state.extended.badges);
  if (state.ledger.length) badges.add("first-log");
  if (state.ledger.some((entry) => entry.category === "Offset")) badges.add("first-offset");
  if (getLastDays(30).some((day) => sum(state.ledger.filter((entry) => sameDate(new Date(entry.createdAt), day.date))) <= 0 && state.ledger.some((entry) => sameDate(new Date(entry.createdAt), day.date)))) badges.add("neutral-day");
  if (calculateStreak() >= 7) badges.add("green-streak-7");
  if (getEntriesSince(state.ledger, 7).filter((entry) => entry.category === "Food" && entry.value <= 1.6).length >= 5) badges.add("vegan-week");
  if (state.extended.aiTipsActed > 0) badges.add("ai-tips");
  state.extended.badges = [...badges];
  persistExtended();
}

function calculateScore() {
  const days = getLastDays(7);
  const under = days.filter((day) => sum(state.ledger.filter((entry) => sameDate(new Date(entry.createdAt), day.date))) <= state.settings.dailyBudget).length;
  const diversity = new Set(getEntriesSince(state.ledger, 7).map((entry) => entry.category)).size;
  const offsets = getEntriesSince(state.ledger, 7).filter((entry) => entry.category === "Offset").length;
  const score = under * 8 + Math.min(diversity, 6) * 5 + Math.min(offsets, 3) * 6 + Math.min(state.extended.aiTipsActed, 3) * 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function renderScoreChart(score) {
  if (!window.Chart) return;
  const ctx = document.getElementById("score-chart");
  if (state.charts.score) state.charts.score.destroy();
  state.charts.score = new Chart(ctx, {
    type: "doughnut",
    data: { datasets: [{ data: [score, 100 - score], backgroundColor: ["#7dd87d", "rgba(255,255,255,0.08)"], borderWidth: 0 }] },
    options: { cutout: "78%", plugins: { legend: { display: false }, tooltip: { enabled: false } } }
  });
}

function renderCharts() {
  if (!window.Chart) return;
  renderCategoryChart();
  renderTrendChart();
}

function renderCategoryChart() {
  const totals = categoryTotals(getEntriesSince(state.ledger, 30));
  const labels = Object.keys(totals);
  const data = Object.values(totals).map((value) => Math.max(0, value));
  const ctx = document.getElementById("category-chart");
  if (state.charts.category) state.charts.category.destroy();
  state.charts.category = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data: data.length ? data : [1], backgroundColor: ["#7dd87d", "#78dce8", "#f6c768", "#ff736a", "#9fb7ff", "#d8a7ff"], borderWidth: 0 }] },
    options: { plugins: { legend: { labels: { color: "#f4f7ef" } } } }
  });
}

function renderTrendChart() {
  const count = state.trendRange === "month" ? 30 : 7;
  const days = getLastDays(count);
  const values = days.map((day) => sum(state.ledger.filter((entry) => sameDate(new Date(entry.createdAt), day.date))));
  const ctx = document.getElementById("trend-chart");
  if (state.charts.trend) state.charts.trend.destroy();
  state.charts.trend = new Chart(ctx, {
    type: "line",
    data: { labels: days.map((day) => day.short), datasets: [{ label: "kg CO2", data: values, borderColor: "#7dd87d", backgroundColor: "rgba(125,216,125,0.16)", fill: true, tension: 0.35 }] },
    options: {
      scales: { x: { ticks: { color: "#aeb9ad", maxTicksLimit: 8 }, grid: { color: "rgba(255,255,255,0.06)" } }, y: { ticks: { color: "#aeb9ad" }, grid: { color: "rgba(255,255,255,0.06)" } } },
      plugins: { legend: { labels: { color: "#f4f7ef" } } }
    }
  });
}

function renderHeatmap() {
  const heatmap = document.getElementById("budget-heatmap");
  heatmap.innerHTML = "";
  getLastDays(90).forEach((day) => {
    const value = sum(state.ledger.filter((entry) => sameDate(new Date(entry.createdAt), day.date)));
    const ratio = value / state.settings.dailyBudget;
    const cell = document.createElement("span");
    cell.className = `heat-cell ${ratio > 1 ? "high" : ratio > 0.75 ? "mid" : value > 0 ? "low" : ""}`;
    cell.title = `${day.short}: ${formatImpact(value)}`;
    heatmap.appendChild(cell);
  });
}

function renderBenchmarks() {
  const mine = averageDaily(30);
  const rows = [
    ["You", mine],
    ["India avg", 7],
    ["Global avg", 12]
  ];
  const max = Math.max(12, mine);
  document.getElementById("benchmark-bars").innerHTML = rows.map(([label, value]) => `
    <div class="benchmark-row">
      <span>${label}</span>
      <div class="benchmark-track"><div class="benchmark-fill" style="width:${Math.min(100, value / max * 100)}%"></div></div>
      <strong>${value.toFixed(1)} kg</strong>
    </div>
  `).join("");
}

function shareReportCard() {
  const text = `Carbon Atlas report: ${calculateScore()}/100 score, ${calculateStreak()} day streak, ${state.extended.badges.length} badges. Top win: ${topWin()}.`;
  navigator.clipboard?.writeText(text).then(() => showToast("Report copied for sharing.")).catch(() => showToast(text));
}

function topWin() {
  const win = state.ledger.filter((entry) => entry.value < 0).sort((a, b) => a.value - b.value)[0];
  return win ? `${win.name} (${formatImpact(win.value)})` : "no reduction logged yet";
}

function ledgerSummary() {
  const last7 = getEntriesSince(state.ledger, 7);
  const categories = categoryTotals(last7);
  return JSON.stringify({
    dailyBudget: state.settings.dailyBudget,
    last7DaysKg: sum(last7),
    categoryTotals: categories,
    streak: calculateStreak(),
    score: calculateScore(),
    recentEntries: last7.slice(0, 12).map((entry) => ({ name: entry.name, category: entry.category, kg: entry.value }))
  });
}

function setupClockSignals() {
  const update = () => {
    if (state.settings.waqiKey) return;
    const hour = new Date().getHours();
    const baseAqi = hour >= 17 || hour <= 8 ? 168 : 126;
    const aqi = baseAqi + Math.round(Math.sin(Date.now() / 120000) * 18);
    const grid = cityGrid[state.settings.liveCity] || cityGrid.Delhi;
    setText("aqi-score", aqi);
    setText("grid-intensity", grid.toFixed(2));
  };
  update();
  setInterval(update, 6000);
}

function setupAmbientCanvas() {
  const canvas = document.getElementById("ambient-canvas");
  const ctx = canvas.getContext("2d");
  const particles = Array.from({ length: 48 }, () => createParticle());
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function resize() {
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      if (particle.y < -20) particle.y = window.innerHeight + 20;
      if (particle.x > window.innerWidth + 20) particle.x = -20;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fillStyle = particle.color;
      ctx.fill();
    });
    if (!reducedMotion) requestAnimationFrame(draw);
  }
  window.addEventListener("resize", resize);
  resize();
  draw();
}

function createParticle() {
  const hue = 120 + Math.random() * 60;
  return { x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight, radius: 1 + Math.random() * 3, vx: 0.04 + Math.random() * 0.12, vy: -0.05 - Math.random() * 0.14, color: `hsla(${hue}, 58%, 70%, ${0.08 + Math.random() * 0.16})` };
}

function formatDate(isoDate) {
  return new Date(isoDate).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}


function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.add("hidden"), 2800);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
