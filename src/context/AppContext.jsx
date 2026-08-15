import { createContext, useState, useContext } from 'react'
import { calculateOptimalRoute } from '../utils/tspSolver_optimized_2opt'

const AppContext = createContext(undefined)

export const useAppContext = () => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider')
  }
  return context
}

export const AppProvider = ({ children }) => {
  const [locations, setLocations] = useState([])
  const [optimizedRoute, setOptimizedRoute] = useState(null)
  const [isCalculating, setIsCalculating] = useState(false)
  const [selectedLocationIndex, setSelectedLocationIndex] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const addLocation = (location) => {
    const newLocation = {
      ...location,
      id: Date.now().toString(),
    }

    setLocations((prev) => [...prev, newLocation])
    setOptimizedRoute(null)
  }

  const removeLocation = (id) => {
    setLocations((prev) => prev.filter((loc) => loc.id !== id))
    setOptimizedRoute(null)
  }

  const clearLocations = () => {
    setLocations([])
    setOptimizedRoute(null)
  }

  const calculateRoute = async () => {
    if (locations.length < 2) return

    setIsCalculating(true)
    try {
      const route = await calculateOptimalRoute(locations)
      setOptimizedRoute(route)
    } catch (error) {
      console.error('Error calculating route:', error)
    } finally {
      setIsCalculating(false)
    }
  }

  const selectLocation = (index) => {
    setSelectedLocationIndex(index)
  }

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev)
  }

  return (
    <AppContext.Provider
      value={{
        locations,
        selectedLocationIndex,
        optimizedRoute,
        isCalculating,
        searchQuery,
        isSidebarOpen,
        setSearchQuery,
        addLocation,
        removeLocation,
        clearLocations,
        calculateRoute,
        selectLocation,
        toggleSidebar,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}
