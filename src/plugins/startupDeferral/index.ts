/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

// this is just a representative plugin
export default definePlugin({
    name: "StartupDeferral",
    description: "Aggressive(?) startup and reload speedup optimizations.",
    authors: [Devs.Xylen],
});
