import { createContext, useContext, useState } from 'react'

const LanguageContext = createContext(null)

const strings = {
  id: {
    profileTitle: 'Profil Saya',
    profileSubtitle: 'Kelola informasi akun Anda',
    accountInfo: 'Informasi Akun',
    projectInfo: 'Proyek Ditugaskan',
    employeeInfo: 'Data Karyawan',
    settings: 'Pengaturan',
    security: 'Keamanan',
    darkMode: 'Tema Gelap',
    darkModeOn: 'Mode gelap aktif',
    darkModeOff: 'Mode terang aktif',
    language: 'Bahasa / Language',
    languageName: 'Indonesia',
    changePassword: 'Ubah Password',
    changePasswordSub: 'Perbarui kata sandi akun Anda',
    logout: 'Keluar dari Sistem',
    fullName: 'Nama Lengkap',
    nik: 'NIK',
    email: 'Email',
    role: 'Role / Jabatan',
    status: 'Status',
    active: 'Aktif',
    inactive: 'Nonaktif',
    department: 'Departemen',
    position: 'Jabatan',
    projectName: 'Nama Proyek',
    projectCode: 'Kode Proyek',
    location: 'Lokasi',
    appVersion: 'Admin Web v1.0.0 · PT Krakatau Indah',
    backToDashboard: 'Kembali ke Dashboard',
    passwordCurrent: 'Password Saat Ini',
    passwordNew: 'Password Baru',
    passwordConfirm: 'Konfirmasi Password Baru',
    save: 'Simpan',
    cancel: 'Batal',
    passwordChanged: 'Password berhasil diubah',
    passwordError: 'Gagal mengubah password',
    passwordMismatch: 'Password baru tidak cocok',
    passwordTooShort: 'Password minimal 8 karakter, huruf & angka',
  },
  en: {
    profileTitle: 'My Profile',
    profileSubtitle: 'Manage your account information',
    accountInfo: 'Account Information',
    projectInfo: 'Assigned Project',
    employeeInfo: 'Employee Data',
    settings: 'Settings',
    security: 'Security',
    darkMode: 'Dark Mode',
    darkModeOn: 'Dark mode enabled',
    darkModeOff: 'Light mode active',
    language: 'Language / Bahasa',
    languageName: 'English',
    changePassword: 'Change Password',
    changePasswordSub: 'Update your account password',
    logout: 'Sign Out',
    fullName: 'Full Name',
    nik: 'Employee ID',
    email: 'Email',
    role: 'Role',
    status: 'Status',
    active: 'Active',
    inactive: 'Inactive',
    department: 'Department',
    position: 'Position',
    projectName: 'Project Name',
    projectCode: 'Project Code',
    location: 'Location',
    appVersion: 'Admin Web v1.0.0 · PT Krakatau Indah',
    backToDashboard: 'Back to Dashboard',
    passwordCurrent: 'Current Password',
    passwordNew: 'New Password',
    passwordConfirm: 'Confirm New Password',
    save: 'Save',
    cancel: 'Cancel',
    passwordChanged: 'Password changed successfully',
    passwordError: 'Failed to change password',
    passwordMismatch: 'New passwords do not match',
    passwordTooShort: 'Password must be at least 8 characters with letters & numbers',
  },
}

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(() => {
    if (typeof window === 'undefined') return 'id'
    return localStorage.getItem('lang_code') || 'id'
  })

  const toggle = () => {
    const next = lang === 'id' ? 'en' : 'id'
    setLang(next)
    if (typeof window !== 'undefined') localStorage.setItem('lang_code', next)
  }

  return (
    <LanguageContext.Provider value={{
      lang, toggle,
      s: strings[lang] || strings.id,
      isEnglish: lang === 'en',
    }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLang = () => {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLang must be within LanguageProvider')
  return ctx
}

export default LanguageContext
