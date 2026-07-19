import { useRef, useState, type KeyboardEvent } from "react"

interface UseMapLayerMenuOptions {
  onSaveMapPack(name: string): void
}

export function useMapLayerMenu({ onSaveMapPack }: UseMapLayerMenuOptions) {
  const layerButtonRef = useRef<HTMLButtonElement>(null)
  const [layerMenuOpen, setLayerMenuOpen] = useState(false)
  const [mapPackName, setMapPackName] = useState("")

  const closeLayerMenu = () => setLayerMenuOpen(false)
  const toggleLayerMenu = () => setLayerMenuOpen((open) => !open)

  const handleLayerMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !layerMenuOpen) return
    event.preventDefault()
    event.stopPropagation()
    closeLayerMenu()
    layerButtonRef.current?.focus()
  }

  const saveMapPack = () => {
    if (!mapPackName.trim()) return
    onSaveMapPack(mapPackName)
    setMapPackName("")
  }

  return {
    layerButtonRef,
    layerMenuOpen,
    mapPackName,
    setMapPackName,
    closeLayerMenu,
    toggleLayerMenu,
    handleLayerMenuKeyDown,
    saveMapPack
  }
}
