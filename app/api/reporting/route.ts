import { NextRequest } from "next/server";
import { buildReport, GroupBy } from "@/lib/reporting";
import { protectApiRoute, protectedJson } from "@/lib/api-protection";

export async function GET(request: NextRequest) {
  const protection = protectApiRoute(request, {
    rateLimit: {
      maxRequests: 20
    }
  });

  if (!protection.ok) {
    return protection.response;
  }

  const searchParams = request.nextUrl.searchParams;

  try {
    const report = await buildReport({
      articleId: searchParams.get("articleId") || undefined,
      category: searchParams.get("category") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      groupBy: (searchParams.get("groupBy") || "date") as GroupBy
    });

    return protectedJson(report);
  } catch (error) {
    const message = error instanceof Error && isClientError(error.message)
      ? error.message
      : "Unable to load reporting data.";

    return protectedJson({ error: message }, { status: isClientError(message) ? 400 : 500 });
  }
}

function isClientError(message: string) {
  return (
    message.includes("Reporting range") ||
    message.includes("startDate") ||
    message.includes("endDate")
  );
}
