/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import {
    ChannelStore,
    Constants,
    FluxDispatcher,
    MessageStore,
    RestAPI,
    UserStore,
    useStateFromStores
} from "@webpack/common";

const cache = new Map<string, { id: string; name: string; content: string; }>();
const fetching = new Set<string>();
const pendingFetches: string[] = [];

let fetchTimer: number | null = null;

function stripMarkdown(s: string) {
    return s
        .replace(/<a?:(\w+):\d+>/g, ":$1:")
        .replace(/<@!?\d+>/g, "@user")
        .replace(/<#\d+>/g, "#channel")
        .replace(/https?:\/\/\S+/g, "[link]")
        .replace(/\*{1,2}(.+?)\*{1,2}/g, "$1")
        .replace(/~~(.+?)~~/g, "$1");
}

function getInfo(channelId: string) {
    const msg = MessageStore.getLastMessage(channelId);
    if (msg?.author) return {
        id: msg.author.id,
        name: (msg.author as any).globalName ?? msg.author.username,
        content: msg.content ?? "",
        hasAttachment: (msg.attachments?.length ?? 0) > 0
    };

    const cached = cache.get(channelId);
    if (cached) return { ...cached, hasAttachment: false };

    return null;
}

async function fetchLastMessage(channelId: string) {
    if (fetching.has(channelId)) return;

    fetching.add(channelId);

    try {
        const res = await RestAPI.get({
            url: Constants.Endpoints.MESSAGES(channelId),
            query: { limit: 1 },
            retries: 2
        }).catch(() => null);

        const msg = res?.body?.[0];
        if (!msg?.author) return;

        MessageStore.getMessages(msg.channel_id).receiveMessage(msg);
        cache.set(channelId, {
            id: msg.author.id,
            name: msg.author.global_name ?? msg.author.username,
            content: msg.content ?? ""
        });
    } finally {
        fetching.delete(channelId);
        scheduleFetch();
    }
}

function scheduleFetch() {
    if (fetchTimer != null) return;

    const nextChannelId = pendingFetches.shift();
    if (!nextChannelId) return;

    fetchTimer = window.setTimeout(() => {
        fetchTimer = null;
        void fetchLastMessage(nextChannelId);
    }, settings.store.FETCH_COOLDOWN);
}

function queueFetch(channelId: string) {
    if (fetching.has(channelId) || pendingFetches.includes(channelId)) return;

    pendingFetches.push(channelId);
    scheduleFetch();
}

function onMessage({ message, channelId }: any) {
    if (!message?.author) return;

    const ch = ChannelStore.getChannel(channelId);
    if (!ch?.isDM()) return;

    cache.set(channelId, {
        id: message.author.id,
        name: message.author.global_name ?? message.author.username,
        content: message.content ?? ""
    });
}

function onLoad({ channelId }: any) {
    if (cache.has(channelId)) return;

    const msg = MessageStore.getLastMessage(channelId);
    if (msg?.author) {
        cache.set(channelId, {
            id: msg.author.id,
            name: (msg.author as any).globalName ?? msg.author.username,
            content: msg.content ?? ""
        });
    }
}

function init() {
    for (const ch of ChannelStore.getSortedPrivateChannels()) {
        if (!ch.isDM() || cache.has(ch.id)) continue;

        const msg = MessageStore.getLastMessage(ch.id);
        if (msg?.author) {
            cache.set(ch.id, {
                id: msg.author.id,
                name: (msg.author as any).globalName ?? msg.author.username,
                content: msg.content ?? ""
            });
        }
    }
}

function DMSubtext({ channel }: { channel: any; }) {
    useStateFromStores([MessageStore], () => MessageStore.getLastMessage(channel.id)?.id ?? "");

    const me = UserStore.getCurrentUser();
    if (!me) return null;

    const info = getInfo(channel.id);
    if (!info) {
        queueFetch(channel.id);
        return null;
    }

    const who = info.id === me.id ? "You" : info.name;

    let preview = stripMarkdown(info.content);
    preview = preview.length > 20 ? `${preview.slice(0, 20)}...` : preview;
    if (!preview) preview = info.hasAttachment ? "sent a file" : "sent something";

    return (
        <div className="vc-dm-subtext">
            {who}: {preview}
        </div>
    );
}

const settings = definePluginSettings({
    FETCH_COOLDOWN: {
        type: OptionType.NUMBER,
        description: "Delay between each fetch",
        default: 100,
    }
});

export default definePlugin({
    name: "LastDM",
    description: "Preview the last message per DM.",
    authors: [Devs.Xylen],
    settings: settings,
    patches: [
        {
            find: "PrivateChannel.renderAvatar",
            replacement: {
                match: /subText:(\i\.isSystemDM\(\)\?.+?:null)/,
                replace: "subText:$self.renderSubText($1,arguments[0]?.channel)"
            }
        }
    ],

    DMSubtext: DMSubtext,
    renderSubText(subText: any, channel: any) {
        const preview = this.DMSubtext({ channel });
        return preview == null ? subText : preview;
    },

    start() {
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessage);
        FluxDispatcher.subscribe("LOAD_MESSAGES_SUCCESS", onLoad);
        init();
        setTimeout(init, 5000);
    },

    stop() {
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessage);
        FluxDispatcher.unsubscribe("LOAD_MESSAGES_SUCCESS", onLoad);
        cache.clear();
        pendingFetches.length = 0;
        if (fetchTimer != null) {
            clearTimeout(fetchTimer);
            fetchTimer = null;
        }
    }
});
