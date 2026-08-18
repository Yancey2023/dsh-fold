/**
 * AutoLoadHost — the shared ref anchor that wires one conversation seat into
 * the scroll-to-top auto-loader.
 *
 * Each shadowed seat (tool-call / assistant-step / user / notice) wraps its
 * output in this component; the first seat of a conversation to mount (and
 * its scroll host) registers the shared scroll listener, the rest share it.
 * When the seat has no session id (tests) or nothing to render, the host
 * renders the children DIRECTLY (no wrapper div), so the production wrapper
 * stays invisible and render tests keep asserting the real seat structure.
 */

import * as React from 'react'
import { attachAutoLoad } from './auto-load'

export interface AutoLoadHostProps {
  sessionId?: string
  hasMore: boolean
  loadingOlder: boolean
  children?: React.ReactNode
}

export const AutoLoadHost = React.memo(function AutoLoadHost({ sessionId, hasMore, loadingOlder, children }: AutoLoadHostProps): React.ReactNode {
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => {
    const el = hostRef.current
    if (el === null || sessionId === undefined) return
    return attachAutoLoad(el, sessionId, hasMore, loadingOlder)
  }, [sessionId, hasMore, loadingOlder])

  if (children === null || children === undefined) return null
  // Without a session scope (render tests) the wrapper is omitted entirely.
  if (sessionId === undefined) return children
  return React.createElement('div', { ref: hostRef, className: 'dshAutoHost', 'data-dsh-autoload': '' }, children)
})
