import { useState, useEffect, useCallback } from 'react'
import { SettingsAPI } from '../utils/api'

export interface AppSettings {
  output_screen:  string   // display id as string, '' = none
  logo_media_id:  string   // media id as string, '' = none
  logo_path:      string
  logo_filename:  string
  media_folder:   string
  fade_duration:  string   // ms as string, default '500'
  default_bg_type:  string // 'color' | 'image' | 'video', '' = not set
  default_bg_value: string
}

const DEFAULTS: AppSettings = {
  output_screen: '',
  logo_media_id: '',
  logo_path:     '',
  logo_filename: '',
  media_folder:  '',
  fade_duration: '500',
  default_bg_type:  '',
  default_bg_value: '',
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS)
  const [loaded, setLoaded]     = useState(false)

  useEffect(() => {
    SettingsAPI.getAll().then((raw) => {
      setSettings({ ...DEFAULTS, ...raw } as AppSettings)
      setLoaded(true)
    })
  }, [])

  const set = useCallback(async (key: keyof AppSettings, value: string) => {
    await SettingsAPI.set(key, value)
    setSettings((prev) => ({ ...prev, [key]: value }))
  }, [])

  return { settings, loaded, set }
}
