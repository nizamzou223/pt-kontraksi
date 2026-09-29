import React, { createContext, useContext, useState, useCallback } from 'react'

type NotificationType = 'success' | 'error' | 'warning' | 'info'

interface Notification {
  id: string
  type: NotificationType
  message: string
}

interface NotificationContextType {
  notifications: Notification[]
  showNotification: (type: NotificationType, message: string) => void
  removeNotification: (id: string) => void
  success: (msg: string) => void
  error: (msg: string) => void
  warning: (msg: string) => void
  info: (msg: string) => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([])

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const showNotification = useCallback((type: NotificationType, message: string) => {
    const id = Date.now().toString()
    setNotifications(prev => [...prev, { id, type, message }])
    setTimeout(() => removeNotification(id), 4000)
  }, [removeNotification])

  const success = useCallback((msg: string) => showNotification('success', msg), [showNotification])
  const error = useCallback((msg: string) => showNotification('error', msg), [showNotification])
  const warning = useCallback((msg: string) => showNotification('warning', msg), [showNotification])
  const info = useCallback((msg: string) => showNotification('info', msg), [showNotification])

  return (
    <NotificationContext.Provider value={{ notifications, showNotification, removeNotification, success, error, warning, info }}>
      {children}
      <NotificationStack notifications={notifications} onRemove={removeNotification} />
    </NotificationContext.Provider>
  )
}

const NotificationStack: React.FC<{ notifications: Notification[]; onRemove: (id: string) => void }> = ({ notifications, onRemove }) => {
  if (notifications.length === 0) return null

  const colorMap: Record<NotificationType, string> = {
    success: 'bg-emerald-600',
    error: 'bg-red-600',
    warning: 'bg-amber-500',
    info: 'bg-blue-600',
  }

  const iconMap: Record<NotificationType, string> = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  }

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {notifications.map(n => (
        <div
          key={n.id}
          className={`${colorMap[n.type]} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-in slide-in-from-right duration-300`}
        >
          <span className="font-bold text-lg">{iconMap[n.type]}</span>
          <span className="text-sm flex-1">{n.message}</span>
          <button onClick={() => onRemove(n.id)} className="text-white/70 hover:text-white ml-2 text-lg leading-none">×</button>
        </div>
      ))}
    </div>
  )
}

export const useNotification = () => {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider')
  return ctx
}
