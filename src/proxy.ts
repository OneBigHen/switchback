import { NextResponse, type NextRequest } from "next/server"
import { PUBLIC_SWITCHBACK_HOST, shouldUpgradeCloudflareHttp } from "@/lib/http/cloudflare-https"

export function proxy(request: NextRequest): NextResponse {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim()
  const requestHost = forwardedHost || request.nextUrl.hostname
  if (!shouldUpgradeCloudflareHttp(request.headers, requestHost)) {
    return NextResponse.next()
  }

  const target = request.nextUrl.clone()
  target.protocol = "https:"
  target.hostname = PUBLIC_SWITCHBACK_HOST
  target.port = ""
  return NextResponse.redirect(target, 308)
}

export const config = {
  matcher: "/:path*"
}
