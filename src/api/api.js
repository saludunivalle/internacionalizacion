import axios from 'axios'

const fallbackApiUrl = 'http://localhost:3000'

export const API_BASE_URL =
	import.meta.env.VITE_API_URL ||
	import.meta.env.VITE_API_URL_LOCAL ||
	fallbackApiUrl

export const apiPublic = axios.create({
	baseURL: API_BASE_URL,
	timeout: 15000,
})

const normalizeSheetKey = (value) =>
	String(value ?? '')
		.trim()
		.replace(/[\s-]+/g, '_')
		.toUpperCase()

const normalizeKey = (value) =>
	String(value ?? '')
		.trim()
		.toLowerCase()

export const extractRows = (data) => {
	if (Array.isArray(data)) return data
	if (Array.isArray(data?.rows)) return data.rows
	if (Array.isArray(data?.data)) return data.data
	if (Array.isArray(data?.values)) return data.values
	return []
}

export const pickValue = (row, keys, index) => {
	if (row && typeof row === 'object' && !Array.isArray(row)) {
		const normalizedEntries = Object.entries(row).map(([key, value]) => [
			normalizeKey(key),
			value,
		])

		for (const key of keys) {
			const target = normalizeKey(key)
			const match = normalizedEntries.find(
				([normalizedKey]) => normalizedKey === target,
			)
			if (match) return match[1]
		}
	}

	if (Array.isArray(row) && Number.isInteger(index)) {
		return row[index]
	}

	return undefined
}

const getAuthConfig = (token, config = {}) => ({
	...config,
	headers: {
		...(config.headers ?? {}),
		...(token ? { Authorization: `Bearer ${String(token).trim()}` } : {}),
	},
})

export const apiGet = (path, token, config = {}) =>
	apiPublic.get(path, getAuthConfig(token, config))

export const apiPost = (path, body, token, config = {}) =>
	apiPublic.post(path, body, getAuthConfig(token, config))

export const extractSheetMap = (payload) => {
	const map = {}
	const visited = new Set()

	const scanCandidate = (candidate) => {
		if (!candidate || typeof candidate !== 'object') return
		if (visited.has(candidate)) return
		visited.add(candidate)

		Object.entries(candidate).forEach(([key, value]) => {
			const normalizedKey = normalizeSheetKey(key)

			if (Array.isArray(value)) {
				map[normalizedKey] = value
				return
			}

			const rows = extractRows(value)
			if (rows.length > 0) {
				map[normalizedKey] = rows
			}
		})
	}

	const candidates = [
		payload,
		payload?.data,
		payload?.sheets,
		payload?.data?.sheets,
		payload?.payload,
		payload?.result,
	]

	candidates.forEach(scanCandidate)

	return map
}

export const getSheetRows = (sheetMap, sheetName, aliases = []) => {
	const names = [sheetName, ...aliases].map(normalizeSheetKey)

	for (const name of names) {
		if (Array.isArray(sheetMap[name])) {
			return sheetMap[name]
		}
	}

	return []
}

export const apiGetAllSheets = async (token) => {
	const response = await apiGet('/api/sheets', token)
	return extractSheetMap(response.data)
}

export const isUnauthorizedError = (error) =>
	Number(error?.response?.status) === 401 ||
	String(error?.message ?? '').toLowerCase().includes('401')
