/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2026 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Settings } from "@api/Settings";
import { styleMap } from "@api/Styles";
import * as IntrnlXxhash64 from "@intrnl/xxhash64";
import { Logger } from "@utils/Logger";
import { Plugin } from "@utils/types";
import * as VapShiki from "@vap/shiki";
import * as WebpackCmIn from "@webpack/common/internal";

import Plugins, { PluginMeta } from "~plugins";
import RuntimeUserPluginModules from "~runtime-userplugin-modules";
import RuntimeUserPluginPluginModules from "~runtime-userplugin-plugin-modules";

type UserPluginEntry = {
    fileName: string;
    source: string;
    siblingFiles: Array<{ path: string; content: string; }>;
};

const logger = new Logger("LocalPlugins", "#a6d189");

// HACK this was never a good idea
const ExtraRuntimeUserPluginModules: Record<string, unknown> = {
    "@webpack/common/internal": WebpackCmIn,
    "@intrnl/xxhash64": IntrnlXxhash64,
    "@vap/shiki": VapShiki,
};

// addmore?
const MIME_TYPES: Record<string, string> = {
    css: "text/css",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    ico: "image/x-icon",
    json: "application/json",
    txt: "text/plain",
    html: "text/html"
};

// export shape normalizer so modules can interop
function makeModuleInterop(id: string, value: any) {
    if (value == null) return null;
    if (typeof value === "function") {
        const exportKey = id.split("/").pop()?.replace(/\.js$/i, "") || "default";
        return Object.assign(value, {
            default: value,
            [exportKey]: value
        });
    }

    if (typeof value === "object") {
        const maybeDefault = value.default;
        if (typeof maybeDefault === "function") {
            return Object.assign(maybeDefault, value, { default: maybeDefault });
        }
    }

    return value;
}

function normalizeRuntimePath(path: string) { return path.replaceAll("\\", "/").replace(/\/+/g, "/"); }

function resolveRuntimeModule(id: string) {
    //  @plugins/<name> -> ~plugins, @plugins/.../... -> module thunks
    if (id.startsWith("@plugins/")) {
        const pluginName = id.slice("@plugins/".length).replace(/\.js$/i, "");
        if (!pluginName.includes("/")) {
            const pluginEntry = Object.entries(PluginMeta).find(([, meta]) => meta.folderName === pluginName);
            if (pluginEntry) {
                const [resolvedPluginName] = pluginEntry;
                const plugin = Plugins[resolvedPluginName];
                if (plugin) return plugin;
            }
        }

        const pluginModule = RuntimeUserPluginPluginModules[id] as (() => any) | undefined;
        if (pluginModule) return pluginModule();
    }

    const extraModule = ExtraRuntimeUserPluginModules[id];
    if (extraModule) { return extraModule; }

    return makeModuleInterop(id, RuntimeUserPluginModules[id] ?? null);
}

function dirnameRuntimePath(path: string) {
    const normalized = normalizeRuntimePath(path);
    const idx = normalized.lastIndexOf("/");
    return idx === -1 ? "." : normalized.slice(0, idx);
}

function joinRuntimePath(base: string, next: string) {
    const parts = normalizeRuntimePath(`${base}/${next}`).split("/");
    const resolved: string[] = [];

    for (const part of parts) {
        if (!part || part === ".") continue;
        if (part === "..") {
            resolved.pop();
            continue;
        }
        resolved.push(part);
    }

    return resolved.join("/");
}

function getMimeType(path: string) {
    const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    return MIME_TYPES[ext] ?? "application/octet-stream";
}

