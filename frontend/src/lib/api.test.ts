import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_BASE_URL,
  ApiError,
  analyzeDocument,
  createJournalEntry,
  createWatchlist,
  deleteWatchlist,
  getDocuments,
  getJournalEntries,
  getStockDetail,
  getStocks,
  getWatchlistMetrics,
  getWatchlists,
  saveScreen,
  screenerFilter,
  updateJournalEntry,
  updateWatchlist,
  uploadDocument,
} from "@/lib/api";
import type { ApiEnvelope, StockDetail, StockResult } from "@/types/stock";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

const sampleStock: StockResult = {
  symbol: "AAA",
  company_name: "Company A",
  exchange: "HOSE",
  industry: "Tech",
  market_cap: 1000,
  close_price: 25,
  change_pct: 1.5,
  pe: 12,
  pb: 1,
  roe: 22,
  roa: 11,
  net_margin: 8,
  revenue_growth: 5,
  eps_growth: 4,
  debt_equity: 0.5,
  current_ratio: 1.8,
  dividend_yield: 3,
  avg_volume_30d: 100000,
  quant_score: 85,
  quant_grade: "A+",
  updated_at: null,
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getStocks", () => {
  it("returns data + meta from a success envelope", async () => {
    const meta = { total: 1, limit: 50, offset: 0 };
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: [sampleStock], error: null, meta }),
    );

    const result = await getStocks();

    expect(result.data).toEqual([sampleStock]);
    expect(result.meta).toEqual(meta);
  });

  it("requests /stocks with default limit/offset query params", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: [], error: null, meta: null }),
    );

    await getStocks();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/stocks?limit=50&offset=0`);
    expect(init.cache).toBe("no-store");
  });

  it("includes exchange and industry when provided", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: [], error: null, meta: null }),
    );

    await getStocks({ exchange: "HNX", industry: "Banks", limit: 10, offset: 5 });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("exchange=HNX");
    expect(url).toContain("industry=Banks");
    expect(url).toContain("limit=10");
    expect(url).toContain("offset=5");
  });

  it("defaults data to [] when the envelope data is null", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: null, error: null, meta: null }),
    );

    const result = await getStocks();
    expect(result.data).toEqual([]);
    expect(result.meta).toBeNull();
  });
});

describe("error handling", () => {
  it("throws ApiError with the envelope error message on success:false", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, data: null, error: "boom", meta: null }),
    );

    await expect(getStocks()).rejects.toThrowError(ApiError);
    await expect(getStocks()).rejects.toThrow("boom");
  });

  it("throws ApiError with the envelope error on a non-OK HTTP status", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, data: null, error: "server down", meta: null }, false, 500),
    );

    await expect(getStocks()).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
      message: "server down",
    });
  });

  it("falls back to a status message when a non-OK response has no body", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error("invalid json");
      },
    } as unknown as Response);

    await expect(getStocks()).rejects.toThrow("Request failed with status 503");
  });

  it("wraps network failures in an ApiError with status 0", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const err = await getStocks().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toContain("ECONNREFUSED");
  });

  it("throws when a successful response has an empty body", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("no body");
      },
    } as unknown as Response);

    await expect(getStocks()).rejects.toThrow("Empty or invalid response body");
  });
});

describe("getStockDetail", () => {
  it("returns the detail payload and encodes the symbol in the URL", async () => {
    const detail = { ...sampleStock, quarterly_profit: [], ownership: [], tags: [] } as unknown as
      ApiEnvelope<StockDetail>["data"];
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: detail, error: null, meta: null }),
    );

    const result = await getStockDetail("A&B");

    expect(result).toEqual(detail);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/stocks/A%26B`);
  });

  it("throws a 404 ApiError when detail data is missing", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: null, error: null, meta: null }),
    );

    await expect(getStockDetail("XYZ")).rejects.toMatchObject({ status: 404 });
  });
});

