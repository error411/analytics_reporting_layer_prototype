import { NextRequest } from "next/server";
import { ingestSimulatedGaData } from "@/lib/reporting";
import { protectApiRoute, protectedJson } from "@/lib/api-protection";

export async function POST(request: NextRequest) {
  const protection = protectApiRoute(request, {
    requireApiKey: true,
    rateLimit: {
      maxRequests: 3
    }
  });

  if (!protection.ok) {
    return protection.response;
  }

  try {
    const importMetadata = await ingestSimulatedGaData();

    return protectedJson({
      ok: true,
      import: importMetadata
    });
  } catch {
    return protectedJson({ error: "Unable to ingest simulated GA data." }, { status: 500 });
  }
}
