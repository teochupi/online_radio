import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import App from "./App";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders page heading", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByText(/Зареждане на станции/i)).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /RadioBG Online/i })).toBeInTheDocument();
  });

  it("renders at least one station card", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByText(/Зареждане на станции/i)).not.toBeInTheDocument();
    });
    expect(screen.getAllByRole("button", { name: /Пусни /i }).length).toBeGreaterThan(0);
  });
});
