import React from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  title?: string
  subtitle?: string
  actions?: React.ReactNode
  noPadding?: boolean
}

const Card: React.FC<CardProps> = ({ children, className = '', title, subtitle, actions, noPadding }) => {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 ${noPadding ? '' : 'p-6'} ${className}`}>
      {(title || actions) && (
        <div className={`flex items-start justify-between ${noPadding ? 'px-6 pt-5 pb-4' : 'mb-4'}`}>
          <div>
            {title && <h3 className="text-base font-semibold text-gray-900">{title}</h3>}
            {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

export default Card
