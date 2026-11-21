/** Read-only facts about a cube or a game, such as "3 opponents · Upgrades On", as plain text between gold middots. */
export function DetailLine({ items, className }: { items: string[]; className?: string }) {
  return (
    <div className={`detail-line text-xs text-[var(--ivory-soft)] ${className ?? ''}`}>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export interface Detail {
  label: string
  value: string
}

/** A preset's settings at the top of its page, each a quiet label beside a bright value, spaced rather than divided. */
export function HeroDetails({ details, className }: { details: Detail[]; className?: string }) {
  return (
    <dl className={`flex flex-wrap gap-x-4 gap-y-1 text-[13px] leading-5 ${className ?? ''}`}>
      {details.map(({ label, value }) => (
        <div key={label}>
          <dt className="inline text-[var(--ivory-key)]">{label}: </dt>
          <dd className="inline font-semibold text-[var(--ivory)]">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
