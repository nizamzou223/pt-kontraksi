import React from 'react'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'blue' | 'green' | 'red' | 'yellow' | 'gray' | 'purple' | 'orange'
  className?: string
}

const variantMap: Record<string, string> = {
  blue: 'badge-blue',
  green: 'badge-green',
  red: 'badge-red',
  yellow: 'badge-yellow',
  gray: 'badge-gray',
  purple: 'badge-purple',
  orange: 'bg-orange-100 text-orange-800 badge',
}

const Badge: React.FC<BadgeProps> = ({ children, variant = 'gray', className = '' }) => {
  return (
    <span className={`${variantMap[variant] ?? 'badge-gray'} ${className}`}>
      {children}
    </span>
  )
}

export default Badge
