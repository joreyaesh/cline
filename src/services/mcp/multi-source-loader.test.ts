import * as fs from "fs/promises"
import { after, before, describe, it } from "mocha"
import * as os from "os"
import * as path from "path"
import "should"
import {
	getAllWatchPaths,
	getMcpConfigLocations,
	loadMultiSourceMcpSettings,
	type McpConfigLocation,
} from "./multi-source-loader"

describe("MCP Multi-Source Loader", () => {
	const tmpDir = path.join(os.tmpdir(), "cline-mcp-test-" + Math.random().toString(36).slice(2))
	let globalSettingsPath: string
	let workspace1Path: string
	let workspace2Path: string

	before(async () => {
		// Create test directory structure
		await fs.mkdir(tmpDir, { recursive: true })

		globalSettingsPath = path.join(tmpDir, "global", "cline_mcp_settings.json")
		workspace1Path = path.join(tmpDir, "workspace1")
		workspace2Path = path.join(tmpDir, "workspace2")

		await fs.mkdir(path.dirname(globalSettingsPath), { recursive: true })
		await fs.mkdir(workspace1Path, { recursive: true })
		await fs.mkdir(workspace2Path, { recursive: true })
		await fs.mkdir(path.join(workspace1Path, ".vscode"), { recursive: true })
		await fs.mkdir(path.join(workspace2Path, ".vscode"), { recursive: true })
	})

	after(async () => {
		try {
			await fs.rm(tmpDir, { recursive: true, force: true })
		} catch {
			// Ignore cleanup errors
		}
	})

	describe("getMcpConfigLocations", () => {
		it("should return all config locations with correct priorities", () => {
			const workspaceRoots = [workspace1Path, workspace2Path]
			const locations = getMcpConfigLocations(globalSettingsPath, workspaceRoots)

			locations.length.should.equal(5) // 1 global + 2 workspace roots * 2 files each

			// Check that global settings has lowest priority
			const globalLocation = locations.find((loc) => loc.path === globalSettingsPath)
			globalLocation?.priority.should.equal(3)
			globalLocation?.source.should.equal("global")

			// Check workspace .mcp.json files
			const workspace1McpJson = locations.find(
				(loc) => loc.path === path.join(workspace1Path, ".mcp.json"),
			)
			workspace1McpJson?.priority.should.equal(2)
			workspace1McpJson?.source.should.equal("workspace-root")

			// Check .vscode/mcp.json files have highest priority
			const workspace1VscodeMcp = locations.find(
				(loc) => loc.path === path.join(workspace1Path, ".vscode", "mcp.json"),
			)
			workspace1VscodeMcp?.priority.should.equal(1)
			workspace1VscodeMcp?.source.should.equal("workspace-vscode")
		})

		it("should work with no workspace roots", () => {
			const locations = getMcpConfigLocations(globalSettingsPath, [])

			locations.length.should.equal(1)
			locations[0].path.should.equal(globalSettingsPath)
		})
	})

	describe("loadMultiSourceMcpSettings", () => {
		it("should load settings from global config only when others don't exist", async () => {
			// Create only global config
			await fs.writeFile(
				globalSettingsPath,
				JSON.stringify({
					mcpServers: {
						"global-server": {
							command: "node",
							args: ["global.js"],
						},
					},
				}),
			)

			const result = await loadMultiSourceMcpSettings(globalSettingsPath, [workspace1Path])

			Object.keys(result.mcpServers).length.should.equal(1)
			result.mcpServers["global-server"].should.not.be.undefined()
			result.sources.get("global-server")?.should.equal(globalSettingsPath)
		})

		it("should merge settings from multiple sources", async () => {
			// Create global config
			await fs.writeFile(
				globalSettingsPath,
				JSON.stringify({
					mcpServers: {
						"global-server": {
							command: "node",
							args: ["global.js"],
						},
					},
				}),
			)

			// Create workspace .mcp.json
			const workspace1McpPath = path.join(workspace1Path, ".mcp.json")
			await fs.writeFile(
				workspace1McpPath,
				JSON.stringify({
					mcpServers: {
						"workspace-server": {
							command: "node",
							args: ["workspace.js"],
						},
					},
				}),
			)

			const result = await loadMultiSourceMcpSettings(globalSettingsPath, [workspace1Path])

			Object.keys(result.mcpServers).length.should.equal(2)
			result.mcpServers["global-server"].should.not.be.undefined()
			result.mcpServers["workspace-server"].should.not.be.undefined()
			result.sources.get("global-server")?.should.equal(globalSettingsPath)
			result.sources.get("workspace-server")?.should.equal(workspace1McpPath)
		})

		it("should respect priority when servers have the same name", async () => {
			// Create global config with a server
			await fs.writeFile(
				globalSettingsPath,
				JSON.stringify({
					mcpServers: {
						"shared-server": {
							command: "node",
							args: ["global.js"],
						},
					},
				}),
			)

			// Create workspace .mcp.json with same server name (higher priority)
			const workspace1McpPath = path.join(workspace1Path, ".mcp.json")
			await fs.writeFile(
				workspace1McpPath,
				JSON.stringify({
					mcpServers: {
						"shared-server": {
							command: "node",
							args: ["workspace.js"],
						},
					},
				}),
			)

			// Create .vscode/mcp.json with same server name (highest priority)
			const workspace1VscodePath = path.join(workspace1Path, ".vscode", "mcp.json")
			await fs.writeFile(
				workspace1VscodePath,
				JSON.stringify({
					mcpServers: {
						"shared-server": {
							command: "node",
							args: ["vscode.js"],
						},
					},
				}),
			)

			const result = await loadMultiSourceMcpSettings(globalSettingsPath, [workspace1Path])

			Object.keys(result.mcpServers).length.should.equal(1)
			// Should use the .vscode/mcp.json version (highest priority)
			const server = result.mcpServers["shared-server"]
			server.should.not.be.undefined()
			;(server as any).args[0].should.equal("vscode.js")
			result.sources.get("shared-server")?.should.equal(workspace1VscodePath)
		})

		it("should handle invalid JSON gracefully", async () => {
			// Create valid global config
			await fs.writeFile(
				globalSettingsPath,
				JSON.stringify({
					mcpServers: {
						"global-server": {
							command: "node",
							args: ["global.js"],
						},
					},
				}),
			)

			// Create invalid workspace config
			const workspace1McpPath = path.join(workspace1Path, ".mcp.json")
			await fs.writeFile(workspace1McpPath, "{ invalid json }")

			// Should still load valid config
			const result = await loadMultiSourceMcpSettings(globalSettingsPath, [workspace1Path])

			Object.keys(result.mcpServers).length.should.equal(1)
			result.mcpServers["global-server"].should.not.be.undefined()
		})

		it("should handle missing files gracefully", async () => {
			// Don't create any files, just test with paths
			const result = await loadMultiSourceMcpSettings(
				path.join(tmpDir, "nonexistent", "config.json"),
				[path.join(tmpDir, "nonexistent-workspace")],
			)

			Object.keys(result.mcpServers).length.should.equal(0)
		})

		it("should merge servers from multiple workspaces", async () => {
			// Create configs in two workspaces
			const workspace1McpPath = path.join(workspace1Path, ".mcp.json")
			await fs.writeFile(
				workspace1McpPath,
				JSON.stringify({
					mcpServers: {
						"workspace1-server": {
							command: "node",
							args: ["ws1.js"],
						},
					},
				}),
			)

			const workspace2McpPath = path.join(workspace2Path, ".mcp.json")
			await fs.writeFile(
				workspace2McpPath,
				JSON.stringify({
					mcpServers: {
						"workspace2-server": {
							command: "node",
							args: ["ws2.js"],
						},
					},
				}),
			)

			const result = await loadMultiSourceMcpSettings(globalSettingsPath, [workspace1Path, workspace2Path])

			Object.keys(result.mcpServers).length.should.equal(2)
			result.mcpServers["workspace1-server"].should.not.be.undefined()
			result.mcpServers["workspace2-server"].should.not.be.undefined()
		})
	})

	describe("getAllWatchPaths", () => {
		it("should return all paths to watch", () => {
			const workspaceRoots = [workspace1Path, workspace2Path]
			const watchPaths = getAllWatchPaths(globalSettingsPath, workspaceRoots)

			watchPaths.length.should.equal(5)
			watchPaths.should.containEql(globalSettingsPath)
			watchPaths.should.containEql(path.join(workspace1Path, ".mcp.json"))
			watchPaths.should.containEql(path.join(workspace1Path, ".vscode", "mcp.json"))
			watchPaths.should.containEql(path.join(workspace2Path, ".mcp.json"))
			watchPaths.should.containEql(path.join(workspace2Path, ".vscode", "mcp.json"))
		})
	})
})
