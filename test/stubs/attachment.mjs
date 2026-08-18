// Stub for node-based tests: the real ImageGallery is a browser component;
// the user wrapper only needs it to render and to receive the right props.
import React from 'react'

export function ImageGallery({ images, align, labels }) {
  return React.createElement(
    'div',
    { 'data-image-gallery': true, 'data-align': align, 'data-image-label': labels ? labels.image : undefined, 'data-count': images.length },
    images.map((image, index) => React.createElement('span', { key: index, 'data-attachment': true })),
  )
}
