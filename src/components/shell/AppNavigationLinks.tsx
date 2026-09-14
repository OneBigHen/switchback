"use client"

import Link from "next/link"
import type { PrimaryDestination } from "@/lib/client/app-navigation"
import { NAV_ITEMS_BEFORE_RECORD, PRIMARY_NAV_ITEMS, RECORD_NAV_ITEM, type PrimaryNavItem } from "./primary-nav-items"

interface AppNavigationLinksProps {
  /** Which destination this page *is*; `null` when it is none of them. */
  active: PrimaryDestination | null
}

/**
 * The same primary navigation for pages rendered outside the app shell.
 *
 * The GPX Library is its own route (deep links, shared links, crawlers), but a
 * rider standing on it is still inside OpenGravel and must see the same five
 * items in the same order. These are links rather than buttons because moving
 * between a page and the shell is a real navigation.
 */
export function AppNavigationLinks({ active }: AppNavigationLinksProps) {
  return (
    <nav className="app-navigation app-navigation--links" aria-label="Primary">
      <div className="app-navigation-primary" role="group" aria-label="Primary destinations">
        {PRIMARY_NAV_ITEMS.slice(0, NAV_ITEMS_BEFORE_RECORD).map((item) => (
          <DestinationLink key={item.destination} item={item} active={active} />
        ))}
        <Link
          href={RECORD_NAV_ITEM.href}
          data-nav-cluster="secondary"
          data-nav-item="record"
        >
          <RECORD_NAV_ITEM.icon aria-hidden="true" />
          <span>{RECORD_NAV_ITEM.label}</span>
        </Link>
        {PRIMARY_NAV_ITEMS.slice(NAV_ITEMS_BEFORE_RECORD).map((item) => (
          <DestinationLink key={item.destination} item={item} active={active} />
        ))}
      </div>
    </nav>
  )
}

function DestinationLink({
  item,
  active
}: {
  item: PrimaryNavItem
  active: PrimaryDestination | null
}) {
  const { destination, label, icon: Icon, href } = item
  return (
    <Link
      href={href}
      className={active === destination ? "is-active" : undefined}
      aria-current={active === destination ? "page" : undefined}
      data-nav-item={label.toLowerCase()}
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </Link>
  )
}
