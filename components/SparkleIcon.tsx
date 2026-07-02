import React from 'react'

export function SparkleIcon({ className, strokeWidth = 2 }: { className?: string, strokeWidth?: number | string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="currentColor" 
      stroke="currentColor" 
      strokeWidth={strokeWidth} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M12 2C12 2 13 8 16 10C19 12 22 12 22 12C22 12 16 13 14 16C12 19 12 22 12 22C12 22 11 16 8 14C5 12 2 12 2 12C2 12 8 11 10 8C12 5 12 2 12 2Z" fill="currentColor" stroke="none" />
    </svg>
  )
}
