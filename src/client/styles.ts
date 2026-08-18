/**
 * Package CSS. Uses only DSH theme variables (light/dark safe), no hard-coded
 * colors. Injected through a self-managed `<style>` tag tagged with
 * data-plugin/data-plugin-css (the client-modules convention), removed on
 * dispose.
 */

export const CSS = `
.dshToolGroupRow{
  display:flex;align-items:center;gap:12px;min-width:0;height:24px;
  box-sizing:border-box;padding:0 8px;border-radius:6px;
  cursor:pointer;user-select:none;outline:none;
  font-size:14px;line-height:24px;
}
.dshToolGroupRow:hover,
.dshToolGroupRow:focus-visible{
  background:var(--dsw-alias-interactive-bg-hover);
}
.dshToolGroupLeft{
  display:flex;align-items:center;gap:6px;min-width:0;flex:1 1 auto;overflow:hidden;
}
.dshToolGroupRunning{
  color:var(--dsw-alias-state-business-primary);
  flex:none;white-space:nowrap;font-size:14px;line-height:24px;
}
.dshToolGroupName{
  color:var(--dsw-alias-label-secondary);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  font-size:14px;line-height:24px;
}
.dshToolGroupRight{
  display:flex;align-items:center;gap:6px;flex:none;
}
.dshToolGroupCount{
  color:var(--dsw-alias-label-tertiary);
  font-size:14px;line-height:24px;font-variant-numeric:tabular-nums;
}
.dshToolGroupChevron{
  color:var(--dsw-alias-label-secondary);display:inline-flex;flex:none;
}
.dshToolGroupMembers{
  display:flex;flex-direction:column;gap:16px;margin-top:16px;
}
.dshToolGroupCallRow{border-radius:6px}
.dshToolGroupSubCalls{
  border-left:1px solid var(--dsw-alias-border-l2);
  flex-direction:column;gap:4px;margin:4px 0 2px 22px;padding-left:8px;display:flex;
}
.dshToolGroupFallback{
  border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-base);
  border-radius:6px;flex-direction:column;gap:4px;padding:8px 10px;display:flex;
}
.dshToolGroupFallbackTitle{
  color:var(--dsw-alias-label-primary);
  font-size:13px;font-weight:500;line-height:20px;
}
.dshToolGroupFallbackArgs{
  color:var(--dsw-alias-label-secondary);
  font-family:var(--ds-font-family-code);
  white-space:pre-wrap;word-break:break-word;
  font-size:12px;line-height:18px;margin:0;
}
.dshToolGroupFallbackOutput{
  color:var(--dsw-alias-label-secondary);
  font-family:var(--ds-font-family-code);
  white-space:pre-wrap;word-break:break-word;
  background:var(--dsw-alias-markdown-code-block);
  border-radius:8px;margin:0;padding:8px 10px;
  font-size:12px;line-height:18px;
}
.dshToolGroupFallbackOutput[data-error=true]{color:var(--dsw-alias-state-error-primary)}
`

const STYLE_ID = 'dsh-tool-group/styles'

/**
 * Inject the package stylesheet once; returns a disposer that removes the tag
 * (idempotent; a tag another package instance already owns is adopted).
 */
export function insertStyle(doc: Document): () => void {
  const existing = doc.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)
  if (existing !== null) {
    return () => {}
  }
  const tag = doc.createElement('style')
  tag.setAttribute('data-plugin', 'dsh-tool-group')
  tag.setAttribute('data-plugin-css', STYLE_ID)
  tag.textContent = CSS
  doc.head.appendChild(tag)
  let removed = false
  return () => {
    if (removed) return
    removed = true
    tag.remove()
  }
}
