export function LabeledDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 border-t border-amber-200/20" />
      <span className="text-[10px] text-amber-200/70 uppercase tracking-widest">{label}</span>
      <div className="flex-1 border-t border-amber-200/20" />
    </div>
  )
}
