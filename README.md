# Route Optimizer

A React-based route optimization application that uses OpenStreetMap,
OSRM, and the Nearest Neighbor + 2-opt heuristics to generate efficient
driving routes between multiple locations.

## Key Features

  Interactive Map Interface: Click on the map or search for locations to build your route
  
  Real Road Network Routing: Uses OpenStreetMap's OSRM API for accurate driving distances and paths
  
  Smart Route Optimization: Implements the Nearest Neighbor algorithm to find efficient routes
  
  Mobile-Responsive Design: Fully functional on both desktop and mobile devices
  
  Visual Route Display: Color-coded route segments with directional arrows
  
  Location Management: Easy-to-use interface for adding, removing, and organizing destinations

## Technology Stack

  Frontend: React 18
  
  Mapping: Leaflet and React-Leaflet for interactive maps
  
  Styling: Tailwind CSS for responsive design
  
  Animations: Framer Motion for smooth user interactions
  
  APIs: OpenStreetMap Nominatim for geocoding, OSRM for routing
  
  Build Tool: Vite for fast development and optimized builds

## Use Cases

  Perfect for delivery route planning, travel itinerary optimization, sales territory management, or any scenario requiring efficient multi-stop routing. The application provides practical solutions for real-world logistics challenges while maintaining an intuitive user experience.

  The project demonstrates advanced web development concepts including API integration, algorithmic problem-solving, responsive design, and modern React patterns.

## How the system works

The route calculation pipeline is:

``` text
User-selected locations
        ↓
OSRM /table API
        ↓
Complete road-distance matrix
        ↓
Nearest Neighbor
        ↓
Initial TSP tour
        ↓
2-opt local search
        ↓
Improved tour
        ↓
OSRM /route API
        ↓
Road geometry
        ↓
Leaflet map
```

## Optimization History

### 1. Original matrix calculation

The original approach calculated the distance matrix using separate OSRM
road-distance requests for individual location pairs.

For `n` locations, this resulted in approximately:

-   **O(n²) distance API calls**
-   **O(n²) distance values**
-   Network latency and HTTP overhead became the main bottleneck.

The Nearest Neighbor algorithm itself was already fast compared with the
API calls.

### 2. OSRM `/table` optimization

The matrix calculation was changed to use OSRM's `/table` service.

Instead of requesting each pair separately, all coordinates are sent in
**one HTTP request**:

``` text
n locations
    ↓
1 OSRM /table request
    ↓
n × n road-distance matrix
```

This changes the network-request cost from approximately **O(n²)
requests to 1 request**, while the returned matrix is still **O(n²)** in
size.

The matrix contains road-network driving distances rather than
straight-line distances.

A Haversine calculation is retained only as a fallback for unavailable
routes or a failed OSRM request.

### 3. Nearest Neighbor

The distance matrix is processed locally by the Nearest Neighbor
heuristic.

Starting from location `0`, the algorithm repeatedly selects the closest
unvisited location.

-   Time: **O(n²)**
-   Additional space: **O(n)**
-   Very fast in practice; current measurements are under approximately
    2 ms for `n = 100` for the NN computation itself.

NN provides the initial tour but can make greedy decisions that lead to
inefficient later segments.

### 4. 2-opt improvement

2-opt was added after Nearest Neighbor.

It examines pairs of edges in the current tour and checks whether
reconnecting them differently reduces the total distance. When an
improvement is found, the affected section of the tour is reversed.

``` text
Nearest Neighbor
       ↓
Initial tour
       ↓
     2-opt
       ↓
Improved tour
```

2-opt does not make additional distance-matrix API calls. It uses the
matrix already returned by OSRM.

For the current implementation:

-   One 2-opt pass: **O(n²)**
-   Repeated until no improvement remains: **O(k · n²)**, where `k` is
    the number of improvement passes
-   Additional working space: **O(n)**
-   Overall matrix-dominated space complexity remains **O(n²)**.

