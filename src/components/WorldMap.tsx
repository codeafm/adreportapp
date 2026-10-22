import { useMemo, useRef, useState } from 'react'
import { geoEqualEarth, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { Feature, FeatureCollection } from 'geojson'
import iso from 'i18n-iso-countries'
import world from 'world-atlas/countries-110m.json'

// Контуры стран считаем один раз: Natural Earth 1:110m, проекция Equal Earth, без Антарктиды.
const W = 960
const H = 460
const SHAPES = (() => {
  // Типов у world-atlas нет — это TopoJSON, отдаём его topojson-client как есть.
  const topo = world as any
  const all = feature(topo, topo.objects.countries) as unknown as FeatureCollection
  const features = all.features.filter((f: Feature) => String(f.id) !== '010')
  const projection = geoEqualEarth().fitExtent(
    [
      [6, 6],
      [W - 6, H - 6],
    ],
    { type: 'FeatureCollection', features },
  )
  const path = geoPath(projection)
  return features.map((f: Feature) => ({ code: (f.id != null && iso.numericToAlpha2(String(f.id))) || null, d: path(f) ?? '', center: path.centroid(f) }))
})()
const CENTER = new Map(SHAPES.filter((s) => s.code).map((s) => [s.code as string, s.center]))

// Цвет от «меньше» к «больше»: глубокий синий → бирюза → золото → оранжевый.
const STOPS = ['#24407e', '#2a8fa8', '#3fd6a4', '#ffcc33', '#ff8a3d']
function colorAt(t: number) {
  const x = Math.min(1, Math.max(0, t)) * (STOPS.length - 1)
  const i = Math.min(STOPS.length - 2, Math.floor(x))
  const k = x - i
  const a = parseInt(STOPS[i].slice(1), 16)
  const b = parseInt(STOPS[i + 1].slice(1), 16)
  const mix = (sh: number) => Math.round(((a >> sh) & 255) * (1 - k) + ((b >> sh) & 255) * k)
  return `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`
}
export const MAP_GRADIENT = `linear-gradient(90deg, ${STOPS.join(', ')})`

export type MapCountry = { code: string; name: string; value: number | null; lines: string[] }

// Цвет по месту в ряду, а не по величине: иначе Россия с 97 % дохода делает все остальные страны одинаково тёмными.
// value null — данные есть, но мало для честного цвета (например, eCPM по трём показам).
export function rankColors(countries: MapCountry[]) {
  const ranked = countries.filter((c) => c.value != null).sort((a, b) => (a.value ?? 0) - (b.value ?? 0))
  return new Map(ranked.map((c, i) => [c.code, colorAt(ranked.length > 1 ? i / (ranked.length - 1) : 1)]))
}

type Props = {
  countries: MapCountry[]
  colors: Map<string, string>
  selected: string | null
  // Подсветка снаружи — например, при наведении на строку «Топ-5».
  highlight: string | null
  // Над этой страной пульсирует точка — лидер по выбранному показателю.
  marker: string | null
  onSelect: (code: string) => void
}

export function WorldMap({ countries, colors, selected, highlight, marker, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null)
  const byCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries])

  const move = (code: string, e: React.MouseEvent) => {
    const r = box.current?.getBoundingClientRect()
    if (r) setHover({ code, x: e.clientX - r.left, y: e.clientY - r.top })
  }
  const tip = hover && byCode.get(hover.code)
  const lit = hover?.code ?? highlight
  const pin = marker ? CENTER.get(marker) : undefined

  return (
    <div className="world-map" ref={box} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Карта стран">
        {SHAPES.map((s, i) => {
          const c = s.code ? byCode.get(s.code) : undefined
          const fill = c ? (colors.get(c.code) ?? 'var(--map-thin)') : 'var(--map-empty)'
          return (
            <path
              key={i}
              d={s.d}
              fill={fill}
              className={'country' + (c ? ' has-data' : '') + (s.code && s.code === selected ? ' selected' : '') + (s.code && s.code === lit ? ' hovered' : '')}
              onMouseMove={c ? (e) => move(c.code, e) : undefined}
              onMouseLeave={c ? () => setHover(null) : undefined}
              onClick={c ? () => onSelect(c.code) : undefined}
            />
          )
        })}
        {pin && Number.isFinite(pin[0]) && (
          <g className="map-pin" transform={`translate(${pin[0]}, ${pin[1]})`}>
            <circle className="map-pin-wave" r="7" />
            <circle className="map-pin-dot" r="4.5" />
          </g>
        )}
      </svg>
      {tip && hover && (
        <div
          className="map-tip"
          style={{ left: hover.x, top: hover.y, transform: `translate(${hover.x > (box.current?.clientWidth ?? 0) / 2 ? 'calc(-100% - 14px)' : '14px'}, -50%)` }}
        >
          <div className="map-tip-title">
            <span className="cc">{tip.code}</span> {tip.name}
          </div>
          {tip.lines.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      )}
    </div>
  )
}
