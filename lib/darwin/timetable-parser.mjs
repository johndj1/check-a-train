import { XMLParser } from "fast-xml-parser";

const POINT_TAGS = new Set(["or", "ip", "pp", "dt"]);
const PASSENGER_TRUE_VALUES = new Set(["true", "1", "y", "yes"]);
const PASSENGER_FALSE_VALUES = new Set(["false", "0", "n", "no"]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return value === undefined || value === null ? [] : [value];
}

function getNodeAttributes(node) {
  return isObject(node) && isObject(node[":@"]) ? node[":@"] : {};
}

function getElementEntries(node) {
  if (!isObject(node)) {
    return [];
  }

  return Object.entries(node).filter(([key]) => key !== ":@" && key !== "#text");
}

function getTextValue(node) {
  if (typeof node === "string") {
    const trimmed = node.trim();
    return trimmed === "" ? null : trimmed;
  }

  if (!isObject(node)) {
    return null;
  }

  if (typeof node["#text"] === "string") {
    const trimmed = node["#text"].trim();
    return trimmed === "" ? null : trimmed;
  }

  const entries = getElementEntries(node);

  if (entries.length === 1) {
    const [, value] = entries[0];
    return getTextValue(value);
  }

  return null;
}

function getChildElements(children, childName) {
  const expectedName = normalizeName(childName);
  const elements = [];

  for (const child of toArray(children)) {
    for (const [tagName, value] of getElementEntries(child)) {
      if (normalizeName(tagName) !== expectedName) {
        continue;
      }

      for (const item of toArray(value)) {
        elements.push({
          tagName,
          value: item,
          attributes: getNodeAttributes(child),
        });
      }
    }
  }

  return elements;
}

function getFirstFieldValue(children, attributes, fieldNames) {
  for (const fieldName of fieldNames) {
    const attributeEntries = Object.entries(attributes);

    for (const [attributeName, value] of attributeEntries) {
      if (normalizeName(attributeName) !== normalizeName(fieldName)) {
        continue;
      }

      const text = getTextValue(value);

      if (text) {
        return text;
      }
    }

    const matchingChildren = getChildElements(children, fieldName);

    for (const child of matchingChildren) {
      const text = getTextValue(child.value);

      if (text) {
        return text;
      }
    }
  }

  return null;
}

function parsePassengerFlag(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = normalizeName(value);

  if (PASSENGER_TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (PASSENGER_FALSE_VALUES.has(normalized)) {
    return false;
  }

  return null;
}

function derivePreferredArrival(point) {
  return point.publicArrival ?? point.workingArrival ?? point.workingPass ?? null;
}

function derivePreferredDeparture(point) {
  return point.publicDeparture ?? point.workingDeparture ?? point.workingPass ?? null;
}

function normalizeTimingPoint(pointElement) {
  const kind = String(pointElement.tagName ?? "").trim().toUpperCase();
  const timingPointChildren = toArray(pointElement.value);
  const timingPointAttributes = pointElement.attributes;

  const point = {
    kind,
    tiploc:
      getFirstFieldValue(timingPointChildren, timingPointAttributes, [
        "tpl",
        "tiploc",
        "tploc",
      ]) ?? null,
    publicArrival:
      getFirstFieldValue(timingPointChildren, timingPointAttributes, ["pta"]) ?? null,
    publicDeparture:
      getFirstFieldValue(timingPointChildren, timingPointAttributes, ["ptd"]) ?? null,
    workingArrival:
      getFirstFieldValue(timingPointChildren, timingPointAttributes, ["wta"]) ?? null,
    workingDeparture:
      getFirstFieldValue(timingPointChildren, timingPointAttributes, ["wtd"]) ?? null,
    workingPass:
      getFirstFieldValue(timingPointChildren, timingPointAttributes, ["wtp"]) ?? null,
  };

  return {
    ...point,
    scheduledArrival: derivePreferredArrival(point),
    scheduledDeparture: derivePreferredDeparture(point),
    isPassingPoint: kind === "PP",
  };
}

function normalizeJourneyElement(journeyElement) {
  const journeyChildren = toArray(journeyElement.value);
  const journeyAttributes = journeyElement.attributes;
  const timingPoints = [];

  for (const child of journeyChildren) {
    for (const [tagName, value] of getElementEntries(child)) {
      if (!POINT_TAGS.has(normalizeName(tagName))) {
        continue;
      }

      timingPoints.push(
        normalizeTimingPoint({
          tagName,
          value,
          attributes: getNodeAttributes(child),
        }),
      );
    }
  }

  return {
    rid: getFirstFieldValue(journeyChildren, journeyAttributes, ["rid"]) ?? null,
    uid: getFirstFieldValue(journeyChildren, journeyAttributes, ["uid"]) ?? null,
    trainId:
      getFirstFieldValue(journeyChildren, journeyAttributes, [
        "trainId",
        "trainid",
      ]) ?? null,
    ssd: getFirstFieldValue(journeyChildren, journeyAttributes, ["ssd"]) ?? null,
    toc: getFirstFieldValue(journeyChildren, journeyAttributes, ["toc"]) ?? null,
    isPassengerSvc: parsePassengerFlag(
      getFirstFieldValue(journeyChildren, journeyAttributes, [
        "isPassengerSvc",
        "ispassengersvc",
      ]),
    ),
    timingPoints,
  };
}

function looksLikeJourneyElement(tagName, value, attributes) {
  if (normalizeName(tagName) === "journey") {
    return true;
  }

  const children = toArray(value);
  const hasJourneyIdentity =
    getFirstFieldValue(children, attributes, ["rid", "uid", "ssd", "trainId"]) !== null;
  const hasTimingPoints = children.some((child) =>
    getElementEntries(child).some(([childTagName]) =>
      POINT_TAGS.has(normalizeName(childTagName)),
    ),
  );

  return hasJourneyIdentity && hasTimingPoints;
}

function collectJourneyElements(nodes, journeyElements = []) {
  for (const node of toArray(nodes)) {
    for (const [tagName, value] of getElementEntries(node)) {
      const attributes = getNodeAttributes(node);

      if (looksLikeJourneyElement(tagName, value, attributes)) {
        journeyElements.push({
          tagName,
          value,
          attributes,
        });
      }

      for (const item of toArray(value)) {
        if (Array.isArray(item)) {
          collectJourneyElements(item, journeyElements);
        } else if (isObject(item)) {
          collectJourneyElements([item], journeyElements);
        }
      }
    }
  }

  return journeyElements;
}

export function parseDarwinTimetableXml(xml, { sourceFileName = null } = {}) {
  if (typeof xml !== "string" || xml.trim() === "") {
    throw new Error("Darwin timetable XML must be a non-empty string");
  }

  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "",
    removeNSPrefix: true,
    trimValues: true,
    parseTagValue: false,
    parseAttributeValue: false,
  });

  const parsed = parser.parse(xml);
  const rawJourneys = collectJourneyElements(parsed).map(normalizeJourneyElement);
  const normalizedJourneys = rawJourneys.filter(
    (journey) => journey.isPassengerSvc !== false,
  );

  return {
    sourceFileName,
    rawJourneyCount: rawJourneys.length,
    passengerJourneyCount: normalizedJourneys.length,
    excludedNonPassengerJourneyCount: rawJourneys.length - normalizedJourneys.length,
    journeys: normalizedJourneys,
  };
}