describe("screenerFilter", () => {
  it("POSTs JSON to /screener/filter and returns data + meta", async () => {
    const meta = { total: 100, filtered: 1, limit: 50 };
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: [sampleStock], error: null, meta }),
    );

    const filter = { pe_max: 30, roe_min: 10 };
    const result = await screenerFilter(filter);

    expect(result.data).toEqual([sampleStock]);
    expect(result.meta).toEqual(meta);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/screener/filter`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(filter);
  });
});

describe("watchlist + saved screens", () => {
  it("getWatchlists returns the data array", async () => {
    const wl = { id: 1, name: "Bluechips", symbols: ["FPT"], created_at: null };
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: [wl], error: null, meta: null }),
    );
    expect(await getWatchlists()).toEqual([wl]);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/watchlist`);
  });

  it("createWatchlist POSTs name + symbols", async () => {
    const wl = { id: 2, name: "Tech", symbols: ["FPT", "VCB"], created_at: null };
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: wl, error: null, meta: null }),
    );
    const result = await createWatchlist("Tech", ["FPT", "VCB"]);
    expect(result).toEqual(wl);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/watchlist`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name: "Tech", symbols: ["FPT", "VCB"] });
  });

  it("updateWatchlist PUTs the patch", async () => {
    const wl = { id: 3, name: "X", symbols: ["FPT"], created_at: null };
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: wl, error: null, meta: null }),
    );
    await updateWatchlist(3, { symbols: ["FPT"] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/watchlist/3`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ symbols: ["FPT"] });
  });

  it("deleteWatchlist issues a DELETE", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: { deleted: true }, error: null, meta: null }),
    );
    await deleteWatchlist(5);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/watchlist/5`);
    expect(init.method).toBe("DELETE");
  });

  it("getWatchlistMetrics returns the metrics array", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: [sampleStock], error: null, meta: null }),
    );
    expect(await getWatchlistMetrics(1)).toEqual([sampleStock]);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/watchlist/1/metrics`);
  });

  it("saveScreen POSTs to /screener/save and returns the id", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: { id: 7, name: "S" }, error: null, meta: null }),
    );
    const id = await saveScreen("S", { roe_min: 20 });
    expect(id).toBe(7);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/screener/save`);
    expect(JSON.parse(init.body)).toEqual({ name: "S", criteria: { roe_min: 20 } });
  });
});

describe("journal", () => {
  it("getJournalEntries passes the symbol filter", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: [], error: null, meta: null }),
    );
    await getJournalEntries("fpt");
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/journal?symbol=fpt`);
  });

  it("createJournalEntry POSTs the body", async () => {
    const entry = {
      id: 1, symbol: "FPT", action: "buy", thesis: "t", target_price: 85000,
      catalyst: null, price_at_entry: 70800, status: "open", review_note: null,
      created_at: null, updated_at: null, reviewed_at: null,
    };
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: entry, error: null, meta: null }),
    );
    const result = await createJournalEntry({ symbol: "FPT", action: "buy", thesis: "t" });
    expect(result).toEqual(entry);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/journal`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ symbol: "FPT", action: "buy", thesis: "t" });
  });

  it("updateJournalEntry PUTs a partial patch", async () => {
    const entry = {
      id: 1, symbol: "FPT", action: "buy", thesis: "t", target_price: null,
      catalyst: null, price_at_entry: null, status: "closed", review_note: "done",
      created_at: null, updated_at: null, reviewed_at: null,
    };
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: entry, error: null, meta: null }),
    );
    await updateJournalEntry(1, { status: "closed", review_note: "done" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/journal/1`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ status: "closed", review_note: "done" });
  });
});

describe("documents (BCTC)", () => {
  const doc = {
    id: 1, symbol: "FPT", filename: "bctc.pdf", size_bytes: 1024,
    analysis: null, analysis_model: null, uploaded_at: null, analyzed_at: null,
  };

  it("uploadDocument POSTs multipart without a JSON content-type", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: doc, error: null, meta: null }),
    );
    const file = new File(["%PDF-1.4"], "bctc.pdf", { type: "application/pdf" });
    const result = await uploadDocument(file, "FPT");
    expect(result).toEqual(doc);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/documents`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    // Must NOT set application/json — browser sets the multipart boundary.
    expect(init.headers?.["Content-Type"]).toBeUndefined();
  });

  it("analyzeDocument surfaces the FastAPI detail message (e.g. missing key)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "ANTHROPIC_API_KEY chưa được cấu hình." }, false, 503),
    );
    await expect(analyzeDocument(1)).rejects.toMatchObject({
      status: 503,
      message: "ANTHROPIC_API_KEY chưa được cấu hình.",
    });
  });

  it("getDocuments passes the symbol filter", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: [doc], error: null, meta: null }),
    );
    await getDocuments("FPT");
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/documents?symbol=FPT`);
  });
});
