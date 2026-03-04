import { Suspense } from "react";
import HomeClient from "./home-client";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-zinc-200">Loading…</div>}>
      <HomeClient />
    </Suspense>
  );
}