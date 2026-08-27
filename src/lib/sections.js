import {
  Anchor,
  ClipboardList,
  Factory,
  FolderOpen,
  Library,
  Lightbulb,
  MessageSquarePlus,
  PackageCheck,
  Truck,
  Users,
} from 'lucide-react'

/**
 * The application's sections, in one place.
 *
 * The main menu and the sidebar both render from this list, so a section is
 * added or reordered once rather than in two files that then drift apart.
 *
 * `ready: false` means the route exists and is reachable but the feature is
 * still being built — those land on SectionPlaceholder instead of a real page.
 * Nothing here is a permission check: access is decided by row-level security
 * in Postgres, and every section below is open to both roles.
 *
 * Tone classes are written out in full because Tailwind scans the source for
 * complete class names; building them from fragments would leave them out of
 * the stylesheet.
 */
export const SECTION_GROUPS = ['maps', 'orders', 'documents', 'innovations', 'workspace']

export const SECTIONS = [
  {
    id: 'factories',
    path: '/factories',
    group: 'maps',
    icon: Factory,
    ready: true,
    tone: 'bg-blue-500/10 text-blue-600',
  },
  {
    id: 'ports',
    path: '/ports',
    group: 'maps',
    icon: Anchor,
    ready: true,
    tone: 'bg-cyan-500/10 text-cyan-700',
  },
  {
    id: 'ordersTodo',
    path: '/orders/to-do',
    group: 'orders',
    icon: ClipboardList,
    ready: true,
    tone: 'bg-amber-500/10 text-amber-600',
  },
  {
    id: 'ordersInTransit',
    path: '/orders/in-transit',
    group: 'orders',
    icon: Truck,
    ready: true,
    tone: 'bg-emerald-500/10 text-emerald-600',
  },
  {
    id: 'files',
    path: '/files',
    group: 'documents',
    icon: FolderOpen,
    ready: true,
    tone: 'bg-orange-500/10 text-orange-600',
  },
  {
    id: 'catalog',
    path: '/catalog',
    group: 'documents',
    icon: Library,
    ready: true,
    tone: 'bg-teal-500/10 text-teal-600',
  },
  {
    id: 'innovationsDevelopment',
    path: '/innovations/in-development',
    group: 'innovations',
    icon: Lightbulb,
    ready: true,
    tone: 'bg-violet-500/10 text-violet-600',
  },
  {
    id: 'innovationsReady',
    path: '/innovations/ready',
    group: 'innovations',
    icon: PackageCheck,
    ready: true,
    tone: 'bg-indigo-500/10 text-indigo-600',
  },
  {
    id: 'people',
    path: '/people',
    group: 'workspace',
    icon: Users,
    ready: true,
    tone: 'bg-slate-500/10 text-slate-600',
  },
  {
    id: 'suggestions',
    path: '/suggestions',
    group: 'workspace',
    icon: MessageSquarePlus,
    ready: true,
    tone: 'bg-rose-500/10 text-rose-600',
  },
]

export const getSection = (id) => SECTIONS.find((section) => section.id === id)

/** Sections grouped for display, preserving the order declared above. */
export const sectionsByGroup = () =>
  SECTION_GROUPS.map((group) => ({
    group,
    sections: SECTIONS.filter((section) => section.group === group),
  })).filter(({ sections }) => sections.length > 0)

/** Translation keys for a section, e.g. 'ports' -> 'sections.ports.name' */
export const sectionNameKey = (id) => `sections.${id}.name`

/**
 * The sidebar is 256px wide, so it uses a shortened label instead of the full
 * name — the group heading above it already supplies the missing context
 * ("Orders" › "To do"). Without this the Spanish labels are clipped.
 */
export const sectionShortNameKey = (id) => `sections.${id}.short`
export const sectionDescriptionKey = (id) => `sections.${id}.description`
export const sectionGroupKey = (group) => `sections.groups.${group}`
