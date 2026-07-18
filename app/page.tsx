"use client";

import dynamic from "next/dynamic";

const App = dynamic(() => import("@/src/app/App"), { ssr: false });

export default function Home() {
  return <App />;
}
