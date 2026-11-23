import { Desk } from "@/components/desk";
import type { Viewer } from "@/lib/draft";
import { modelConfigured } from "@/lib/openai";
import { headers } from "next/headers";
import { getIdentity } from "../../cursor/identity";

export const dynamic = "force-dynamic";

export default async function Home() {
  const identity = await getIdentity(await headers());
  return <Desk viewer={toViewer(identity)} modelReady={modelConfigured()} />;
}

function toViewer(identity: Awaited<ReturnType<typeof getIdentity>>): Viewer | null {
  if (!identity.verified) return null;
  if (identity.kind === "key") {
    return {
      name: identity.name,
      email: "",
      kind: "key",
      simulated: identity.simulated,
    };
  }
  return {
    name: identity.name,
    email: identity.email,
    kind: "person",
    simulated: identity.simulated,
  };
}
