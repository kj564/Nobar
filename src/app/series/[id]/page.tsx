// Series detail route — thin wrapper that renders the client component.
// Same routing pattern as /movie/[id]/page.tsx.

import { SeriesPageClient } from "./SeriesPageClient";

export default function SeriesDetailPage() {
  return <SeriesPageClient />;
}

export function generateStaticParams() {
  return [{ id: "preview" }];
}

export const dynamicParams = true;
