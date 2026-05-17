import { NextResponse } from "next/server";
import { ingestSimulatedGaData } from "@/lib/reporting";

export async function POST() {
  try {
    const importMetadata = await ingestSimulatedGaData();

    return NextResponse.json({
      ok: true,
      import: importMetadata
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to ingest simulated GA data.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
