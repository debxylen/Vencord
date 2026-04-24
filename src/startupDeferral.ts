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
import { factoryTransformers } from "./webpack/webpack";

type StartupFactoryPatch = {
    find: string;
    bundleFilePrefix?: string;
    match: RegExp;
    replace: string;
};

const splitSubExecStr = `(function(){
    const handler = this.getDispatchHandler(n);
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
              node.actionHandler(t, n, i);
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
      handler.dispatch(t, n, i);
    }
  }).call(this)`;

// BORING TODO: capture actual minified vars used instead of hardcoding it

const startupFactoryPatches: StartupFactoryPatch[] = [
    {
        find: "StreamingCapabilitiesStore",
        match: /initialize\(\)\{!l\.isPlatformEmbedded\|\|__OVERLAY__\|\|r\.Ay\.getGPUDriverVersions\(\)\.then\(e=>\{c=\(0,d\.A\)\(e\),u=\(0,s\.A\)\(e\),A=\(0,o\.A\)\(e\),this\.emitChange\(\)\}\)\}/,
        replace: "initialize(){c=false;u=true;A=false;this.emitChange();}",
    },
    {
        find: "dispatchMultiple(e,t){",
        bundleFilePrefix: "web.",
        match: /;let l=0;/,
        replace: ";let l=0;let c0=performance.now();"
    },
    {
        find: "dispatchMultiple(e,t){",
        bundleFilePrefix: "web.",
        match: /if\(this\.dispatchOne\(s\),l=performance\.now\(\)-a,E\(s\.type,l\),g\(e,r,t\)\)\{/,
        replace: "if(this.dispatchOne(s),l=performance.now()-a,E(s.type,l),performance.now()-c0>8||g(e,r,t)){"
    },
    {
        find: "dispatchMultiple(e,t){",
        bundleFilePrefix: "web.",
        match: /this\.getDispatchHandler\(n\)\?\.\s*dispatch\(t,\s*n,\s*i\)/,
        replace: splitSubExecStr
    },
    {
        find: "dispatchMultiple(e,t){",
        bundleFilePrefix: "web.",
        match: /dispatchOne\(e\)\s*\{/,
        replace: 'dispatchOne(e, defer=true){if(defer && e?.type==="GAMES_DATABASE_UPDATE"){setTimeout(()=>this.dispatchOne(e, false),2000);return;}'
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
        match: /d\.A\.initialize\(\),l\.A\.initialize\(\),u\.A\.init\(\),f\.A\.init\(\),L\.A\.init\(\),c\.A\.initialize\(\),m\.A\.initialize\(\),g\.A\.initialize\(\),_\.n\(\),\(0,O\.wP\)\(\),B\(o\.A\.App\)/,
        replace: "B(o.A.App)\nsetTimeout(()=>{d.A.initialize(),l.A.initialize(),u.A.init(),f.A.init(),L.A.init(),c.A.initialize(),m.A.initialize(),g.A.initialize(),_.n(),(0,O.wP)()},0)"
    },
    {
        find: "Hold Tight — Loading Discord",
        match: /return t\s*\?\s*\(0,\s*i\.jsx\)\(y,[\s\S]*?\)\s*:\s*null/,
        replace: "return null"
    },
    {
        find: "children:_.message",
        bundleFilePrefix: "web.",
        match: /d\?__OVERLAY__\?null:\(0,.\.jsx\)\("div",\{className:.\.L\}\):t\?\?null/,
        replace: "t??null"
    },
    {
        find: "LAUNCH_APPLICATION",
        match: /componentDidMount\(\)\{([^}]+?)this\.rewriterUnlisten=eb\.A\.addRouteRewriter\(this\.ensureChannelMatchesGuild\),this\.historyUnlisten=eb\.A\.addRouteChangeListener\(this\.handleHistoryChange\);?\}/,
        replace: "componentDidMount(){setTimeout(()=>{$1this.rewriterUnlisten=eb.A.addRouteRewriter(this.ensureChannelMatchesGuild),this.historyUnlisten=eb.A.addRouteChangeListener(this.handleHistoryChange)},0)}"
    },
];

function patchFactory(factory: AnyModuleFactory, patch: StartupFactoryPatch) {
    const source = String(factory);
    const isArrowFunction = source.startsWith("(");
    const wrappedSource = "0," + (!isArrowFunction ? "function" : "") + source.slice(source.indexOf("("));

    if (!wrappedSource.includes(patch.find)) {
        return factory;
    }

    const patchedSource = wrappedSource.replace(patch.match, patch.replace);
    if (patchedSource === wrappedSource) {
        console.warn(`[STARTUP DEFERRAL] Startup patch had no effect for ${patch.find}: ${patch.match}`);
        return factory;
    }

    const evaluated = (0, eval)(`// StartupDeferral\n${patchedSource}\n//# sourceURL=file:///StartupDeferralPatch`);
    evaluated[SYM_BUNDLE_FILE] = factory[SYM_BUNDLE_FILE];
    return evaluated;
}

console.log("[STARTUP DEFERRAL] Applying startup patches");

factoryTransformers.add((factory, moduleId) => {
    const start = performance.now();

    const bundleFile = factory[SYM_BUNDLE_FILE] as string | undefined;
    let patchedFactory = factory;

    let patchedAny = false;

    for (const patch of startupFactoryPatches) {
        if (patch.bundleFilePrefix != null && !bundleFile?.startsWith(patch.bundleFilePrefix)) {
            continue;
        }

        const nextFactory = patchFactory(patchedFactory, patch);
        if (nextFactory !== patchedFactory) {
            patchedFactory = nextFactory;
            console.log(`[STARTUP DEFERRAL] Applied startup patch to module ${String(moduleId)} (${patch.find})`);
            patchedAny = true;
        }
    }

    const end = performance.now();
    if (patchedAny) console.log(`[STARTUP DEFERRAL] Total patch time for module ${String(moduleId)}: ${(end - start).toFixed(2)}ms`);

    return patchedFactory;
});
