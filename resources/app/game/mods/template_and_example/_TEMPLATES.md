# Mod Templates

Copy a template folder, rename the copy, then update `mod.json`.

Do not enable template folders directly. They intentionally use placeholder
ids and assets.

## Which Template To Use

- `_template-data-patch`: price, unlock, preload, or data-only changes.
- `_template-locale`: translation patch or new language.
- `_template-building`: new building/entity.
- `_template-asset-replace`: image, shop icon, sound, or music replacement.
- `_template-behavior`: hooks and careful method patches.

## Naming

Use stable unique ids. A simple convention is:

```text
author.mod-name
```

For entity ids, avoid vanilla names and use a prefix:

```text
author_mod_entity
```

## Enable A Copied Mod

Edit `mods/enabled.json`:

```json
{
  "mods": [
    "my-copied-mod-folder"
  ]
}
```

Then restart the game and press `Ctrl+M` to check issues.

