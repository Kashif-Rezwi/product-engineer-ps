'use client';

import React from 'react';

interface SpinnerProps {
  className?: string;
  /** Track + head colors of the ring, e.g. "border-sand border-t-claret". */
  trackClassName?: string;
}

// Warm tactile loading spinner used across loading states and inline buttons.
export function Spinner({
  className = 'w-5 h-5',
  trackClassName = 'border-sand border-t-claret',
}: SpinnerProps) {
  return (
    <span
      className={`${className} block rounded-full border-2 ${trackClassName} animate-spin`}
      aria-hidden="true"
    />
  );
}
