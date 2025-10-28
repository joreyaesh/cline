# MCP Multi-Source Configuration

This document explains how Cline loads MCP server configurations from multiple sources.

## Configuration Files

Cline now supports loading MCP server configurations from three different locations:

1. **Global Settings** (`cline_mcp_settings.json`)
   - Located in Cline's global storage directory
   - Lowest priority
   - Traditional location for MCP server configuration

2. **Workspace Root** (`.mcp.json`)
   - Located at the root of your workspace (e.g., `<project-root>/.mcp.json`)
   - Medium priority
   - Project-specific MCP servers

3. **VSCode Directory** (`.vscode/mcp.json`)
   - Located in the `.vscode` folder of your workspace (e.g., `<project-root>/.vscode/mcp.json`)
   - Highest priority
   - VSCode-specific MCP server configuration

## Priority and Merging

When multiple configuration files define servers with the same name, the file with higher priority takes precedence:

**Priority Order** (highest to lowest):
1. `.vscode/mcp.json`
2. `.mcp.json`
3. `cline_mcp_settings.json`

### Example

If you have:

**cline_mcp_settings.json:**
```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["global-server.js"]
    }
  }
}
```

**.mcp.json:**
```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["project-server.js"]
    },
    "project-specific-server": {
      "command": "python",
      "args": ["project.py"]
    }
  }
}
```

The resulting configuration will be:
- `my-server` will use `project-server.js` (from `.mcp.json`, overriding global settings)
- `project-specific-server` will be available (from `.mcp.json`)

## File Watching

Cline automatically watches all three configuration file locations. When any of these files are:
- Created
- Modified
- Deleted

Cline will automatically reload the MCP servers with the updated configuration.

## Use Cases

### Global Settings
Use `cline_mcp_settings.json` for:
- Personal MCP servers you use across all projects
- Authentication credentials for remote servers
- Default configurations

### Project Settings (`.mcp.json`)
Use `.mcp.json` for:
- Project-specific MCP servers
- Team-shared MCP configurations (commit to version control)
- Development tools specific to the project

### VSCode Settings (`.vscode/mcp.json`)
Use `.vscode/mcp.json` for:
- Local development overrides
- Debugging configurations
- Personal preferences that shouldn't affect the team (add to `.gitignore`)

## Configuration Format

All three files use the same JSON schema:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "node",
      "args": ["path/to/server.js"],
      "env": {
        "API_KEY": "your-api-key"
      },
      "disabled": false,
      "autoApprove": ["tool1", "tool2"]
    }
  }
}
```

Refer to the MCP documentation for detailed configuration options.
