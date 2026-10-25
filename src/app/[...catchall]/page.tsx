import { CatchAllPage } from "./CatchAllPage";

export function generateStaticParams() {
  return [{ catchall: ["preview"] }];
}

export default function Page() {
  return <CatchAllPage />;
}
