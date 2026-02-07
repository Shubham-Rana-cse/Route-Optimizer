import {
  calculateRoadDistance,
  getPathBetweenPoints,
} from '../services/mapService'

// Calculate distance matrix between all locations using road distances
async function calculateDistanceMatrix(locations) {
  if (!Array.isArray(locations) || locations.length === 0) {
    return []
  }

  const n = locations.length
  const distanceMatrix = []

  for (let i = 0; i < n; i++) {
    distanceMatrix[i] = []
    for (let j = 0; j < n; j++) {
      if (i === j) {
        distanceMatrix[i][j] = 0
      } else {
        distanceMatrix[i][j] = await calculateRoadDistance(
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

// Nearest neighbor algorithm (simple TSP heuristic)
function nearestNeighborTSP(distanceMatrix) {
  if (!Array.isArray(distanceMatrix) || distanceMatrix.length === 0) {
    return { order: [], distance: 0 }
  }

  const n = distanceMatrix.length
  const visited = new Array(n).fill(false)
  const path = []
  let totalDistance = 0

  let current = 0
  path.push(current)
  visited[current] = true

  for (let i = 1; i < n; i++) {
    let nearest = -1
    let minDistance = Infinity

    for (let j = 0; j < n; j++) {
      if (!visited[j] && distanceMatrix[current][j] < minDistance) {
        nearest = j
        minDistance = distanceMatrix[current][j]
      }
    }

    if (nearest !== -1) {
      path.push(nearest)
      visited[nearest] = true
      totalDistance += minDistance
      current = nearest
    }
  }

  if (n > 1) {
    totalDistance += distanceMatrix[current][0]
  }

  return { order: path, distance: totalDistance }
}

// Calculate the full route path using road network
async function calculateRoutePath(locations, order) {
  const path = []

  for (let i = 0; i < order.length; i++) {
    const current = order[i]
    const next = i < order.length - 1 ? order[i + 1] : order[0]

    const segmentPath = await getPathBetweenPoints(
      locations[current].lat,
      locations[current].lng,
      locations[next].lat,
      locations[next].lng
    )

    if (i < order.length - 1) {
      path.push(...segmentPath.slice(0, -1))
    } else {
      path.push(...segmentPath)
    }
  }

  return path
}

// Main function to calculate the optimal route
export async function calculateOptimalRoute(locations) {
  if (!Array.isArray(locations) || locations.length < 2) {
    return { order: [], distance: 0, path: [] }
  }

  const distanceMatrix = await calculateDistanceMatrix(locations)
  const { order, distance } = nearestNeighborTSP(distanceMatrix)
  const path = await calculateRoutePath(locations, order)

  return { order, distance, path }
}
