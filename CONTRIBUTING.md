# Contributing to Vencord

Vencord is a community project and welcomes any kind of contribution from anyone!
It has development documentation for new contributors, which can be found at <https://docs.vencord.dev>.

## Write a plugin

Writing a plugin is the primary way to contribute.

Before starting your plugin:
- Consider if this plugin would be useful to a large portion of the userbase.
- Check existing pull requests to see if someone is already working on a similar plugin
- Familarise yourself with our plugin rules below to ensure your work is not rejected

> Regarding AI Usage: Acceptable; but overengineered or vibecoded slop will bias rejection under other reasons.

### Plugin Rules

- No simple slash command plugins like `/cat`. Instead, make a [user installable Discord bot](https://discord.com/developers/docs/change-log#userinstallable-apps-preview)
- No simple text replace plugins like Let me Google that for you. The TextReplace plugin can do this
- No FakeDeafen or FakeMute
- No StereoMic
- No plugins that simply hide or redesign ui elements. This can be done with CSS
- No plugins that interact with specific Discord bots (official Discord apps like Youtube WatchTogether are okay)
- No untrusted third party APIs. Popular services like Google or GitHub are fine, but absolutely no self hosted ones
- Do not introduce new dependencies unless absolutely necessary and warranted

## Improve Vencord itself

If you have any ideas on how to improve Vencord (whether upstream or here) itself, or want to propose a new plugin API, feel free to open a feature request so we can discuss.
Or if you notice any bugs or typos, feel free to fix them!
