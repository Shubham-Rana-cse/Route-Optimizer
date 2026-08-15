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

// Held-Karp exact TSP (dynamic programming, O(n^2 * 2^n))
// Only feasible for small n — caller must guard against large inputs
function heldKarp(distanceMatrix) {
  const n = distanceMatrix.length
  if (n < 2) return { order: n === 1 ? [0] : [], distance: 0 }
  if (n === 2) return { order: [0, 1], distance: distanceMatrix[0][1] + distanceMatrix[1][0] }

  const numSubsets = 1 << n
  // dp[mask][i] = min cost to start at 0, visit all nodes in mask, end at i
  const dp = Array.from({ length: numSubsets }, () => new Array(n).fill(Infinity))
  const parent = Array.from({ length: numSubsets }, () => new Array(n).fill(-1))

  dp[1 << 0][0] = 0 // starting at node 0, only node 0 visited

  for (let mask = 1; mask < numSubsets; mask++) {
    if (!(mask & 1)) continue // node 0 must always be in the visited set

    for (let last = 0; last < n; last++) {
      if (!(mask & (1 << last))) continue
      const currentCost = dp[mask][last]
      if (currentCost === Infinity) continue

      for (let next = 0; next < n; next++) {
        if (mask & (1 << next)) continue // already visited

        const nextMask = mask | (1 << next)
        const newCost = currentCost + distanceMatrix[last][next]

        if (newCost < dp[nextMask][next]) {
          dp[nextMask][next] = newCost
          parent[nextMask][next] = last
        }
      }
    }
  }

  const fullMask = numSubsets - 1
  let bestLast = -1
  let bestCost = Infinity

  for (let last = 1; last < n; last++) {
    const cost = dp[fullMask][last] + distanceMatrix[last][0]
    if (cost < bestCost) {
      bestCost = cost
      bestLast = last
    }
  }

  // Reconstruct path
  const order = []
  let mask = fullMask
  let curr = bestLast
  while (curr !== -1) {
    order.unshift(curr)
    const prevNode = parent[mask][curr]
    mask ^= (1 << curr)
    curr = prevNode
  }

  return { order, distance: bestCost }
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

const HELD_KARP_MAX_N = 20 // grows to billions of ops beyond this — keep it small  //program crashes after this

export async function calculateOptimalRoute(locations) {
  if (!Array.isArray(locations) || locations.length < 2) {
    return { order: [], distance: 0, path: [] }
  }

  const distanceMatrix = await calculateDistanceMatrix(locations)
  const n = locations.length

  const { order: nnOrder } = nearestNeighborTSP(distanceMatrix)
  const heuristicOrder = twoOpt(distanceMatrix, nnOrder)
  const heuristicDistance = calculateTourDistance(distanceMatrix, heuristicOrder)

  let order = heuristicOrder
  let distance = heuristicDistance

  if (n <= HELD_KARP_MAX_N) {
    const { order: exactOrder, distance: exactDistance } = heldKarp(distanceMatrix)
    if (exactDistance < distance) {
      order = exactOrder
      distance = exactDistance
    }
  }

  const path = await calculateRoutePath(locations, order)

  return { order, distance, path }
}