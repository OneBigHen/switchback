import { describe, expect, it, vi } from "vitest"

describe("Pennsylvania unpaved-road provider", () => {
  it("queries a bounded route corridor with one server-side POST", async () => {
    const { fetchPaUnpavedRoadsNearRoutes } = await import("@/lib/roads/pa-unpaved")
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ type: "FeatureCollection", features: [] })
    )

    await fetchPaUnpavedRoadsNearRoutes(
      {
        paths: [
          [[-76.8867, 40.2732], [-76.7, 40.4], [-76.1911, 40.6334]],
          [[-76.88, 40.28], [-76.6, 40.5], [-76.2, 40.63]]
        ],
        bufferMeters: 50,
        limit: 900
      },
      { fetcher, cache: false }
    )

    expect(fetcher).toHaveBeenCalledOnce()
    const [input, init] = fetcher.mock.calls[0]
    expect(String(input)).toBe(
      "https://mapservices.pasda.psu.edu/server/rest/services/pasda/DEP/MapServer/33/query"
    )
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        accept: "application/geo+json, application/json",
        "content-type": "application/x-www-form-urlencoded"
      }
    })
    const body = new URLSearchParams(String(init?.body))
    expect(Object.fromEntries(body)).toMatchObject({
      f: "geojson",
      where: "1=1",
      geometryType: "esriGeometryPolyline",
      spatialRel: "esriSpatialRelIntersects",
      inSR: "4326",
      outSR: "4326",
      distance: "50",
      units: "esriSRUnit_Meter",
      outFields: "OBJECTID,LENGTH,COUNTY",
      returnGeometry: "true",
      orderByFields: "OBJECTID ASC",
      resultRecordCount: "500"
    })
    expect(JSON.parse(body.get("geometry") ?? "null")).toEqual({
      paths: [
        [[-76.8867, 40.2732], [-76.7, 40.4], [-76.1911, 40.6334]],
        [[-76.88, 40.28], [-76.6, 40.5], [-76.2, 40.63]]
      ],
      spatialReference: { wkid: 4326 }
    })
  })

  it("simplifies and caps each submitted corridor path", async () => {
    const {
      fetchPaUnpavedRoadsNearRoutes,
      PA_UNPAVED_ROADS_MAX_CORRIDOR_POINTS
    } = await import("@/lib/roads/pa-unpaved")
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ type: "FeatureCollection", features: [] })
    )
    const path = Array.from({ length: 1_001 }, (_, index) => [
      -77 + index * 0.0001,
      40 + (index % 2) * 0.0003
    ] as [number, number])
    const straightPath = Array.from({ length: 501 }, (_, index) => [
      -77 + index * 0.0001,
      40
    ] as [number, number])

    await fetchPaUnpavedRoadsNearRoutes(
      { paths: [path, straightPath] },
      { fetcher, cache: false }
    )

    const body = new URLSearchParams(String(fetcher.mock.calls[0][1]?.body))
    const geometry = JSON.parse(body.get("geometry") ?? "null") as {
      paths: [number, number][][]
    }
    expect(PA_UNPAVED_ROADS_MAX_CORRIDOR_POINTS).toBe(200)
    expect(geometry.paths[0].length).toBeLessThanOrEqual(
      PA_UNPAVED_ROADS_MAX_CORRIDOR_POINTS
    )
    expect(geometry.paths[0][0]).toEqual(path[0])
    expect(geometry.paths[0].at(-1)).toEqual(path.at(-1))
    expect(geometry.paths[1]).toEqual([straightPath[0], straightPath.at(-1)])
  })

  it("rejects malformed corridor parameters before contacting PASDA", async () => {
    const { fetchPaUnpavedRoadsNearRoutes } = await import("@/lib/roads/pa-unpaved")
    const fetcher = vi.fn<typeof fetch>()

    await expect(fetchPaUnpavedRoadsNearRoutes(
      {
        paths: [[[-76.9, 40.2], [-76.8, 40.3]]],
        bufferMeters: Number.NaN
      },
      { fetcher, cache: false }
    )).rejects.toMatchObject({
      code: "INVALID_PA_UNPAVED_ROAD_CORRIDOR",
      status: 400,
      message: "Use one to four valid route geometries."
    })

    expect(fetcher).not.toHaveBeenCalled()
  })

  it("aborts a stalled route-corridor query with a typed provider failure", async () => {
    vi.useFakeTimers()
    try {
      const {
        fetchPaUnpavedRoadsNearRoutes,
        PA_UNPAVED_ROADS_CORRIDOR_TIMEOUT_MS
      } = await import("@/lib/roads/pa-unpaved")
      let providerSignal: AbortSignal | undefined
      const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
        providerSignal = init?.signal as AbortSignal | undefined
        if (!providerSignal) {
          return Response.json({ type: "FeatureCollection", features: [] })
        }
        return await new Promise<Response>((_resolve, reject) => {
          providerSignal?.addEventListener("abort", () => reject(new Error("private timeout")))
        })
      })

      const pending = fetchPaUnpavedRoadsNearRoutes(
        { paths: [[[-76.9, 40.2], [-76.8, 40.3]]] },
        { fetcher, timeoutMs: 250, cache: false }
      )
      expect(PA_UNPAVED_ROADS_CORRIDOR_TIMEOUT_MS).toBe(1_500)
      expect(providerSignal).toBeInstanceOf(AbortSignal)
      const assertion = expect(pending).rejects.toMatchObject({
        code: "PA_UNPAVED_ROADS_UNAVAILABLE",
        status: 503,
        message: "Official Pennsylvania unpaved-road data is temporarily unavailable."
      })

      await vi.advanceTimersByTimeAsync(250)
      await assertion
      expect(providerSignal?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it("coalesces identical in-flight corridor queries", async () => {
    const { fetchPaUnpavedRoadsNearRoutes } = await import("@/lib/roads/pa-unpaved")
    let release: ((response: Response) => void) | undefined
    const fetcher = vi.fn<typeof fetch>(async () =>
      await new Promise<Response>((resolve) => {
        release = resolve
      })
    )
    const query = {
      paths: [[[-76.54321, 40.12345], [-76.4321, 40.23456]]] as [number, number][][]
    }

    const first = fetchPaUnpavedRoadsNearRoutes(query, { fetcher, cache: true })
    const second = fetchPaUnpavedRoadsNearRoutes(query, { fetcher, cache: true })

    expect(fetcher).toHaveBeenCalledOnce()
    release?.(Response.json({ type: "FeatureCollection", features: [] }))
    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(secondResult).toEqual(firstResult)
  })

  it("does not retain a truncated corridor response in the success cache", async () => {
    const { fetchPaUnpavedRoadsNearRoutes } = await import("@/lib/roads/pa-unpaved")
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        type: "FeatureCollection",
        exceededTransferLimit: true,
        features: []
      })
    )
    const query = {
      paths: [[[-76.65432, 40.34567], [-76.54321, 40.45678]]] as [number, number][][]
    }

    await fetchPaUnpavedRoadsNearRoutes(query, { fetcher, cache: true })
    await fetchPaUnpavedRoadsNearRoutes(query, { fetcher, cache: true })

    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("queries the official PASDA layer with a bounded WGS84 envelope", async () => {
    const { fetchPaUnpavedRoads } = await import("@/lib/roads/pa-unpaved")
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ type: "FeatureCollection", features: [] })
    )

    const collection = await fetchPaUnpavedRoads(
      {
        bounds: { south: 40, west: -77.2, north: 40.5, east: -76.6 },
        limit: 200
      },
      { fetcher }
    )

    expect(fetcher).toHaveBeenCalledOnce()
    const [input, init] = fetcher.mock.calls[0]
    const url = new URL(String(input))
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://mapservices.pasda.psu.edu/server/rest/services/pasda/DEP/MapServer/33/query"
    )
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      f: "geojson",
      where: "1=1",
      geometry: "-77.2,40,-76.6,40.5",
      geometryType: "esriGeometryEnvelope",
      spatialRel: "esriSpatialRelIntersects",
      inSR: "4326",
      outSR: "4326",
      outFields: "OBJECTID,LENGTH,COUNTY",
      returnGeometry: "true",
      orderByFields: "OBJECTID ASC",
      resultRecordCount: "200"
    })
    expect(init).toMatchObject({
      headers: { accept: "application/geo+json, application/json" }
    })
    expect(collection).toMatchObject({ type: "FeatureCollection", features: [] })
  })

  it("rejects invalid or state-sized envelopes before contacting PASDA", async () => {
    const { fetchPaUnpavedRoads } = await import("@/lib/roads/pa-unpaved")
    const fetcher = vi.fn<typeof fetch>()

    for (const bounds of [
      { south: 41, west: -77, north: 40, east: -76 },
      { south: 40, west: -181, north: 40.5, east: -76 },
      { south: 39.7, west: -80.6, north: 42.3, east: -74.7 }
    ]) {
      await expect(
        fetchPaUnpavedRoads({ bounds, limit: 200 }, { fetcher })
      ).rejects.toMatchObject({
        code: "INVALID_PA_UNPAVED_ROAD_QUERY",
        status: 400
      })
    }

    expect(fetcher).not.toHaveBeenCalled()
  })

  it("caps each upstream query at the public feature limit", async () => {
    const {
      fetchPaUnpavedRoads,
      PA_UNPAVED_ROADS_MAX_FEATURES
    } = await import("@/lib/roads/pa-unpaved")
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ type: "FeatureCollection", features: [] })
    )

    await fetchPaUnpavedRoads(
      {
        bounds: { south: 40, west: -77.2, north: 40.5, east: -76.6 },
        limit: 25_000
      },
      { fetcher }
    )

    const url = new URL(String(fetcher.mock.calls[0][0]))
    expect(PA_UNPAVED_ROADS_MAX_FEATURES).toBe(500)
    expect(url.searchParams.get("resultRecordCount")).toBe("500")
  })

  it("normalizes only valid line features into the stable public contract", async () => {
    const { fetchPaUnpavedRoads } = await import("@/lib/roads/pa-unpaved")
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        type: "FeatureCollection",
        exceededTransferLimit: true,
        features: [
          {
            type: "Feature",
            id: 41,
            geometry: {
              type: "LineString",
              coordinates: [[-77.1, 40.1], [-77, 40.2]]
            },
            properties: {
              OBJECTID: 41,
              LENGTH: 1234.5,
              COUNTY: " Cumberland ",
              SHAPE_Length: 0.1,
              secret: "must not escape"
            }
          },
          {
            type: "Feature",
            geometry: {
              type: "MultiLineString",
              coordinates: [
                [[-76.9, 40.2], [-76.8, 40.3]],
                [[-76.8, 40.3], [-76.7, 40.4]]
              ]
            },
            properties: { OBJECTID: 42, LENGTH: -1, COUNTY: "" }
          },
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-77, 40] },
            properties: { OBJECTID: 43, COUNTY: "York" }
          }
        ]
      })
    )

    const collection = await fetchPaUnpavedRoads(
      {
        bounds: { south: 40, west: -77.2, north: 40.5, east: -76.6 },
        limit: 10
      },
      { fetcher }
    )

    expect(collection).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "pa-unpaved-41",
          geometry: {
            type: "LineString",
            coordinates: [[-77.1, 40.1], [-77, 40.2]]
          },
          properties: {
            id: "pa-unpaved-41",
            county: "Cumberland",
            lengthMeters: 1234.5,
            source: "Pennsylvania Department of Environmental Protection",
            dataset: "Unpaved Roads 2009_07"
          }
        },
        {
          type: "Feature",
          id: "pa-unpaved-42",
          geometry: {
            type: "MultiLineString",
            coordinates: [
              [[-76.9, 40.2], [-76.8, 40.3]],
              [[-76.8, 40.3], [-76.7, 40.4]]
            ]
          },
          properties: {
            id: "pa-unpaved-42",
            county: null,
            lengthMeters: null,
            source: "Pennsylvania Department of Environmental Protection",
            dataset: "Unpaved Roads 2009_07"
          }
        }
      ],
      metadata: {
        count: 2,
        limit: 10,
        truncated: true,
        source: "Pennsylvania Department of Environmental Protection",
        dataset: "Unpaved Roads 2009_07"
      }
    })
  })

  it("aborts stalled PASDA requests after the server timeout", async () => {
    vi.useFakeTimers()
    try {
      const { fetchPaUnpavedRoads } = await import("@/lib/roads/pa-unpaved")
      const providerSignals: AbortSignal[] = []
      const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
        const providerSignal = init?.signal as AbortSignal
        providerSignals.push(providerSignal)
        return await new Promise<Response>((_resolve, reject) => {
          providerSignal.addEventListener("abort", () => reject(new Error("provider internals")))
        })
      })

      const pending = fetchPaUnpavedRoads(
        {
          bounds: { south: 40, west: -77.2, north: 40.5, east: -76.6 },
          limit: 100
        },
        { fetcher, timeoutMs: 250 }
      )
      const assertion = expect(pending).rejects.toMatchObject({
        code: "PA_UNPAVED_ROADS_UNAVAILABLE",
        status: 503,
        message: "Official Pennsylvania unpaved-road data is temporarily unavailable."
      })

      await vi.advanceTimersByTimeAsync(250)
      await assertion
      expect(providerSignals[0]?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it("redacts upstream status bodies from provider failures", async () => {
    const { fetchPaUnpavedRoads } = await import("@/lib/roads/pa-unpaved")
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response("database host and credentials", { status: 500 })
    )

    await expect(
      fetchPaUnpavedRoads(
        {
          bounds: { south: 40, west: -77.2, north: 40.5, east: -76.6 },
          limit: 100
        },
        { fetcher }
      )
    ).rejects.toEqual(expect.objectContaining({
      code: "PA_UNPAVED_ROADS_UNAVAILABLE",
      status: 503,
      message: "Official Pennsylvania unpaved-road data is temporarily unavailable."
    }))
  })

  it("rejects malformed ArcGIS payloads without exposing provider details", async () => {
    const { fetchPaUnpavedRoads } = await import("@/lib/roads/pa-unpaved")
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ error: { message: "SQL connection string" } })
    )

    await expect(
      fetchPaUnpavedRoads(
        {
          bounds: { south: 40, west: -77.2, north: 40.5, east: -76.6 },
          limit: 100
        },
        { fetcher }
      )
    ).rejects.toMatchObject({
      code: "PA_UNPAVED_ROADS_UNAVAILABLE",
      status: 503,
      message: "Official Pennsylvania unpaved-road data is temporarily unavailable."
    })
  })
})
