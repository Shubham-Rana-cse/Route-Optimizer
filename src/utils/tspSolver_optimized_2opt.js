import {
  getDistanceMatrix,
  getPathBetweenPoints,
} from '../services/mapService_optimized'

// Calculate distance matrix between all locations using OSRM's table service
async function calculateDistanceMatrix(locations) {
  if (!Array.isArray(locations) || locations.length === 0) {
    return []
  }

  return await getDistanceMatrix(locations)
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

// Improve a tour using 2-opt local search
function twoOpt(distanceMatrix, order) {
  const n = order.length
  if (n < 4) {
    return order
  }

  const MAX_PASSES = Math.max(50, Math.min(150, 2 * n));

  let passes = 0
  let improved = true
  let bestOrder = [...order]

  while (improved && passes <= MAX_PASSES) {
    improved = false
    passes++

    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = bestOrder[i]
        const b = bestOrder[i + 1]
        const c = bestOrder[j]
        const d = bestOrder[(j + 1) % n]

        if (a === c || b === d) continue

        const currentDist =
          distanceMatrix[a][b] + distanceMatrix[c][d]
        const newDist =
          distanceMatrix[a][c] + distanceMatrix[b][d]

        if (newDist < currentDist) {
          // Reverse the segment between i+1 and j
          const reversed = bestOrder
            .slice(i + 1, j + 1)
            .reverse()
          bestOrder = [
            ...bestOrder.slice(0, i + 1),
            ...reversed,
            ...bestOrder.slice(j + 1),
          ]
          improved = true
        }
      }
    }
  }

  return bestOrder
}

// Recalculate total tour distance for a given order (used after 2-opt)
function calculateTourDistance(distanceMatrix, order) {
  let total = 0
  for (let i = 0; i < order.length; i++) {
    const current = order[i]
    const next = order[(i + 1) % order.length]
    total += distanceMatrix[current][next]
  }
  return total
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
  const { order: initialOrder } = nearestNeighborTSP(distanceMatrix)
  const order = twoOpt(distanceMatrix, initialOrder)
  const distance = calculateTourDistance(distanceMatrix, order)
  const path = await calculateRoutePath(locations, order)

  return { order, distance, path }
}