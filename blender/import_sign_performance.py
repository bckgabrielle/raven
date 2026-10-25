import json
import math
import sys


def load_performance(path):
    with open(path, "r", encoding="utf-8") as performance_file:
        performance = json.load(performance_file)
    if not isinstance(performance, dict):
        raise ValueError("Performance document must be a JSON object")
    if performance.get("schema_version") != "1.0":
        raise ValueError("Performance schema_version must be '1.0'")
    fps = performance.get("fps")
    frames = performance.get("frames")
    if not isinstance(fps, (int, float)) or not math.isfinite(fps) or fps <= 0:
        raise ValueError("Performance must contain a positive fps value")
    if not isinstance(frames, list) or not frames:
        raise ValueError("Performance must contain a non-empty frames list")

    checked_frames = []
    previous_time_ms = -1
    for frame in frames:
        if not isinstance(frame, dict):
            raise ValueError("Every frame must be a JSON object")
        time_ms = frame.get("time_ms")
        joints = frame.get("joints", {})
        controls = frame.get("face_controls", {})
        if not isinstance(time_ms, (int, float)) or not math.isfinite(time_ms) or time_ms < 0:
            raise ValueError("Every frame must have a non-negative time_ms")
        if time_ms <= previous_time_ms:
            raise ValueError("Frame time_ms values must be strictly increasing")
        previous_time_ms = time_ms
        if not isinstance(joints, dict) or not isinstance(controls, dict):
            raise ValueError("joints and face_controls must be JSON objects")
        for bone_name, joint in joints.items():
            if not isinstance(joint, dict):
                raise ValueError(f"{bone_name} must be an object")
            rotation = joint.get("rotation_euler")
            if not isinstance(rotation, list) or len(rotation) != 3:
                raise ValueError(f"{bone_name} rotation_euler must contain three numbers")
            if not all(isinstance(value, (int, float)) and math.isfinite(value) for value in rotation):
                raise ValueError(f"{bone_name} rotation_euler contains a non-finite value")
        for name, value in controls.items():
            if not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError(f"Face control {name} must be a finite number")
        checked_frames.append((time_ms, joints, controls))
    return fps, checked_frames


def import_performance(performance_path, armature_name, face_object_name=None):
    import bpy

    fps, frames = load_performance(performance_path)
    frame_numbers = [round(time_ms * fps / 1000.0) + 1 for time_ms, _, _ in frames]
    if len(frame_numbers) != len(set(frame_numbers)):
        raise ValueError("Frame timestamps map to duplicate Blender frames at this fps")
    armature = bpy.data.objects.get(armature_name)
    if armature is None or armature.type != "ARMATURE":
        raise ValueError(f"Armature object not found: {armature_name}")

    face_object = None
    if face_object_name:
        face_object = bpy.data.objects.get(face_object_name)
        if face_object is None or face_object.data.shape_keys is None:
            raise ValueError(f"Shape-key mesh not found: {face_object_name}")

    for _, joints, controls in frames:
        missing_bones = set(joints).difference(armature.pose.bones.keys())
        if missing_bones:
            raise ValueError(f"Armature is missing mapped bones: {', '.join(sorted(missing_bones))}")
        if controls:
            if face_object is None:
                raise ValueError("face_controls require --face-object with shape keys")
            missing_controls = set(controls).difference(face_object.data.shape_keys.key_blocks.keys())
            if missing_controls:
                raise ValueError(f"Mesh is missing shape keys: {', '.join(sorted(missing_controls))}")

    scene = bpy.context.scene
    scene.render.fps = round(fps)
    scene.render.fps_base = scene.render.fps / fps
    bpy.context.view_layer.objects.active = armature
    armature.animation_data_create()
    action = bpy.data.actions.new("ASL Sign Performance")
    armature.animation_data.action = action

    for frame_number, (_, joints, controls) in zip(frame_numbers, frames):
        scene.frame_set(frame_number)
        for bone_name, joint in joints.items():
            bone = armature.pose.bones[bone_name]
            bone.rotation_mode = "XYZ"
            bone.rotation_euler = joint["rotation_euler"]
            bone.keyframe_insert(data_path="rotation_euler", frame=frame_number, group=bone_name)
        if face_object is not None:
            for control_name, value in controls.items():
                key = face_object.data.shape_keys.key_blocks[control_name]
                key.value = value
                key.keyframe_insert(data_path="value", frame=frame_number)


def main():
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    import argparse

    parser = argparse.ArgumentParser(description="Import a Raven sign-performance JSON into Blender.")
    parser.add_argument("--json", required=True, dest="performance_path")
    parser.add_argument("--armature", required=True)
    parser.add_argument("--face-object")
    args = parser.parse_args(arguments)
    import_performance(args.performance_path, args.armature, args.face_object)


if __name__ == "__main__":
    main()
