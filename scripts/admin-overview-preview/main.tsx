import React from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import AdminWorkspace from "../../src/components/admin/AdminWorkspace";
import AdminDashboard from "../../src/pages/AdminDashboard";
import { fixture } from "./client";
import "../../src/index.css";
const queryClient = new QueryClient();
function PreviewBar() {
  const query = useQueryClient();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-900">
      <span>Preview · Sample data</span>
      <label>
        Preview state{" "}
        <select
          aria-label="Preview state"
          className="ml-2 rounded border border-amber-200 bg-white p-1"
          onChange={(event) => {
            fixture.mode =
              event.target.value === "case_manager"
                ? "normal"
                : event.target.value;
            fixture.role =
              event.target.value === "case_manager" ? "case_manager" : "admin";
            void query.resetQueries();
          }}
        >
          <option value="normal">Normal</option>
          <option value="empty">Empty</option>
          <option value="save_error">Status save failure</option>
          <option value="conflict">Concurrent staff update</option>
          <option value="error">Connection outage</option>
          <option value="case_manager">Case manager</option>
        </select>
      </label>
    </div>
  );
}
function Destination() {
  const location = useLocation();
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <p className="text-xs text-slate-500">PREVIEW NAVIGATION CHECK</p>
      <h1 className="mt-3 text-2xl font-semibold">
        Existing admin destination
      </h1>
      <p className="my-4 break-all text-sm text-slate-600">
        {location.pathname}
        {location.search}
        {location.hash}
      </p>
      <p className="text-sm text-slate-500">
        In the application, this link opens the existing admin tool or case.
        This isolated preview contains the overview only.
      </p>
      <Link
        className="mt-6 inline-block text-blue-700 underline"
        to="/admin/dashboard"
      >
        Back to overview
      </Link>
    </main>
  );
}
const previewRoot = createRoot(document.getElementById("root")!);
previewRoot.render(
  <QueryClientProvider client={queryClient}>
    <HelmetProvider>
      <BrowserRouter>
        <PreviewBar />
        <Routes>
          <Route element={<AdminWorkspace />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
          </Route>
          <Route path="*" element={<Destination />} />
        </Routes>
      </BrowserRouter>
    </HelmetProvider>
  </QueryClientProvider>,
);

if (import.meta.hot) import.meta.hot.dispose(() => previewRoot.unmount());
