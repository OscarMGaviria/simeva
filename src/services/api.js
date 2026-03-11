const ENDPOINTS = {
  localizaciones: import.meta.env.VITE_API_LOCALIZACIONES,
  municipios:     import.meta.env.VITE_API_MUNICIPIOS,
}

async function fetchGeoJSON(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Error ${res.status} fetching ${url}`)

  const text = await res.text()

  // Intento 1: JSON válido
  try { return JSON.parse(text) } catch { /* continúa */ }

  // Intento 2: el mock puede truncar la respuesta → recuperar features completos
  const recovered = recoverFeatureCollection(text)
  if (recovered) {
    console.warn(`[SIMEVA] JSON truncado en ${url} — recuperados ${recovered.features.length} features`)
    return recovered
  }

  throw new Error(`No se pudo parsear el GeoJSON de ${url}`)
}

/**
 * Cuando el servidor mock trunca el JSON, recorre el texto carácter a carácter
 * rastreando profundidad de llaves para encontrar el último feature completo,
 * y reconstruye un FeatureCollection válido con los features que alcanzaron a cerrarse.
 */
function recoverFeatureCollection(text) {
  // Localizar el inicio del array de features
  const featIdx   = text.indexOf('"features"')
  if (featIdx === -1) return null
  const arrStart  = text.indexOf('[', featIdx)
  if (arrStart === -1) return null

  // Rastrear qué posiciones corresponden al cierre de cada feature top-level
  const closings = []   // índices donde depth vuelve a 0 (cada feature cerrado)
  let depth   = 0
  let inStr   = false
  let escaped = false

  for (let i = arrStart + 1; i < text.length; i++) {
    const ch   = text[i]
    const code = text.charCodeAt(i)

    if (escaped)              { escaped = false; continue }
    if (ch === '\\' && inStr) { escaped = true;  continue }
    if (ch === '"')           { inStr = !inStr;  continue }
    if (inStr) continue

    if      (ch === '{') { depth++ }
    else if (ch === '}') {
      depth--
      if (depth === 0) closings.push(i)
    }
  }

  if (closings.length === 0) return null

  // Extraer el JSON de los features hasta el último cerrado
  const lastClose   = closings[closings.length - 1]
  const featuresRaw = text.substring(arrStart + 1, lastClose + 1).trim().replace(/,\s*$/, '')

  try {
    const features = JSON.parse(`[${featuresRaw}]`)
    return { type: 'FeatureCollection', features }
  } catch {
    return null
  }
}

export const getLocalizaciones = () => fetchGeoJSON(ENDPOINTS.localizaciones)
export const getMunicipios     = () => fetchGeoJSON(ENDPOINTS.municipios)

/**
 * Extrae texto plano de la descripción HTML que viene en cada feature de localizaciones.
 * Retorna un objeto con los campos más relevantes.
 */
/**
 * Intenta extraer el valor numérico de km del objeto parseado de descripción.
 * Busca claves como "Longitud", "Km", "Kilómetros", o valores con "km" en el texto.
 */
/**
 * Calcula la longitud real de una geometría GeoJSON (LineString o MultiLineString)
 * usando la fórmula de Haversine. Retorna kilómetros.
 */
export function calcGeomKm(geometry) {
  if (!geometry) return 0

  function haversine(a, b) {
    const R    = 6371
    const dLat = (b[1] - a[1]) * Math.PI / 180
    const dLng = (b[0] - a[0]) * Math.PI / 180
    const s    = Math.sin(dLat / 2) ** 2
               + Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180)
               * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(s))
  }

  function lineKm(coords) {
    let total = 0
    for (let i = 0; i < coords.length - 1; i++) total += haversine(coords[i], coords[i + 1])
    return total
  }

  if (geometry.type === 'LineString')
    return lineKm(geometry.coordinates)

  if (geometry.type === 'MultiLineString')
    return geometry.coordinates.reduce((sum, line) => sum + lineKm(line), 0)

  return 0
}

export function extractKm(desc) {
  if (!desc || typeof desc !== 'object') return null
  // Buscar clave que hable de longitud/km
  const kmKey = Object.keys(desc).find(k => /longitud|kilóm|^km$/i.test(k))
  if (kmKey) {
    const match = String(desc[kmKey]).replace(',', '.').match(/[\d.]+/)
    if (match) return parseFloat(match[0])
  }
  // Fallback: buscar patrón "X km" en cualquier valor
  for (const val of Object.values(desc)) {
    const m = String(val).replace(',', '.').match(/([\d.]+)\s*km/i)
    if (m) return parseFloat(m[1])
  }
  return null
}

export function parseDescription(htmlString) {
  if (!htmlString) return {}
  const parser = new DOMParser()
  const doc    = parser.parseFromString(htmlString, 'text/html')
  const rows   = doc.querySelectorAll('tr')
  const result = {}
  rows.forEach(row => {
    const cells = row.querySelectorAll('td')
    if (cells.length >= 2) {
      const key = cells[0].textContent.trim()
      const val = cells[1].textContent.trim()
      if (key) result[key] = val
    }
  })
  return result
}
