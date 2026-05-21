import { NextRequest, NextResponse } from "next/server";
import { buildReport, GroupBy } from "@/lib/reporting";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  try {
    // In a real protected layer, this route would also verify auth, tenant access,
    // and row-level permissions before calling buildReport.
    const report = await buildReport({
      articleId: searchParams.get("articleId") || undefined,
      category: searchParams.get("category") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      groupBy: (searchParams.get("groupBy") || "date") as GroupBy
    });

    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load reporting data.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
