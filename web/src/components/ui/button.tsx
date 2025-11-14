"use client"
import * as React from 'react'
import MuiButton, { ButtonProps as MuiButtonProps } from '@mui/material/Button'

export type ButtonProps = MuiButtonProps

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => (
  <MuiButton ref={ref} {...props} />
))
Button.displayName = 'Button'
