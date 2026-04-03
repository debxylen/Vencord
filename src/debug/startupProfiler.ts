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

type StartupPhaseEntry = {
    name: string;
    startedAt: number;
    endedAt: number;
    duration: number;
};

type StartupPluginEntry = {
    name: string;
    stage: string;
    duration: number;
    startedAt: number;
    endedAt: number;
};

type StartupProfilerState = {
    bootAt: number;
    phases: StartupPhaseEntry[];
    plugins: StartupPluginEntry[];
};

const state: StartupProfilerState = {
    bootAt: performance.now(),
    phases: [],
    plugins: []
};

function recordPhase(name: string, startedAt: number, endedAt: number) {
    state.phases.push({
        name,
        startedAt,
        endedAt,
        duration: endedAt - startedAt
    });
}

function recordPlugin(name: string, stage: string, startedAt: number, endedAt: number) {
    state.plugins.push({
        name,
        stage,
        startedAt,
        endedAt,
        duration: endedAt - startedAt
    });
}

export function profileStartupPhase<T>(name: string, task: () => T): T {
    const startedAt = performance.now();
    try { return task(); }
    finally { recordPhase(name, startedAt, performance.now()); }
}

export async function profileStartupPhaseAsync<T>(name: string, task: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try { return await task(); }
    finally { recordPhase(name, startedAt, performance.now()); }
}

export function recordPluginStartup(name: string, stage: string, startedAt: number, endedAt: number) {
    recordPlugin(name, stage, startedAt, endedAt);
}

export function getStartupProfile() {
    return {
        bootAt: state.bootAt,
        phases: [...state.phases].sort((a, b) => a.startedAt - b.startedAt),
        plugins: [...state.plugins].sort((a, b) => b.duration - a.duration)
    };
}

