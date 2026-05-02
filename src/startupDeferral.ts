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

import { SYM_BUNDLE_FILE } from "./webpack/symConsts";
import { AnyModuleFactory } from "./webpack/types";
import { factoryTransformers, onceReady } from "./webpack/webpack";

type StartupFactoryPatch = {
    find: string;
    bundleFilePrefix?: string;
    match: RegExp;
    replace: string | ((...args: any[]) => string);
};

function makeSplitSubExecStr(_: string, actionVar: string, payloadVar: string, thirdArgVar: string) {
    return `(function(){
    const handler = this.getDispatchHandler(${actionVar});
    if (!handler) return;

    const depGraph = this._actionHandlers?._dependencyGraph;
    const nodes = depGraph?.nodes;

    if (nodes && nodes.length) {
      let idx = 0;

      const run = () => {
        const start = performance.now();

        while (idx < nodes.length) {
          const node = nodes[idx];

          try {
            if (node?.actionHandler) {
              node.actionHandler(${payloadVar}, ${actionVar}, ${thirdArgVar});
            }
          } catch (e) {
            console.error(e);
          }

          idx++;

          if (performance.now() - start > 8) {
            setTimeout(run, 0);
            return;
          }
        }
      };

      run();
    } else {
      handler.dispatch(${payloadVar}, ${actionVar}, ${thirdArgVar});
    }
  }).call(this)`;
}

