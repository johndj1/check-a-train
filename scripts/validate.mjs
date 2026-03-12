import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

function hhmmToMins(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function toHHMM(v) {
  if (typeof v !== "string") return null;
  const text = v.trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(text) ?? /T(\d{1,2}):(\d{2})/.exec(text);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function getTodayISO(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function chooseSource({ date, now = new Date() }) {
  const todayISO = getTodayISO(now);
  return date === todayISO ? "live" : "timetable";
}

function parseISODate(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

function hspDayType(dateStr) {
  const d = parseISODate(dateStr);
  if (!d) return "WEEKDAY";
  const day = d.getDay();
  if (day === 6) return "SATURDAY";
  if (day === 0) return "SUNDAY";
  return "WEEKDAY";
}

const SAME_DAY_HSP_BUFFER_MINS = 45;

function historicalSelectionReason(dateStr, timeStr, now = new Date()) {
  const queryDate = parseISODate(dateStr);
  const queryTimeMins = hhmmToMins(timeStr);
  if (!queryDate || queryTimeMins == null) {
    return {
      useHistoricalHsp: false,
      reason: "invalid_query_time_or_date",
    };
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (queryDate.getTime() < today.getTime()) {
    return {
      useHistoricalHsp: true,
      reason: "date_before_today",
    };
  }
  if (queryDate.getTime() > today.getTime()) {
    return {
      useHistoricalHsp: false,
      reason: "date_after_today",
    };
  }

  const nowTimeMins = now.getHours() * 60 + now.getMinutes();
  if (queryTimeMins <= nowTimeMins - SAME_DAY_HSP_BUFFER_MINS) {
    return {
      useHistoricalHsp: true,
      reason: "same_day_time_outside_live_buffer",
    };
  }

  return {
    useHistoricalHsp: false,
    reason: "same_day_time_within_live_buffer",
  };
}

function minsToCompactHHMM(totalMins) {
  const clamped = Math.min(Math.max(Math.floor(totalMins), 0), 1439);
  const hh = String(Math.floor(clamped / 60)).padStart(2, "0");
  const mm = String(clamped % 60).padStart(2, "0");
  return `${hh}${mm}`;
}

function hhmmWindowToCompactBounds(hhmm, windowMins) {
  const mins = hhmmToMins(hhmm);
  if (mins == null) return null;
  return {
    from: minsToCompactHHMM(mins - windowMins),
    to: minsToCompactHHMM(mins + windowMins),
  };
}

function buildJourneysEndpoint({ from, to, date, time, now = new Date() }) {
  const selectedSource = chooseSource({ date, now });
  const base =
    selectedSource === "live"
      ? `https://transportapi.com/v3/uk/train/station/${encodeURIComponent(from)}/live.json`
      : `https://transportapi.com/v3/uk/train/station/${encodeURIComponent(from)}/${encodeURIComponent(
          date
        )}/${encodeURIComponent(time)}/timetable.json`;
  const params = new URLSearchParams();
  if (selectedSource === "timetable") {
    params.set("destination", to);
  }
  return { selectedSource, url: `${base}?${params.toString()}` };
}

function normalizeQuery(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function scoreStationQuery(query, station) {
  const name = station.name.toLowerCase();
  const code = station.crs.toLowerCase();
  const aliases = (station.aliases ?? []).map((a) => a.toLowerCase());
  const aliasPrefix = aliases.some((a) => a.startsWith(query));
  const aliasContains = aliases.some((a) => a.includes(query));
  const aliasExact = aliases.some((a) => a === query);

  if (code === query) return 100;
  if (name === query || aliasExact) return 95;
  if (code.startsWith(query)) return 90;
  if (name.startsWith(query)) return 80;
  if (aliasPrefix) return 75;
  if (name.includes(query)) return 60;
  if (aliasContains) return 55;
  if (code.includes(query)) return 50;
  return 0;
}

function searchLocalStations(stations, rawQuery, limit = 15) {
  const query = normalizeQuery(rawQuery);
  if (query.length < 2) return [];
  return stations
    .map((station) => ({ station, score: scoreStationQuery(query, station) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.station.name.localeCompare(b.station.name);
    })
    .slice(0, limit)
    .map((entry) => entry.station);
}

function isWithinWindow(targetHHMM, centerHHMM, windowMins) {
  const target = hhmmToMins(targetHHMM);
  const center = hhmmToMins(centerHHMM);
  if (target == null || center == null) return false;
  let delta = target - center;
  if (delta < -720) delta += 1440;
  if (delta > 720) delta -= 1440;
  return Math.abs(delta) <= windowMins;
}

function absDeltaMins(targetHHMM, centerHHMM) {
  const target = hhmmToMins(targetHHMM);
  const center = hhmmToMins(centerHHMM);
  if (target == null || center == null) return Number.POSITIVE_INFINITY;
  let delta = target - center;
  if (delta < -720) delta += 1440;
  if (delta > 720) delta -= 1440;
  return Math.abs(delta);
}

function diffMins(aimed, expected) {
  const a = hhmmToMins(aimed);
  const e = hhmmToMins(expected);
  if (a == null || e == null) return null;
  let d = e - a;
  if (d < -720) d += 1440;
  if (d > 720) d -= 1440;
  return d;
}

function parseAttrs(text) {
  const attrs = {};
  for (const m of text.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

function pickTag(block, tags) {
  for (const tag of tags) {
    const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block);
    if (m && typeof m[1] === "string" && m[1].trim()) {
      return m[1].trim();
    }
  }
  return null;
}

function isCancelledStatus(v) {
  const text = String(v ?? "").toUpperCase();
  return text.includes("CANCEL") || text.includes("CANC") || text.includes("CANC/NR");
}

function normalizeExpected(raw, aimed) {
  if (!raw) return null;
  if (/^on\s*time$/i.test(raw)) return aimed;
  if (isCancelledStatus(raw)) return null;
  return toHHMM(raw);
}

function deriveStatus(rawStatus, delayMins) {
  if (isCancelledStatus(rawStatus)) return "Cancelled";
  if (delayMins === 0) return "On time";
  if (typeof delayMins === "number" && delayMins > 0) return "Delayed";
  return "Unknown";
}

function deriveDelayAndStatus({ cancelled, aimedArr, expectedArr, aimedDep, expectedDep }) {
  if (cancelled) {
    return { delayMins: null, status: "Cancelled" };
  }
  if (aimedArr && expectedArr) {
    const arrivalDelay = diffMins(aimedArr, expectedArr);
    if (arrivalDelay !== null) {
      return {
        delayMins: arrivalDelay,
        status: arrivalDelay > 0 ? "Delayed" : "On time",
      };
    }
  }
  if (aimedDep && expectedDep) {
    const departureDelay = diffMins(aimedDep, expectedDep);
    if (departureDelay !== null) {
      return {
        delayMins: departureDelay,
        status: departureDelay > 0 ? "Delayed" : "On time",
      };
    }
  }
  return { delayMins: null, status: "Unknown" };
}

function parseDarwinFixtureServices() {
  const departuresXml = readFileSync("fixtures/darwin/departures.xml", "utf8");
  const detailsXml = readFileSync("fixtures/darwin/service-details.xml", "utf8");
  const detailsByRid = new Map();

  for (const m of detailsXml.matchAll(/<service\b([^>]*)>([\s\S]*?)<\/service>/gi)) {
    const attrs = parseAttrs(m[1] ?? "");
    const block = m[2] ?? "";
    const rid = attrs.rid ?? pickTag(block, ["rid"]);
    if (!rid) continue;
    detailsByRid.set(rid, {
      sta: toHHMM(pickTag(block, ["sta"])),
      eta: pickTag(block, ["eta"]),
      isCancelled: pickTag(block, ["isCancelled"]) === "true",
      cancelReason: pickTag(block, ["cancelReasonCode", "cancelReason"]),
    });
  }

  const services = [];
  for (const m of departuresXml.matchAll(/<service\b([^>]*)>([\s\S]*?)<\/service>/gi)) {
    const attrs = parseAttrs(m[1] ?? "");
    const block = m[2] ?? "";
    const rid = attrs.rid ?? pickTag(block, ["rid"]);
    const details = rid ? detailsByRid.get(rid) : null;

    const aimedDeparture = toHHMM(pickTag(block, ["std"]));
    const rawEtd = pickTag(block, ["etd"]);
    const expectedDeparture =
      normalizeExpected(rawEtd, aimedDeparture) ??
      normalizeExpected(details?.eta ?? null, details?.sta ?? null);
    const delayMins =
      aimedDeparture && expectedDeparture
        ? diffMins(aimedDeparture, expectedDeparture)
        : details?.sta && details?.eta
          ? diffMins(details.sta, toHHMM(details.eta))
          : null;
    const rawStatus = [rawEtd, details?.cancelReason ?? null, details?.isCancelled ? "CANC" : null]
      .filter(Boolean)
      .join(" ");

    services.push({
      uid: attrs.uid,
      aimed: aimedDeparture,
      expected: expectedDeparture,
      delayMins,
      status: deriveStatus(rawStatus, delayMins),
    });
  }

  return services;
}

function selectFilterTime(service) {
  return toHHMM(service.expected) ?? toHHMM(service.aimed);
}

function filterDestForStationLive(services, to, filterDest, hasCallingPointData) {
  if (!filterDest || !hasCallingPointData) return services;
  return services.filter((service) => {
    const destinationName = typeof service.destinationName === "string" ? service.destinationName : "";
    return destinationName.toUpperCase().includes(to.toUpperCase());
  });
}

function filterAndSortTimes(services, requested, windowMins) {
  const requestedHHMM = toHHMM(requested);
  if (!requestedHHMM) return [];
  return services
    .map((service) => ({ ...service, filterTime: selectFilterTime(service) }))
    .filter((service) => service.filterTime && isWithinWindow(service.filterTime, requested, windowMins))
    .sort((a, b) => {
      // Product rule: sort by closeness to requested time, tie-break by earlier clock time.
      const da = absDeltaMins(a.filterTime, requestedHHMM);
      const db = absDeltaMins(b.filterTime, requestedHHMM);
      if (da !== db) return da - db;
      return hhmmToMins(a.filterTime) - hhmmToMins(b.filterTime);
    })
    .map((service) => service.filterTime);
}

function assertTimeWindowRegression() {
  const requested = "08:36";
  const windowMins = 30;
  const services = [
    { aimed: "08:10", expected: null },
    { aimed: "08:20", expected: null },
    { aimed: "08:50", expected: null },
    { aimed: "9:04", expected: null },
    { aimed: "09:05", expected: null },
    { aimed: "17:37", expected: null },
    { aimed: "17:37", expected: "08:40" },
  ];

  if (toHHMM("9:04") !== "09:04") {
    throw new Error("HH:MM normalization regression: expected 9:04 to normalize to 09:04.");
  }

  const filterDestFixture = [
    { uid: "A", destinationName: "Cannon Street" },
    { uid: "B", destinationName: "Dartford" },
  ];
  const afterFilterDest = filterDestForStationLive(filterDestFixture, "LBG", true, false);
  if (afterFilterDest.length !== filterDestFixture.length) {
    throw new Error("filterDest regression: station_live should not filter destination without calling-point data.");
  }

  const filtered = filterAndSortTimes(services, requested, windowMins);
  const expected = ["08:40", "08:50", "08:20", "08:10", "09:04", "09:05"];
  if (JSON.stringify(filtered) !== JSON.stringify(expected)) {
    throw new Error(
      `Time-window filter check failed. expected=${JSON.stringify(expected)} actual=${JSON.stringify(filtered)}`
    );
  }

  if (filtered.includes("17:37")) {
    throw new Error("Time-window filter regression: out-of-window service 17:37 was incorrectly included.");
  }

  if (!filtered.includes("08:40")) {
    throw new Error("Expected-over-aimed regression: expected time 08:40 was not used for filtering/sorting.");
  }
}

function assertChooseSourceRegression() {
  const fixedNow = new Date(2026, 2, 4, 10, 0, 0);
  const nonToday = chooseSource({ date: "2026-03-02", now: fixedNow });
  if (nonToday !== "timetable") {
    throw new Error(`chooseSource regression: non-today date must use timetable. actual=${nonToday}`);
  }

  const today = chooseSource({ date: "2026-03-04", now: fixedNow });
  if (today !== "live") {
    throw new Error(`chooseSource regression: today must use live. actual=${today}`);
  }
}

function assertJourneysUrlBuilderRegression() {
  const fixedNow = new Date(2026, 2, 4, 10, 0, 0);
  const timetable = buildJourneysEndpoint({
    from: "SEV",
    to: "LBG",
    date: "2026-03-02",
    time: "09:04",
    now: fixedNow,
  });
  if (!timetable.url.includes("/2026-03-02/09%3A04/timetable.json")) {
    throw new Error(`URL builder regression: non-today must use timetable path. url=${timetable.url}`);
  }
  if (!timetable.url.includes("destination=LBG")) {
    throw new Error(`URL builder regression: timetable URL must include destination. url=${timetable.url}`);
  }

  const live = buildJourneysEndpoint({
    from: "SEV",
    to: "LBG",
    date: "2026-03-04",
    time: "09:04",
    now: fixedNow,
  });
  if (!live.url.includes("/live.json")) {
    throw new Error(`URL builder regression: today must use live path. url=${live.url}`);
  }
  if (live.url.includes("destination=")) {
    throw new Error(`URL builder regression: live URL should not include destination. url=${live.url}`);
  }
}

function assertStationsLocalSearchRegression() {
  const stations = [
    { crs: "SEV", name: "Sevenoaks" },
    { crs: "LBG", name: "London Bridge", aliases: ["London Br"] },
    { crs: "CHX", name: "London Charing Cross" },
  ];

  const sevResults = searchLocalStations(stations, "sev");
  if (!sevResults.some((station) => station.crs === "SEV")) {
    throw new Error("stations search regression: query 'sev' must return Sevenoaks (SEV).");
  }

  const londonBrResults = searchLocalStations(stations, "london br");
  if (!londonBrResults.some((station) => station.crs === "LBG")) {
    throw new Error("stations search regression: query 'london br' must return London Bridge (LBG).");
  }

  const londonBridgeResults = searchLocalStations(stations, "London Bridge");
  if (!londonBridgeResults.some((station) => station.crs === "LBG")) {
    throw new Error("stations search regression: query 'London Bridge' must return London Bridge (LBG).");
  }

  const lbgResults = searchLocalStations(stations, "lbg");
  if (!lbgResults.some((station) => station.crs === "LBG")) {
    throw new Error("stations search regression: query 'lbg' must return London Bridge (LBG).");
  }
}

function assertDelayCalculationRegression() {
  if (diffMins("08:36", "08:40") !== 4) {
    throw new Error("Delay regression: expected 08:36->08:40 to equal +4 minutes.");
  }
  if (diffMins("23:58", "00:03") !== 5) {
    throw new Error("Delay regression: expected midnight wrap 23:58->00:03 to equal +5 minutes.");
  }
  if (diffMins("09:10", "09:10") !== 0) {
    throw new Error("Delay regression: expected identical times to equal 0 minutes.");
  }
}

function assertDelayAndStatusDerivationRegression() {
  const caseA = deriveDelayAndStatus({
    cancelled: false,
    aimedArr: "09:00",
    expectedArr: "09:12",
    aimedDep: "08:30",
    expectedDep: "08:35",
  });
  if (caseA.delayMins !== 12 || caseA.status !== "Delayed") {
    throw new Error(`Derivation regression case A failed: ${JSON.stringify(caseA)}`);
  }

  const caseB = deriveDelayAndStatus({
    cancelled: false,
    aimedArr: "09:00",
    expectedArr: "09:00",
    aimedDep: "08:30",
    expectedDep: "08:35",
  });
  if (caseB.delayMins !== 0 || caseB.status !== "On time") {
    throw new Error(`Derivation regression case B failed: ${JSON.stringify(caseB)}`);
  }

  const caseC = deriveDelayAndStatus({
    cancelled: false,
    aimedArr: null,
    expectedArr: null,
    aimedDep: "08:30",
    expectedDep: "08:35",
  });
  if (caseC.delayMins !== 5 || caseC.status !== "Delayed") {
    throw new Error(`Derivation regression case C failed: ${JSON.stringify(caseC)}`);
  }

  const caseD = deriveDelayAndStatus({
    cancelled: false,
    aimedArr: "09:00",
    expectedArr: null,
    aimedDep: "08:30",
    expectedDep: null,
  });
  if (caseD.delayMins !== null || caseD.status !== "Unknown") {
    throw new Error(`Derivation regression case D failed: ${JSON.stringify(caseD)}`);
  }

  const caseE = deriveDelayAndStatus({
    cancelled: true,
    aimedArr: "09:00",
    expectedArr: "09:12",
    aimedDep: "08:30",
    expectedDep: "08:35",
  });
  if (caseE.delayMins !== null || caseE.status !== "Cancelled") {
    throw new Error(`Derivation regression case E failed: ${JSON.stringify(caseE)}`);
  }
}

function assertDarwinFixtureRegression() {
  const services = parseDarwinFixtureServices();
  if (services.length < 4) {
    throw new Error(`Darwin fixture regression: expected >=4 services, got ${services.length}.`);
  }

  const byUid = new Map(services.map((s) => [s.uid, s]));

  const onTime = byUid.get("1A01");
  if (!onTime || onTime.delayMins !== 0 || onTime.status !== "On time") {
    throw new Error(`Darwin fixture regression: expected 1A01 to be On time with 0 delay. actual=${JSON.stringify(onTime)}`);
  }

  const delayed = byUid.get("1A02");
  if (!delayed || delayed.delayMins !== 8 || delayed.status !== "Delayed") {
    throw new Error(`Darwin fixture regression: expected 1A02 to be Delayed by 8m. actual=${JSON.stringify(delayed)}`);
  }

  const cancelled = byUid.get("1A03");
  if (!cancelled || cancelled.status !== "Cancelled") {
    throw new Error(`Darwin fixture regression: expected 1A03 to be Cancelled. actual=${JSON.stringify(cancelled)}`);
  }

  const unknown = byUid.get("1A04");
  if (!unknown || unknown.status !== "Unknown") {
    throw new Error(`Darwin fixture regression: expected 1A04 to be Unknown. actual=${JSON.stringify(unknown)}`);
  }

  const inWindow = filterAndSortTimes(services, "08:36", 30);
  const expectedWindowOrder = ["08:30", "08:48", "08:50", "09:04"];
  if (JSON.stringify(inWindow) !== JSON.stringify(expectedWindowOrder)) {
    throw new Error(
      `Darwin fixture window regression: expected=${JSON.stringify(expectedWindowOrder)} actual=${JSON.stringify(inWindow)}`
    );
  }
}

function assertHspHelpersRegression() {
  const bounds = hhmmWindowToCompactBounds("19:46", 30);
  if (!bounds || bounds.from !== "1916" || bounds.to !== "2016") {
    throw new Error(
      `HSP helper regression: expected 19:46 +/- 30 to map to 1916..2016. actual=${JSON.stringify(bounds)}`
    );
  }

  const earlyBounds = hhmmWindowToCompactBounds("00:10", 30);
  if (!earlyBounds || earlyBounds.from !== "0000" || earlyBounds.to !== "0040") {
    throw new Error(
      `HSP helper regression: expected 00:10 +/- 30 to clamp to 0000..0040. actual=${JSON.stringify(earlyBounds)}`
    );
  }

  if (hspDayType("2026-03-06") !== "WEEKDAY") {
    throw new Error("HSP helper regression: 2026-03-06 should be WEEKDAY.");
  }
  if (hspDayType("2026-03-07") !== "SATURDAY") {
    throw new Error("HSP helper regression: 2026-03-07 should be SATURDAY.");
  }
  if (hspDayType("2026-03-08") !== "SUNDAY") {
    throw new Error("HSP helper regression: 2026-03-08 should be SUNDAY.");
  }
}

function assertHistoricalProviderSelectionRegression() {
  const fixedNow = new Date("2026-03-12T14:30:00");

  if (!historicalSelectionReason("2026-03-11", "08:30", fixedNow).useHistoricalHsp) {
    throw new Error("Provider selection regression: past dates must stay historical.");
  }

  if (!historicalSelectionReason("2026-03-12", "09:00", fixedNow).useHistoricalHsp) {
    throw new Error("Provider selection regression: same-day past departures must use historical search.");
  }

  if (historicalSelectionReason("2026-03-12", "14:00", fixedNow).useHistoricalHsp) {
    throw new Error("Provider selection regression: same-day departures inside the live buffer must stay live.");
  }

  if (historicalSelectionReason("2026-03-12", "15:00", fixedNow).useHistoricalHsp) {
    throw new Error("Provider selection regression: same-day future departures must stay live.");
  }

  if (historicalSelectionReason("2026-03-13", "09:00", fixedNow).useHistoricalHsp) {
    throw new Error("Provider selection regression: future dates must stay live.");
  }

  const providerSource = readFileSync("lib/providers/journeys-provider.ts", "utf8");
  if (!providerSource.includes("historicalSelectionReason(query.date, normalizedTime)")) {
    throw new Error("Provider selection regression: provider must classify same-day searches with date and time.");
  }

  if (!providerSource.includes("SAME_DAY_HSP_BUFFER_MINS = 45")) {
    throw new Error("Provider selection regression: provider must keep an explicit same-day buffer.");
  }
}

function assertHspTimeoutRegression() {
  const hspSource = readFileSync("lib/darwin/hsp.ts", "utf8");

  if (!hspSource.includes("const DEFAULT_HSP_SERVICE_METRICS_TIMEOUT_MS = 12000")) {
    throw new Error("HSP timeout regression: serviceMetrics must keep an explicit timeout budget.");
  }

  if (!hspSource.includes("process.env.HSP_METRICS_TIMEOUT_MS")) {
    throw new Error("HSP timeout regression: serviceMetrics timeout must remain env-configurable.");
  }

  if (!hspSource.includes('{ timeoutMs: HSP_SERVICE_METRICS_TIMEOUT_MS }')) {
    throw new Error("HSP timeout regression: serviceMetrics must pass its explicit timeout to postJson.");
  }
}

function assertDelayRepayOperatorHandoffRegression() {
  const operatorsSource = readFileSync("lib/operators.ts", "utf8");
  const serviceCardSource = readFileSync("components/ServiceCard.tsx", "utf8");
  const claimRouteSource = readFileSync("app/api/claim/start/route.ts", "utf8");

  const requiredOperators = [
    ['SE', "https://www.southeasternrailway.co.uk/delay-repay"],
    ['TL', "https://www.thameslinkrailway.com/help-and-support/delay-repay"],
    ['SN', "https://www.southernrailway.com/help-and-support/delay-repay"],
    ['GN', "https://www.greatnorthernrail.com/help-and-support/delay-repay"],
    ['GR', "https://www.lner.co.uk/support/refunds-and-compensation/delay-repay/"],
  ];

  for (const [code, url] of requiredOperators) {
    if (!operatorsSource.includes(`code: "${code}"`) || !operatorsSource.includes(`delayRepayUrl: "${url}"`)) {
      throw new Error(`Operator handoff regression: missing mapped claim page for ${code}.`);
    }
  }

  if (!operatorsSource.includes("export function resolveDelayRepayClaimUrl(service: DelayRepayServiceOperatorInput)")) {
    throw new Error("Operator handoff regression: operators module must expose a claim URL resolver helper.");
  }

  if (!serviceCardSource.includes("resolveDelayRepayOperator(service)")) {
    throw new Error("Operator handoff regression: ServiceCard must resolve operators via the shared helper.");
  }

  if (!serviceCardSource.includes("operatorName,")) {
    throw new Error("Operator handoff regression: ServiceCard must pass operatorName into claim handoff params.");
  }

  if (!serviceCardSource.includes("Claim link unavailable")) {
    throw new Error("Operator handoff regression: eligible unmapped services must show a claim link unavailable fallback.");
  }

  if (!claimRouteSource.includes('const operatorName = searchParams.get("operatorName")?.trim() ?? "";')) {
    throw new Error("Operator handoff regression: claim route must accept operatorName for fallback lookup.");
  }

  if (!claimRouteSource.includes("getOperator(operatorCode, operatorName)")) {
    throw new Error("Operator handoff regression: claim route must resolve operators by code with name fallback.");
  }
}

const checks = [
  ["npm", ["run", "lint"]],
  ["npx", ["tsc", "--noEmit"]],
  ["npm", ["run", "build"]],
];

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

assertTimeWindowRegression();
assertChooseSourceRegression();
assertJourneysUrlBuilderRegression();
assertStationsLocalSearchRegression();
assertDelayCalculationRegression();
assertDelayAndStatusDerivationRegression();
assertDarwinFixtureRegression();
assertHspHelpersRegression();
assertHistoricalProviderSelectionRegression();
assertHspTimeoutRegression();
assertDelayRepayOperatorHandoffRegression();

for (const [cmd, args] of checks) {
  const code = await run(cmd, args);
  if (code !== 0) {
    process.exit(code);
  }
}

process.exit(0);
