import { useState } from 'react'
import { Anchor, X } from 'lucide-react'
import PortMap from '../components/Map/PortMap'
import MeasureButton from '../components/Map/MeasureButton'
import MeasurePanel from '../components/Map/MeasurePanel'
import { FOB_PORTS, portDescriptionKey } from '../lib/ports'
import { portPoint, useMeasure, wantsPairs } from '../hooks/useMeasure'
import { useI18n } from '../i18n'

function DetailRow({ label, children }) {
  return (
    <div className="flex gap-3 py-2">
      <dt className="w-32 flex-shrink-0 text-[13px] text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-[14px] text-ink">{children}</dd>
    </div>
  )
}

function PortDetails({ port, t, onClose }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-line p-5">
        <div className="min-w-0">
          <h2 className="truncate text-[18px] font-semibold tracking-[-0.01em] text-ink">{port.name}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {port.nameLocal} · {port.unlocode}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-canvas hover:text-ink lg:hidden"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <p className="text-[14px] leading-relaxed text-ink">{t(portDescriptionKey(port.id))}</p>

        <dl className="mt-4 divide-y divide-line border-t border-line pt-1">
          <DetailRow label={t('ports.city')}>{port.city}</DetailRow>
          <DetailRow label={t('ports.province')}>{port.province}</DetailRow>
          <DetailRow label={t('ports.terminals')}>{port.terminals.join(', ')}</DetailRow>
          <DetailRow label={t('ports.coordinates')}>
            <span className="tabular-nums">
              {port.latitude.toFixed(4)}, {port.longitude.toFixed(4)}
            </span>
          </DetailRow>
        </dl>
      </div>
    </div>
  )
}

export default function PortsPage() {
  const { t } = useI18n()
  const [selectedPort, setSelectedPort] = useState(null)
  const measure = useMeasure()

  // The details panel and a measurement compete for the same screen, and the
  // list is still a useful way to jump around while measuring — so a list click
  // flies to the port either way, and only the details panel steps aside.
  const showDetails = selectedPort && !measure.measuring

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Port list — a horizontal strip on small screens, a column on large */}
      <aside className="flex flex-shrink-0 flex-col border-b border-line bg-surface lg:w-72 lg:border-b-0 lg:border-r">
        <div className="px-5 pb-3 pt-5">
          <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{t('ports.title')}</h1>
          <p className="mt-0.5 text-[13px] text-muted">{t('ports.subtitle')}</p>
        </div>
        <ul className="flex gap-2 overflow-x-auto px-3 pb-3 lg:flex-col lg:gap-0.5 lg:overflow-y-auto lg:pb-3">
          {FOB_PORTS.map((port) => {
            const isSelected = selectedPort?.id === port.id
            return (
              <li key={port.id} className="flex-shrink-0 lg:flex-shrink">
                <button
                  type="button"
                  onClick={() => setSelectedPort(port)}
                  aria-current={isSelected ? 'true' : undefined}
                  className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-left text-[14px] transition-colors lg:whitespace-normal ${
                    isSelected ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-canvas'
                  }`}
                >
                  <Anchor size={15} strokeWidth={1.75} className="flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{port.name}</span>
                    <span className="hidden truncate text-[12px] text-muted lg:block">{port.province}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <main className="relative min-h-[320px] flex-1">
        {/* Top-left is free on this map: the zoom buttons are pinned right. */}
        <MeasureButton
          active={measure.measuring}
          onClick={measure.toggle}
          className="absolute left-3 top-3 z-[1101]"
        />

        <PortMap
          ports={FOB_PORTS}
          selectedPort={selectedPort}
          onSelect={setSelectedPort}
          measuring={measure.measuring}
          measurePoints={measure.points}
          measureLegs={measure.legs}
          measureSelectedKeys={measure.selectedKeys}
          onMeasurePort={(port, event) =>
            measure.select(portPoint(port), { comparePairs: wantsPairs(event) })
          }
        />

        {!selectedPort && !measure.measuring && (
          <p className="pointer-events-none absolute bottom-4 left-1/2 z-[500] -translate-x-1/2 whitespace-nowrap rounded-full bg-surface/90 px-3.5 py-1.5 text-[12px] text-muted shadow-subtle backdrop-blur">
            {t('ports.selectPrompt')}
          </p>
        )}

        {measure.measuring && (
          <MeasurePanel
            points={measure.points}
            legs={measure.legs}
            totalKm={measure.totalKm}
            totalSeconds={measure.totalSeconds}
            mode={measure.mode}
            onModeChange={measure.setMode}
            metric={measure.metric}
            onMetricChange={measure.setMetric}
            roadStatus={measure.roadStatus}
            roadError={measure.roadError}
            roadSnaps={measure.roadSnaps}
            onUndo={measure.undo}
            onClear={measure.clear}
            onClose={measure.toggle}
            emptyHint={t('measure.selectFirstPort')}
            nextHint={t('measure.selectNextPort')}
          />
        )}
      </main>

      {/* Details: a bottom sheet on small screens, a side panel on large */}
      {showDetails && (
        <aside className="max-h-[45vh] flex-shrink-0 overflow-hidden border-t border-line bg-surface lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
          <PortDetails port={selectedPort} t={t} onClose={() => setSelectedPort(null)} />
        </aside>
      )}
    </div>
  )
}
