import { useCallouts }              from './useCallouts.js'
import { useMapLayers }             from './useMapLayers.js'
import { useMapFilters }            from './useMapFilters.js'
import { useMapInit, CENTER, ZOOM } from './useMapInit.js'
import { useMapStore }              from '../stores/useMapStore.js'

export function useMapOrchestrator(mapContainer, filtersGetter) {
  const store = useMapStore()
  let _map = null

  const { visibleCallouts, buildCallouts, updateCalloutPositions, refreshVisibleCallouts }
    = useCallouts(() => _map)

  const { loading, loadError, fromCache, hoverLabel, selectedVia, cachedMunicipios, cachedVias, loadSimeva }
    = useMapLayers(
        () => _map,
        {
          onOptionsLoaded: (opts)  => store.setFilterOptions(opts),
          onStatsLoaded:   (stats) => store.setMapStats(stats),
        },
        { buildCallouts, updateCalloutPositions },
      )

  const { selectedSubregion, selectedMunicipio }
    = useMapFilters(() => _map, filtersGetter, {
        cachedMunicipios, cachedVias,
        center: CENTER, zoom: ZOOM,
        refreshVisibleCallouts,
      })

  const { activeBasemap, switcherOpen, terrainActive, switchBasemap, toggleTerrain }
    = useMapInit(mapContainer, {
        onMapCreated: (m) => { _map = m },
        onLoad:       () => loadSimeva(),
      })

  return {
    activeBasemap, switcherOpen, terrainActive, switchBasemap, toggleTerrain,
    loading, loadError, fromCache, hoverLabel, loadSimeva,
    selectedVia,
    selectedSubregion, selectedMunicipio,
    visibleCallouts,
  }
}
