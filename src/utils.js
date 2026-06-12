export function cleanText(value) {
  return String(value || "").trim().slice(0, 120);
}

export function normalizeCategory(category) {
  const map = { Energy: "Home energy", "Food & Diet": "Food", Transit: "Transport" };
  return map[category] || cleanText(category || "Shopping");
}

export function daysAgo(days, hour, minute) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

export function sum(entries) {
  return Number(entries.reduce((acc, entry) => acc + Number(entry.value || 0), 0).toFixed(2));
}

export function sameDate(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isToday(isoDate) {
  return sameDate(new Date(isoDate), new Date());
}

export function getEntriesSince(ledger, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return ledger.filter((entry) => new Date(entry.createdAt) >= cutoff);
}

export function getLastDays(count) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (count - 1 - index));
    date.setHours(0, 0, 0, 0);
    return {
      date,
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      short: date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    };
  });
}

export function averageDaily(ledger, days) {
  const list = getLastDays(days);
  return Number((list.reduce((acc, day) => acc + sum(ledger.filter((entry) => sameDate(new Date(entry.createdAt), day.date))), 0) / days).toFixed(1));
}

export function categoryTotals(entries) {
  return entries.reduce((acc, entry) => {
    if (entry.value > 0) acc[entry.category] = (acc[entry.category] || 0) + entry.value;
    return acc;
  }, {});
}

export function formatImpact(value) {
  const number = Number(value);
  return `${number >= 0 ? "+" : ""}${number.toFixed(1)} kg`;
}

export function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

export function parseJsonResponse(text) {
  try {
    return JSON.parse(String(text).replace(/```json|```/g, "").trim());
  } catch (error) {
    throw new Error("Failed to parse JSON response");
  }
}
