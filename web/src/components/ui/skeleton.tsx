"use client"
import * as React from 'react'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={
        'relative overflow-hidden rounded-md bg-gray-200 ' +
        (className || '')
      }
      style={{ backgroundImage: 'linear-gradient(90deg, rgba(0,0,0,0.05) 25%, rgba(0,0,0,0.1) 37%, rgba(0,0,0,0.05) 63%)', backgroundSize: '400% 100%', animation: 'shimmer 1.2s linear infinite' }}
    />
  )
}