const startupFactoryPatches: StartupFactoryPatch[] = [
    {
        find: "StreamingCapabilitiesStore",
        match: /initialize\(\)\{!([A-Za-z_$][\w$]*)\.isPlatformEmbedded\|\|__OVERLAY__\|\|([A-Za-z_$][\w$]*)\.Ay\.getGPUDriverVersions\(\)\.then\([\s\S]*?\)\}get GPUDriversOutdated\(\)\{return ([A-Za-z_$][\w$]*)\}get canUseHardwareAcceleration\(\)\{return ([A-Za-z_$][\w$]*)\}get problematicGPUDriver\(\)\{return ([A-Za-z_$][\w$]*)\}/,
        replace: "initialize(){$3=false;$4=true;$5=false;this.emitChange();}get GPUDriversOutdated(){return $3}get canUseHardwareAcceleration(){return $4}get problematicGPUDriver(){return $5}",
    },
    {
        find: "dispatchMultiple(",
        bundleFilePrefix: "web.",
        match: /;let ([A-Za-z_$][\w$]*)=0;/,
        replace: ";let $1=0;let __vencordStartupDispatchStart=performance.now();"
    },
    {
        find: "dispatchMultiple(",
        bundleFilePrefix: "web.",
        match: /if\(this\.dispatchOne\(([A-Za-z_$][\w$]*)\),([A-Za-z_$][\w$]*)=performance\.now\(\)-([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)\(\1\.type,\2\),([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)\)\)\{/,
        replace: "if(this.dispatchOne($1),$2=performance.now()-$3,$4($1.type,$2),performance.now()-__vencordStartupDispatchStart>8||$5($6,$7,$8)){"
    },
    {
        find: "dispatchMultiple(",
        bundleFilePrefix: "web.",
        match: /this\.getDispatchHandler\(([A-Za-z_$][\w$]*)\)\?\.\s*dispatch\(([A-Za-z_$][\w$]*),\s*\1,\s*([A-Za-z_$][\w$]*)\)/,
        replace: makeSplitSubExecStr
    },
    {
        find: "dispatchMultiple(",
        bundleFilePrefix: "web.",
        match: /dispatchOne\(([A-Za-z_$][\w$]*)\)\s*\{/,
        replace: 'dispatchOne($1, defer=true){if(defer && $1?.type==="GAMES_DATABASE_UPDATE"){setTimeout(()=>this.dispatchOne($1, false),2000);return;}'
    },
    {
        find: "__OVERLAY__||await (0,",
        bundleFilePrefix: "web.",
        match: /__OVERLAY__\|\|await\s*\(0,\s*(.)\.P\)\(\)/,
        replace: "__OVERLAY__||(0,$1.P)()"
    },
    {
        find: "Could not find app-mount",
        bundleFilePrefix: "web.",
        match: /([A-Za-z_$][\w$]*)\.A\.initialize\(\),([A-Za-z_$][\w$]*)\.A\.initialize\(\),([A-Za-z_$][\w$]*)\.A\.init\(\),([A-Za-z_$][\w$]*)\.A\.init\(\),([A-Za-z_$][\w$]*)\.A\.init\(\),([A-Za-z_$][\w$]*)\.A\.initialize\(\),([A-Za-z_$][\w$]*)\.A\.initialize\(\),([A-Za-z_$][\w$]*)\.A\.initialize\(\),([A-Za-z_$][\w$]*)\.n\(\),\(0,([A-Za-z_$][\w$]*)\.wP\)\(\),([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\.A\.App\)/,
        replace: "$11($12.A.App)\nsetTimeout(()=>{$1.A.initialize(),$2.A.initialize(),$3.A.init(),$4.A.init(),$5.A.init(),$6.A.initialize(),$7.A.initialize(),$8.A.initialize(),$9.n(),(0,$10.wP)()},0)"
    },
    {
        find: "Hold Tight — Loading Discord",
        match: /return [A-Za-z_$][\w$]*\s*\?\s*\(0,\s*[A-Za-z_$][\w$]*\.jsx\)\([A-Za-z_$][\w$]*,[\s\S]*?\)\s*:\s*null/,
        replace: "return null"
    },
    {
        find: "children:_.message",
        bundleFilePrefix: "web.",
        match: /[A-Za-z_$][\w$]*\?__OVERLAY__\?null:\(0,[A-Za-z_$][\w$]*\.jsx\)\("div",\{className:[A-Za-z_$][\w$]*\.L\}\):([A-Za-z_$][\w$]*)\?\?null/,
        replace: "$1??null"
    },
    {
        find: "LAUNCH_APPLICATION",
        match: /componentDidMount\(\)\{([^}]+?)this\.rewriterUnlisten=([A-Za-z_$][\w$]*)\.A\.addRouteRewriter\(this\.ensureChannelMatchesGuild\),this\.historyUnlisten=\2\.A\.addRouteChangeListener\(this\.handleHistoryChange\);?\}/,
        replace: "componentDidMount(){setTimeout(()=>{$1this.rewriterUnlisten=$2.A.addRouteRewriter(this.ensureChannelMatchesGuild),this.historyUnlisten=$2.A.addRouteChangeListener(this.handleHistoryChange)},0)}"
    },
];

function patchFactory(factory: AnyModuleFactory, patch: StartupFactoryPatch) {
    const source = String(factory);
    const isArrowFunction = source.startsWith("(");
    const wrappedSource = "0," + (!isArrowFunction ? "function" : "") + source.slice(source.indexOf("("));

    if (!wrappedSource.includes(patch.find)) {
        return { factory, findMatched: false, applied: false };
    }

    const patchedSource = wrappedSource.replace(patch.match, patch.replace as string);
    if (patchedSource === wrappedSource) {
        return { factory, findMatched: true, applied: false };
    }

    const evaluated = (0, eval)(`// StartupDeferral\n${patchedSource}\n//# sourceURL=file:///StartupDeferralPatch`);
    evaluated[SYM_BUNDLE_FILE] = factory[SYM_BUNDLE_FILE];
    return { factory: evaluated, findMatched: true, applied: true };
}

if (VencordNative.settings.get().plugins?.StartupDeferral?.enabled ?? false) {
    console.log("[STARTUP DEFERRAL] Applying startup patches");
    const startupPatchStats = new Map(startupFactoryPatches.map(patch => [patch, { matchedModuleCount: 0, appliedModuleCount: 0 }]));

    factoryTransformers.add((factory, moduleId) => {
        const start = performance.now();

        const bundleFile = factory[SYM_BUNDLE_FILE] as string | undefined;
        let patchedFactory = factory;

        let patchedAny = false;

        for (const patch of startupFactoryPatches) {
            if (patch.bundleFilePrefix != null && !bundleFile?.startsWith(patch.bundleFilePrefix)) {
                continue;
            }

            const result = patchFactory(patchedFactory, patch);
            const stats = startupPatchStats.get(patch)!;

            if (result.findMatched) stats.matchedModuleCount++;

            if (result.applied) {
                stats.appliedModuleCount++;
                patchedFactory = result.factory;
                console.log(`[STARTUP DEFERRAL] Applied startup patch to module ${String(moduleId)} (${patch.find})`);
                patchedAny = true;
            }
        }

        const end = performance.now();
        if (patchedAny) console.log(`[STARTUP DEFERRAL] Total patch time for module ${String(moduleId)}: ${(end - start).toFixed(2)}ms`);

        return patchedFactory;
    });

    queueMicrotask(() => {
        void onceReady.then(() => {
            for (const patch of startupFactoryPatches) {
                const stats = startupPatchStats.get(patch)!;
                if (stats.appliedModuleCount !== 0) continue;

                console.warn(
                    stats.matchedModuleCount === 0
                        ? `[STARTUP DEFERRAL] Startup patch was never applied because no module matched ${patch.find}`
                        : `[STARTUP DEFERRAL] Startup patch never applied successfully for ${patch.find}:\n${patch.match}`
                );
            }
        });
    });
} else console.log("[STARTUP DEFERRAL] Startup patches disabled.");
