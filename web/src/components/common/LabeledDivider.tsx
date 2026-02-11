export function LabeledDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 border-t border-gray-600/40" />
      <span className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</span>
      <div className="flex-1 border-t border-gray-600/40" />
    </div>
  )
}
