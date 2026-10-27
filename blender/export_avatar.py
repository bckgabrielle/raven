import argparse
import sys
from pathlib import Path

import bpy


def include_collections(layer_collection, names):
    included = layer_collection.collection.name in names
    for child in layer_collection.children:
        included = include_collections(child, names) or included
    if included:
        layer_collection.exclude = False
        layer_collection.hide_viewport = False
    return included


def main():
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Export one skinned Raven character as browser GLB.")
    parser.add_argument("--character", default="Jack")
    parser.add_argument("--armature", default="Jack Controls")
    parser.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parents[1] / "frontend" / "public" / "raven-avatar.glb"),
    )
    args = parser.parse_args(arguments)

    character = bpy.data.objects.get(args.character)
    armature = bpy.data.objects.get(args.armature)
    if character is None or character.type != "MESH":
        raise ValueError(f"Character mesh not found: {args.character}")
    if armature is None or armature.type != "ARMATURE":
        raise ValueError(f"Character armature not found: {args.armature}")
    if not any(
        modifier.type == "ARMATURE" and modifier.object == armature
        for modifier in character.modifiers
    ):
        raise ValueError(f"{args.character} is not skinned to {args.armature}")

    include_collections(
        bpy.context.view_layer.layer_collection,
        {collection.name for collection in character.users_collection + armature.users_collection},
    )
    scene_objects = bpy.context.scene.collection.objects
    if character.name not in scene_objects:
        bpy.context.scene.collection.objects.link(character)
    if armature.name not in scene_objects:
        bpy.context.scene.collection.objects.link(armature)
    if character.name not in bpy.context.view_layer.objects:
        raise ValueError(f"Character mesh is excluded from the active view layer: {args.character}")
    if armature.name not in bpy.context.view_layer.objects:
        raise ValueError(f"Armature is excluded from the active view layer: {args.armature}")

    output_path = Path(args.output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    character.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = character
    print("Export selection:", [obj.name for obj in bpy.context.selected_objects])

    result = bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_skins=True,
        export_cameras=False,
        export_lights=False,
    )
    if "FINISHED" not in result or not output_path.is_file():
        raise RuntimeError(f"Blender did not write the GLB file: {output_path}")
    print(f"Exported {args.character} with {args.armature} to {output_path}")


if __name__ == "__main__":
    main()
