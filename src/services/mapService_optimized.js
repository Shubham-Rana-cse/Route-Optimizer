import axios from 'axios'

// Calculate distance matrix for all locations using OSRM's /table/ service (single request)
export async function getDistanceMatrix(locations) {
  const n = locations.length

  if (n === 0) return []
  if (n === 1) return [[0]]
  
  // OSRM expects coordinates as lng,lat, separated by semicolons
  const coordinateString = locations
    .map((loc) => `${loc.lng},${loc.lat}`)
    .join(';')

  try {
    const response = await axios.get(
      `https://router.project-osrm.org/table/v1/driving/${coordinateString}`,
      {
        params: {
          annotations: 'distance',
        },
      }
    )

    if (response.data.code !== 'Ok' || !response.data.distances) {
      throw new Error(`OSRM table error: ${response.data.code}`)
    }

    const distanceMatrix = response.data.distances

    // OSRM returns null for unreachable pairs (islands, disconnected roads)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (distanceMatrix[i][j] === null) {
          distanceMatrix[i][j] = calculateStraightDistance(
            locations[i].lat,
            locations[i].lng,
            locations[j].lat,
            locations[j].lng
          )
        }
      }
    }

    return distanceMatrix
  }
  catch (error) {
    console.error('Error calculating distance matrix, falling back to Haversine:', error)
    // Full fallback: build matrix using straight-line distance for every pair
    const fallbackMatrix = []
    for (let i = 0; i < n; i++) {
      fallbackMatrix[i] = []
      for (let j = 0; j < n; j++) {
        fallbackMatrix[i][j] =
          i === j
            ? 0
            : calculateStraightDistance(
                locations[i].lat,
                locations[i].lng,
                locations[j].lat,
                locations[j].lng
              )
      }
    }
    return fallbackMatrix
  }
}

// Search for locations using OpenStreetMap Nominatim API
export async function searchLocations(query) {
  try {
    const response = await axios.get(
      'https://nominatim.openstreetmap.org/search',
      {
        params: {
          q: query,
          format: 'json',
          limit: 5,
          countrycodes: 'in', // India country code
          viewbox: '76.8,28.4,77.6,28.8', // Delhi approximate bounding box    //for whole india -> 68.0, 8.0, 97.5, 37.5
          bounded: 1,
        },
        headers: {
          'User-Agent': 'Travel Route Optimizer App',
        },
      }
    )

    return response.data.map((item) => ({
      name: item.display_name.split(',').slice(0, 3).join(','), // Simplify display name
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    }))
  } catch (error) {
    console.error('Error searching locations:', error)
    return []
  }
}

// Calculate the road distance between two points using OSRM
export async function calculateRoadDistance(
  lat1,
  lon1,
  lat2,
  lon2
) {
  try {
    const response = await axios.get(
      `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`
    )

    if (response.data.routes && response.data.routes.length > 0) {
      return response.data.routes[0].distance // meters
    }

    throw new Error('No route found')
  } catch (error) {
    console.error('Error calculating road distance:', error)
    // Fallback to straight-line distance if road routing fails
    return calculateStraightDistance(lat1, lon1, lat2, lon2)
  }
}

// Fallback straight-line distance calculation (Haversine)
export function calculateStraightDistance(
  lat1,
  lon1,
  lat2,
  lon2
) {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) *
      Math.cos(φ2) *
      Math.sin(Δλ / 2) *
      Math.sin(Δλ / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

// Get the road path between two points using OSRM
export async function getPathBetweenPoints(
  lat1,
  lon1,
  lat2,
  lon2
) {
  try {
    const response = await axios.get(
      `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`
    )

    if (response.data.routes && response.data.routes.length > 0) {
      // Convert GeoJSON coordinates to [lat, lng] pairs
      return response.data.routes[0].geometry.coordinates.map(
        (coord) => [coord[1], coord[0]]
      )
    }

    throw new Error('No route found')
  } catch (error) {
    console.error('Error getting road path:', error)
    // Fallback to straight line if road routing fails
    return [
      [lat1, lon1],
      [lat2, lon2],
    ]
  }
}
