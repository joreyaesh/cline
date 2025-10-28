import { fileExistsAtPath } from "@utils/fs"
import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { McpSettingsSchema } from "./schemas"
import { McpServerConfig } from "./types"

/**
 * Locations where MCP configuration files can be found
 */
export interface McpConfigLocation {
	path: string
	priority: number // Lower number = higher priority
	source: "global" | "workspace-root" | "workspace-vscode"
}

/**
 * Result of loading MCP settings from multiple sources
 */
export interface MultiSourceMcpSettings {
	mcpServers: Record<string, McpServerConfig>
	sources: Map<string, string> // server name -> source path
}

/**
 * Load and parse a single MCP configuration file
 */
async function loadMcpConfigFile(
	filePath: string,
): Promise<{ mcpServers: Record<string, McpServerConfig> } | null> {
	try {
		if (!(await fileExistsAtPath(filePath))) {
			return null
		}

		const content = await fs.readFile(filePath, "utf-8")
		let config: any

		try {
			config = JSON.parse(content)
		} catch (error) {
			console.error(`[MCP Multi-Source] Invalid JSON in ${filePath}:`, error)
			return null
		}

		// Validate against schema
		const result = McpSettingsSchema.safeParse(config)
		if (!result.success) {
			console.error(`[MCP Multi-Source] Invalid schema in ${filePath}:`, result.error)
			return null
		}

		return result.data
	} catch (error) {
		console.error(`[MCP Multi-Source] Failed to load ${filePath}:`, error)
		return null
	}
}

/**
 * Get all potential MCP config file locations
 * @param globalSettingsPath Path to the global cline_mcp_settings.json
 * @param workspaceRoots Array of workspace root paths
 */
export function getMcpConfigLocations(
	globalSettingsPath: string,
	workspaceRoots: string[],
): McpConfigLocation[] {
	const locations: McpConfigLocation[] = []

	// Global settings (lowest priority)
	locations.push({
		path: globalSettingsPath,
		priority: 3,
		source: "global",
	})

	// Workspace root .mcp.json files (medium priority)
	for (const rootPath of workspaceRoots) {
		locations.push({
			path: path.join(rootPath, ".mcp.json"),
			priority: 2,
			source: "workspace-root",
		})
	}

	// Workspace .vscode/mcp.json files (highest priority)
	for (const rootPath of workspaceRoots) {
		locations.push({
			path: path.join(rootPath, ".vscode", "mcp.json"),
			priority: 1,
			source: "workspace-vscode",
		})
	}

	return locations
}

/**
 * Load and merge MCP settings from multiple sources
 * Higher priority sources override lower priority ones for the same server name
 */
export async function loadMultiSourceMcpSettings(
	globalSettingsPath: string,
	workspaceRoots: string[],
): Promise<MultiSourceMcpSettings> {
	const locations = getMcpConfigLocations(globalSettingsPath, workspaceRoots)

	// Sort by priority - process from lowest priority (highest number) to highest priority (lowest number)
	// so that higher priority files override lower priority ones
	const sortedLocations = [...locations].sort((a, b) => b.priority - a.priority)

	const mergedServers: Record<string, McpServerConfig> = {}
	const sources = new Map<string, string>()

	// Process from lowest priority to highest priority (3 → 2 → 1)
	for (const location of sortedLocations) {
		const config = await loadMcpConfigFile(location.path)
		if (!config) {
			continue
		}

		// Add or override servers from this source
		// Since we process in order, later iterations (higher priority) will override earlier ones
		for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
			mergedServers[serverName] = serverConfig
			sources.set(serverName, location.path)
		}
	}

	return {
		mcpServers: mergedServers,
		sources: sources,
	}
}

/**
 * Get all paths that should be watched for MCP configuration changes
 */
export function getAllWatchPaths(globalSettingsPath: string, workspaceRoots: string[]): string[] {
	const locations = getMcpConfigLocations(globalSettingsPath, workspaceRoots)
	return locations.map((loc) => loc.path)
}
