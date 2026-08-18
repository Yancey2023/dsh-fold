/**
 * Package CSS. Uses only DSH theme variables (light/dark safe), no hard-coded
 * colors. Injected through a self-managed `<style>` tag tagged with
 * data-plugin/data-plugin-css (the client-modules convention), removed on
 * dispose.
 */

export const CSS = `
.dshTurnFoldRow{
  display:flex;align-items:center;justify-content:space-between;gap:12px;
  min-width:0;height:24px;box-sizing:border-box;padding:0 8px;border-radius:6px;
  cursor:pointer;user-select:none;outline:none;
  font-size:14px;line-height:24px;
  border:1px dashed var(--dsw-alias-border-l2);
}
.dshTurnFoldRow:hover,
.dshTurnFoldRow:focus-visible{
  background:var(--dsw-alias-interactive-bg-hover);
  border-color:var(--dsw-alias-border-l3);
}
.dshTurnFoldLabel{
  min-width:0;color:var(--dsw-alias-label-secondary);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  font-size:14px;line-height:24px;
}
[data-chat-flow-key]:has([data-tool-group-hidden]){display:none}
.dshToolGroupRow{
  display:flex;align-items:center;gap:12px;min-width:0;height:24px;
  box-sizing:border-box;padding:0 8px;border-radius:6px;
  cursor:pointer;user-select:none;outline:none;
  font-size:14px;line-height:24px;position:relative;overflow:hidden;
}
.dshToolGroupRow:hover,
.dshToolGroupRow:focus-visible{
  background:var(--dsw-alias-interactive-bg-hover);
}
.dshToolGroupRow[data-state=running]:after{
  content:"";inset-block:0;pointer-events:none;width:300px;
  background:linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent) 55%, transparent 100%);
  animation:2.6s ease-out infinite dshToolGroup-reasoning-sweep;
  position:absolute;left:0;
}
.dshToolGroupLeft{
  display:flex;align-items:center;gap:6px;min-width:0;flex:1 1 auto;overflow:hidden;
}
.dshToolGroupLiveIcon{color:var(--dsw-alias-label-secondary);flex:none;display:inline-flex}
.dshToolGroupLiveTitle{
  color:var(--dsw-alias-label-secondary);flex:none;
  white-space:nowrap;font-size:14px;line-height:24px;
}
.dshToolGroupLiveSep{
  background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;
  width:2px;height:2px;margin:0 4px;
}
.dshToolGroupLiveSummary{
  min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;
  white-space:nowrap;flex:auto;font-size:14px;line-height:24px;overflow:hidden;
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
.dshToolGroupItems{
  display:flex;flex-direction:column;gap:16px;margin-top:16px;
}
.dshToolGroupThink{flex-direction:column;display:flex}
.dshToolGroupThinkRow{position:relative;overflow:hidden}
.dshToolGroupThink[data-state=running] .dshToolGroupThinkRow:after{
  content:"";inset-block:0;
  background:linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent) 55%, transparent 100%);
  pointer-events:none;width:300px;
  animation:2.6s ease-out infinite dshToolGroup-reasoning-sweep;
  position:absolute;left:0;
}
@keyframes dshToolGroup-reasoning-sweep{0%{left:-300px}90%,to{left:100%}}
.dshToolGroupThinkLeading{flex-shrink:0}
.dshToolGroupThinkChevron{color:var(--dsw-alias-label-secondary)}
.dshToolGroupThinkTitle{font-weight:400}
.dshToolGroupThinkSeparator{
  background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;
  width:2px;height:2px;margin:0 8px;
}
.dshToolGroupThinkSummary{
  min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;
  white-space:nowrap;flex:auto;font-size:14px;line-height:24px;overflow:hidden;
}
.dshToolGroupThinkSummary[data-follow-end]{text-overflow:clip}
.dshToolGroupThinkBody{
  color:var(--dsw-alias-label-tertiary);white-space:pre-wrap;word-break:break-word;
  padding:4px 0 4px 22px;font-size:14px;line-height:24px;
}
.dshToolGroupVisuallyHidden{
  clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;
  position:absolute;overflow:hidden;
}
@media (prefers-reduced-motion:reduce){
  .dshToolGroupThink[data-state=running] .dshToolGroupThinkRow:after,
  .dshToolGroupRow[data-state=running]:after{animation:none}
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
/* ------------------------------------------------------------------ */
/* User message: product UserStyleBubble replica + 3-line fold.        */
/* ------------------------------------------------------------------ */
.dshUserRow{flex-direction:column;align-items:flex-end;gap:6px;display:flex}
.dshUserStack{flex-direction:column;align-items:flex-end;gap:8px;min-width:0;max-width:min(525px,82%);display:flex}
.dshUserBubble{background:var(--dsw-specific-bubble);max-width:100%;color:var(--dsw-alias-label-primary);border-radius:22px;padding:10px 16px;font-size:16px;line-height:24px}
/* The clamp lives on a PADDING-FREE inner box so every browser renders
   exactly 3 lines and keeps the bubble's 10px bottom gap: max-height:72px
   is 3 × 24px and clips any partial line a legacy line-clamp would show. */
.dshUserBubbleClamp[data-clamped]{
  display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;
  overflow:hidden;max-height:72px;
}
.dshUserRefChip{
  color:var(--dsw-alias-label-primary);white-space:nowrap;vertical-align:baseline;
  background:#6187d838;border-radius:6px;margin:0 2px;padding:0 8px;
  font-size:.85em;line-height:1.6;display:inline-block;
}
.dshUserFoldToggle{
  display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;
  color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:22px;
  background:none;border:none;border-radius:6px;cursor:pointer;outline:none;
  font-family:inherit;user-select:none;
}
.dshUserFoldToggle:not([data-shown]){display:none}
.dshUserFoldToggle:hover,
.dshUserFoldToggle:focus-visible{
  color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover);
}
.dshUserActions{align-items:center;gap:10px;height:28px;display:flex}
.dshUserTime{color:var(--dsw-alias-label-tertiary);white-space:nowrap;padding-right:12px;font-size:14px;line-height:24px}
@media (hover:hover){
  [data-time-hover-root] .dshUserTime{opacity:0;transition:opacity 80ms}
  [data-time-hover-root]:hover .dshUserTime,
  [data-time-hover-root]:focus-within .dshUserTime{opacity:1}
}
.dshUserAction{
  width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;
  background:0 0;border:none;border-radius:28px;justify-content:center;
  align-items:center;padding:6px;display:inline-flex;
}
.dshUserAction:hover{
  background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);
}
`

const STYLE_ID = 'dsh-fold/styles'

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
  tag.setAttribute('data-plugin', 'dsh-fold')
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