The final tour distance is recalculated from the existing matrix after
2-opt.

To be at safer side I have used ```MAX_PASSES = Math.max(50, Math.min(150, 2 * n));```
This is deliberately not a tight limit. It gives 2-opt plenty of opportunity to improve while preventing an unexpectedly long optimization phase.

### 5. Exact TSP with Held-Karp

Held-Karp was added as an exact TSP solver for small numbers of locations.

The current optimization pipeline is:

```text
OSRM /table
     ↓
Distance Matrix
     ↓
Nearest Neighbor
     ↓
2-opt
     ↓
Heuristic Solution
     ↓
Held-Karp (small n only)
     ↓
Best available solution
```

Held-Karp guarantees the optimal TSP tour but has exponential complexity:

Time: O(n² · 2ⁿ)
Space: O(n · 2ⁿ)

Because of this, it is only used for small inputs. The current intended limit is n ≤ 20. For larger inputs, the system uses the Nearest Neighbor + 2-opt solution.

This gives the application two modes:

Small trips: Exact optimization using Held-Karp.
Larger trips: Fast heuristic optimization using Nearest Neighbor + 2-opt.

The distance matrix is still obtained through a single OSRM /table request, so adding Held-Karp does not introduce additional OSRM matrix API calls. It only increases local CPU and memory usage when the exact solver is executed.

Held-Karp is therefore deliberately restricted to small instances, while Nearest Neighbor + 2-opt remains the scalable approach for larger routes.

## Current Scenario

The current implementation has removed the original **O(n²) HTTP-request
bottleneck** for matrix generation.

The main route-calculation flow is now:

```text
1 × OSRM /table request
        +
O(n²) local Nearest Neighbor
        +
O(k · n²) 2-opt
        +
O(n² · 2ⁿ) Held-Karp for small n
        +
O(n) OSRM /route requests for final route geometry
```

Held-Karp is used only for small inputs (n ≤ 20) to obtain the exact
optimal TSP solution. For larger inputs, the system relies on the
Nearest Neighbor + 2-opt heuristic solution.


### Complexity summary
---

| Component | Complexity |
|---|---|
| Distance matrix size | O(n²) |
| Matrix HTTP requests | **O(1)** |
| Nearest Neighbor | O(n²) |
| 2-opt | O(p · n³) |
| Held-Karp | O(n² · 2ⁿ) |
| 2-opt auxiliary space | O(n) |
| Held-Karp space | O(n · 2ⁿ) |
| Overall matrix/local algorithm space | **O(n²)** |
| Final route geometry requests | O(n) |

NOTE:  For large inputs where Held-Karp is not executed. When Held-Karp is
used, its O(n · 2ⁿ) memory requirement dominates.

NOTE: O(p · n³) is now O(n³) since I have hardcoded the max value for p i.e. the maximum number of passes

The key optimization is therefore not that the distance matrix became
smaller---it did not. The improvement is that the complete road-distance
matrix is obtained through **one OSRM `/table` request**, eliminating
the previous quadratic number of HTTP requests.

## Current Strengths

-   Real road-network distances from OSRM.
-   One request for the complete distance matrix.
-   Fast local route construction.
-   2-opt improves the greedy Nearest Neighbor solution.
-   Held-Karp provides an exact optimal solution for small trips.
-   No additional OSRM requests are needed while testing 2-opt moves.
-   Final route geometry is generated from OSRM and displayed using
    Leaflet.

## Current Limitation

Held-Karp has exponential time and space complexity, so it is restricted
to small inputs (n ≤ 20). For larger inputs, the scalable
Nearest Neighbor + 2-opt approach is used.

The final route visualization still requests road geometry separately
for each consecutive pair in the selected tour. Therefore, after
optimization, there are still approximately `n` OSRM `/route` requests.

The current system is therefore optimized primarily around
**distance-matrix generation and TSP computation**, while route-geometry
retrieval remains the next potential network optimization.