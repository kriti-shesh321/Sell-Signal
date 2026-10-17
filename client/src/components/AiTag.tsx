/** Marks a value that came from the optional AI fallback (checked against the page text). */
export function AiTag() {
  return (
    <span
      title="Suggested by AI, then checked word for word against the website text"
      className="inline-flex h-4 items-center rounded-[4px] border border-acc/50 px-1 font-mono text-[10px] leading-none font-semibold tracking-wide text-acc"
    >
      AI
    </span>
  )
}
