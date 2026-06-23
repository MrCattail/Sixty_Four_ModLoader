# Building Template

Copy this folder and rename the new folder to your building mod id.

The script registers a simple building class in `afterVanillaScripts`, after
vanilla `Entity`, `Sprite`, and shop code have loaded.

Important:

- Use a unique entity id. Avoid vanilla names like `pump`.
- Put assets inside the copied mod folder and reference them with `api.asset`.
- Add config defaults in `mod.json` when values should be user-tunable.