function decodeRuntimeFile(content: string) {
    const binary = atob(content);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

function decodeRuntimeText(content: string) {
    return new TextDecoder().decode(decodeRuntimeFile(content));
}

function getRuntimeCandidatePaths(candidateBase: string) {
    const base = normalizeRuntimePath(candidateBase);
    const indexBase = base ? `${base}/index` : "index";

    return [
        base,
        `${base}.js`,
        `${base}.json`,
        `${base}.css`,
        `${indexBase}.js`,
        `${indexBase}.css`,
        `${indexBase}.json`
    ].filter(Boolean);
}

// collect css and rewrite relative asset to dataurls
function registerRuntimeManagedStyle(pluginName: string, siblingFiles: UserPluginEntry["siblingFiles"]) {
    const cssFiles = siblingFiles.filter(file => file.path.endsWith(".css"));
    if (!cssFiles.length) return null;

    const fileMap = new Map(siblingFiles.map(file => [normalizeRuntimePath(file.path), file]));
    const styleName = `runtime-userplugin/${pluginName}.css`;

    const source = cssFiles.map(file => {
        const css = decodeRuntimeText(file.content);
        const cssDir = dirnameRuntimePath(file.path);

        return css.replace(/url\(([^)]+)\)/g, (match, rawUrl) => {
            const url = rawUrl.trim().replace(/^['"]|['"]$/g, "");
            if (!url || /^(data:|https?:|file:|\/)/i.test(url)) return match;

            const assetPath = normalizeRuntimePath(joinRuntimePath(cssDir, url));
            const asset = fileMap.get(assetPath);
            if (!asset) return match;

            const mime = getMimeType(assetPath);
            return `url("data:${mime};base64,${asset.content}")`;
        });
    }).join("\n");

    styleMap.set(styleName, {
        name: styleName,
        source,
        classNames: {},
        dom: null
    });

    return styleName;
}

// real require bridge
function createRuntimeUserPluginRequire(entry: UserPluginEntry) {
    const fileMap = new Map(entry.siblingFiles.map(file => [normalizeRuntimePath(file.path), file]));
    const moduleCache = new Map<string, any>();

    const requireFrom = (fromPath: string, id: string): any => {
        const mod = resolveRuntimeModule(id);
        if (mod) return mod;

        if (!id.startsWith("./") && !id.startsWith("../")) {
            throw new Error(`Unsupported runtime userplugin import: ${id}`);
        }

        const baseDir = dirnameRuntimePath(fromPath);
        const candidateBase = normalizeRuntimePath(joinRuntimePath(baseDir, id));
        const candidatePaths = getRuntimeCandidatePaths(candidateBase);

        const resolvedPath = candidatePaths.find(path => fileMap.has(path));
        if (!resolvedPath) {
            throw new Error(`Unsupported runtime userplugin relative import: ${id}`);
        }

        if (moduleCache.has(resolvedPath)) {
            return moduleCache.get(resolvedPath);
        }

        const file = fileMap.get(resolvedPath)!;
        const buffer = decodeRuntimeFile(file.content);

        if (resolvedPath.endsWith(".json")) {
            const parsed = JSON.parse(new TextDecoder().decode(buffer));
            moduleCache.set(resolvedPath, parsed);
            return parsed;
        }

        if (resolvedPath.endsWith(".css")) {
            const cssText = new TextDecoder().decode(buffer);
            moduleCache.set(resolvedPath, cssText);
            return cssText;
        }

        if (!resolvedPath.endsWith(".js")) {
            const dataUrl = `data:${getMimeType(resolvedPath)};base64,${file.content}`;
            moduleCache.set(resolvedPath, dataUrl);
            return dataUrl;
        }

        const nestedModule = { exports: {} as any };
        moduleCache.set(resolvedPath, nestedModule.exports);

        Function("module", "exports", "require", "__filename", "__dirname", "globalThis", new TextDecoder().decode(buffer))(
            nestedModule,
            nestedModule.exports,
            (nextId: string) => requireFrom(resolvedPath, nextId),
            resolvedPath,
            dirnameRuntimePath(resolvedPath),
            globalThis
        );

        const finalExports = nestedModule.exports?.default ?? nestedModule.exports;
        moduleCache.set(resolvedPath, finalExports);
        return finalExports;
    };

    return (id: string) => requireFrom("index.js", id);
}

export function loadRuntimeUserPlugins() {
    if (IS_WEB || !IS_DISCORD_DESKTOP) return;

    const entries = VencordNative.userPlugins.get() as UserPluginEntry[];

    for (const entry of entries) {
        const module = { exports: {} as any };

        try {
            const fileName = entry.fileName.includes("/") ? entry.fileName : `userplugins/${entry.fileName}`;
            const dirName = fileName.includes("/") ? fileName.slice(0, fileName.lastIndexOf("/")) : ".";
            Function("module", "exports", "require", "__filename", "__dirname", "globalThis", entry.source)(
                module,
                module.exports,
                createRuntimeUserPluginRequire(entry),
                fileName,
                dirName,
                globalThis
            );
        } catch (error) {
            logger.error(`Failed to evaluate runtime userplugin ${entry.fileName}\n`, error);
            continue;
        }

        const plugin = (module.exports?.default ?? module.exports) as Plugin | undefined;
        if (!plugin || typeof plugin !== "object" || typeof plugin.name !== "string" || !plugin.name.length) {
            logger.error(`Runtime userplugin ${entry.fileName} did not export a valid plugin object`);
            continue;
        }

        if (plugin.name in Plugins) {
            logger.warn(`Skipping runtime userplugin ${plugin.name} because a plugin with that name already exists`);
            continue;
        }

        Plugins[plugin.name] = plugin;
        PluginMeta[plugin.name] = {
            folderName: `userplugins/${entry.fileName}`,
            userPlugin: true
        };
        plugin.managedStyle ??= registerRuntimeManagedStyle(plugin.name, entry.siblingFiles) ?? undefined;
        (Settings.plugins[plugin.name] ??= { enabled: true }).enabled ||= true;

        logger.info(`Loaded runtime userplugin ${plugin.name}`);
    }
}
