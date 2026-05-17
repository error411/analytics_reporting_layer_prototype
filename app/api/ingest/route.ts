import { NextResponse } from "next/server";
import { ingestSimulatedGaData } from "@/lib/reporting";

export function POST() {
  const importMetadata = ingestSimulatedGaData();

  return NextResponse.json({
    ok: true,
    import: importMetadata
  });
}
