import { NextRequest, NextResponse } from "next/server";
import { buildReport, GroupBy } from "@/lib/reporting";

export function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // In a real protected layer, this route would also verify auth, tenant access,
  // and row-level permissions before calling buildReport.
  const report = buildReport({
    category: searchParams.get("category") || undefined,
    startDate: searchParams.get("startDate") || undefined,
    endDate: searchParams.get("endDate") || undefined,
    groupBy: (searchParams.get("groupBy") || "date") as GroupBy
  });

  return NextResponse.json(report);
}
