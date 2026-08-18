// Icon stubs for node-based component tests (the real icons are tiny svg
// components; the component under test only needs them to render).
import React from 'react'
function Icon({ size = 14, className }) {
  return React.createElement('svg', { width: size, height: size, className, 'data-icon': 'true' })
}
export const IconChevronRightOutline14 = Icon
export const IconChevronDownOutline14 = Icon
