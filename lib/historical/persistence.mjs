import { supabaseRestRequest } from "../supabase/rest.mjs";

function buildHistoricalServiceRow(record) {
  if (!record.scheduledDepartureOrigin) {
    throw new Error(
      `Service ${record.serviceKey} is missing scheduledDepartureOrigin`,
    );
  }

  return {
    service_key: record.serviceKey,
    service_date: record.serviceDate,
    train_uid: record.trainUid,
    rid: record.rid,
    toc_code: record.tocCode,
    origin_crs: record.originCrs,
    destination_crs: record.destinationCrs,
    scheduled_departure_origin: record.scheduledDepartureOrigin,
    scheduled_arrival_destination: record.scheduledArrivalDestination,
    actual_departure_origin: record.actualDepartureOrigin,
    actual_arrival_destination: record.actualArrivalDestination,
    status: record.status,
    is_cancelled: record.isCancelled,
    is_part_cancelled: record.isPartCancelled,
    delay_minutes: record.delayMinutes,
    data_quality_score: record.dataQualityScore ?? 0,
  };
}

function buildHistoricalSearchRow(record, serviceId) {
  if (!record.scheduledDepartureOrigin) {
    throw new Error(
      `Service ${record.serviceKey} is missing scheduledDepartureOrigin`,
    );
  }

  return {
    service_id: serviceId,
    service_date: record.serviceDate,
    origin_crs: record.originCrs,
    destination_crs: record.destinationCrs,
    scheduled_departure_ts: record.scheduledDepartureOrigin,
    scheduled_arrival_ts: record.scheduledArrivalDestination,
    toc_code: record.tocCode,
    status: record.status,
    is_cancelled: record.isCancelled,
    delay_minutes: record.delayMinutes,
  };
}

function encodeInList(values) {
  return values
    .map((value) => `"${String(value).replaceAll('"', '\\"')}"`)
    .join(",");
}

export async function persistHistoricalRecords(records, { baseUrl, apiKey }) {
  const serviceRows = records.map(buildHistoricalServiceRow);

  await supabaseRestRequest({
    baseUrl,
    apiKey,
    method: "POST",
    table: "historical_services",
    queryParams: new URLSearchParams({ on_conflict: "service_key" }),
    body: serviceRows,
    prefer: "resolution=merge-duplicates,return=representation",
  });

  const serviceKeys = records.map((record) => record.serviceKey);
  const selectedServices = await supabaseRestRequest({
    baseUrl,
    apiKey,
    method: "GET",
    table: "historical_services",
    queryParams: new URLSearchParams({
      select: "id,service_key",
      service_key: `in.(${encodeInList(serviceKeys)})`,
    }),
  });

  const serviceIdByKey = new Map(
    selectedServices.map((row) => [row.service_key, row.id]),
  );
  const missingServiceKeys = serviceKeys.filter((key) => !serviceIdByKey.has(key));

  if (missingServiceKeys.length > 0) {
    throw new Error(
      `Failed to re-select some upserted services: ${missingServiceKeys.join(", ")}`,
    );
  }

  const serviceIds = [...serviceIdByKey.values()];

  await supabaseRestRequest({
    baseUrl,
    apiKey,
    method: "DELETE",
    table: "historical_service_search",
    queryParams: new URLSearchParams({
      service_id: `in.(${encodeInList(serviceIds)})`,
    }),
  });

  const searchRows = records.map((record) =>
    buildHistoricalSearchRow(record, serviceIdByKey.get(record.serviceKey)),
  );

  await supabaseRestRequest({
    baseUrl,
    apiKey,
    method: "POST",
    table: "historical_service_search",
    body: searchRows,
  });

  return {
    serviceCount: serviceRows.length,
    searchRowCount: searchRows.length,
    serviceKeys,
  };
}
