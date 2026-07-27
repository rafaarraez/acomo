import { NextResponse } from "next/server";
import { getRates } from "@/lib/rates";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const refParam = Number(searchParams.get("ref"));
  const ref = Number.isFinite(refParam) && refParam > 0 ? refParam : undefined;

  const rates = await getRates(ref);
  return NextResponse.json(rates, {
    headers: { "Cache-Control": "no-store" },
  });
}
