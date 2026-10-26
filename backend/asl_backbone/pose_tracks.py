from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any


def _valid_point(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) == 3
        and all(
            isinstance(coordinate, (int, float)) and math.isfinite(coordinate)
            for coordinate in value
        )
    )


def _has_playable_landmarks(frames: list[Any]) -> bool:
    has_shoulders = False
    has_hand = False
    for frame in frames:
        if not isinstance(frame, dict):
            return False
        body = frame.get("body")
        left_hand = frame.get("left_hand")
        right_hand = frame.get("right_hand")
        if not isinstance(body, list) or not isinstance(left_hand, list) or not isinstance(right_hand, list):
            return False
        if any(point is not None and not _valid_point(point) for point in body + left_hand + right_hand):
            return False
        has_shoulders |= (
            len(body) > 12 and _valid_point(body[11]) and _valid_point(body[12])
        )
        has_hand |= any(
            len(hand) >= 18
            and all(_valid_point(hand[index]) for index in (0, 5, 9, 17))
            for hand in (left_hand, right_hand)
        )
    return has_shoulders and has_hand


def pose_track_quality(track: dict[str, Any]) -> tuple[float, float]:
    frames = track["frames"]
    body_coverage = sum(
        len(frame["body"]) > 12
        and _valid_point(frame["body"][11])
        and _valid_point(frame["body"][12])
        for frame in frames
    ) / len(frames)
    hand_coverage = sum(
        any(
            len(hand) >= 18
            and all(_valid_point(hand[index]) for index in (0, 5, 9, 17))
            for hand in (frame["left_hand"], frame["right_hand"])
        )
        for frame in frames
    ) / len(frames)
    return hand_coverage, body_coverage


def pose_track_path(dataset_root: Path, video_file: str) -> Path:
    digest = hashlib.sha256(video_file.encode("utf-8")).hexdigest()[:20]
    return dataset_root / "derived" / "pose_tracks" / f"{digest}.json"


def load_pose_track(path: Path) -> dict[str, Any] | None:
    try:
        with path.open("r", encoding="utf-8") as file:
            payload = json.load(file)
    except (OSError, json.JSONDecodeError):
        return None

    if (
        not isinstance(payload, dict)
        or not isinstance(payload.get("gloss"), str)
        or not isinstance(payload.get("video_id"), str)
        or not isinstance(payload.get("fps"), (int, float))
        or payload["fps"] <= 0
        or not isinstance(payload.get("frames"), list)
        or not payload["frames"]
        or len(payload["frames"]) > 3600
        or not _has_playable_landmarks(payload["frames"])
    ):
        return None
    return payload


def _landmark_points(landmarks: Any, *, filter_visibility: bool = False) -> list[list[float] | None]:
    if landmarks is None:
        return []
    points: list[list[float] | None] = []
    for landmark in landmarks.landmark:
        if filter_visibility and getattr(landmark, "visibility", 1.0) < 0.15:
            points.append(None)
            continue
        points.append([float(landmark.x), float(landmark.y), float(landmark.z)])
    return points


def fill_short_landmark_gaps(
    frames: list[dict[str, list[list[float] | None]]],
    *,
    max_gap: int = 3,
) -> None:
    for field in ("body", "left_hand", "right_hand"):
        point_count = max((len(frame[field]) for frame in frames), default=0)
        for frame in frames:
            frame[field] += [None] * (point_count - len(frame[field]))
        for point_index in range(point_count):
            frame_index = 0
            while frame_index < len(frames):
                if frames[frame_index][field][point_index] is not None:
                    frame_index += 1
                    continue
                gap_start = frame_index
                while (
                    frame_index < len(frames)
                    and frames[frame_index][field][point_index] is None
                ):
                    frame_index += 1
                gap_end = frame_index
                gap_length = gap_end - gap_start
                if (
                    gap_length <= max_gap
                    and gap_start > 0
                    and gap_end < len(frames)
                ):
                    previous = frames[gap_start - 1][field][point_index]
                    following = frames[gap_end][field][point_index]
                    if previous is not None and following is not None:
                        for offset in range(gap_length):
                            amount = (offset + 1) / (gap_length + 1)
                            frames[gap_start + offset][field][point_index] = [
                                previous[axis] * (1 - amount) + following[axis] * amount
                                for axis in range(3)
                            ]


def _recover_missing_hands(
    result: Any,
    body: list[list[float] | None],
    left_hand: list[list[float] | None],
    right_hand: list[list[float] | None],
) -> tuple[list[list[float] | None], list[list[float] | None]]:
    detected_hands = getattr(result, "multi_hand_landmarks", None) or []
    handedness = getattr(result, "multi_handedness", None) or []
    for index, landmarks in enumerate(detected_hands):
        points = _landmark_points(landmarks)
        wrist = points[0] if points else None
        if wrist is None:
            continue

        side: str | None = None
        left_wrist = body[15] if len(body) > 15 else None
        right_wrist = body[16] if len(body) > 16 else None
        if left_wrist is not None and right_wrist is not None:
            left_distance = sum((wrist[axis] - left_wrist[axis]) ** 2 for axis in range(2))
            right_distance = sum((wrist[axis] - right_wrist[axis]) ** 2 for axis in range(2))
            side = "left" if left_distance <= right_distance else "right"
        elif index < len(handedness):
            classifications = getattr(handedness[index], "classification", [])
            if classifications:
                label = getattr(classifications[0], "label", "").lower()
                side = label if label in {"left", "right"} else None

        if side == "left" and not left_hand:
            left_hand = points
        elif side == "right" and not right_hand:
            right_hand = points
    return left_hand, right_hand


def extract_video_pose(video_path: Path, *, gloss: str, target_fps: float) -> dict[str, Any]:
    import cv2
    import mediapipe as mp

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        capture.release()
        raise ValueError(f"Could not open video: {video_path}")

    source_fps = float(capture.get(cv2.CAP_PROP_FPS))
    if source_fps <= 0:
        capture.release()
        raise ValueError(f"Video has no valid frame rate: {video_path}")
    frame_step = max(1, round(source_fps / target_fps))
    tracking_step = max(1, round(source_fps / 30.0))
    output_fps = source_fps / frame_step
    frames: list[dict[str, list[list[float] | None]]] = []

    try:
        with (
            mp.solutions.holistic.Holistic(
                static_image_mode=False,
                model_complexity=1,
                smooth_landmarks=True,
                enable_segmentation=False,
                refine_face_landmarks=False,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            ) as holistic,
            mp.solutions.hands.Hands(
                static_image_mode=False,
                max_num_hands=2,
                min_detection_confidence=0.4,
                min_tracking_confidence=0.4,
            ) as hands_detector,
        ):
            frame_index = 0
            while True:
                success, image = capture.read()
                if not success:
                    break
                if frame_index % tracking_step == 0:
                    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                    result = holistic.process(rgb)
                    if frame_index % frame_step == 0:
                        body = _landmark_points(
                            result.pose_landmarks,
                            filter_visibility=True,
                        )
                        left_hand = _landmark_points(result.left_hand_landmarks)
                        right_hand = _landmark_points(result.right_hand_landmarks)
                        if not left_hand or not right_hand:
                            fallback = hands_detector.process(rgb)
                            left_hand, right_hand = _recover_missing_hands(
                                fallback,
                                body,
                                left_hand,
                                right_hand,
                            )
                        frames.append(
                            {
                                "body": body,
                                "left_hand": left_hand,
                                "right_hand": right_hand,
                            }
                        )
                frame_index += 1
    finally:
        capture.release()

    if not frames:
        raise ValueError(f"No readable frames in video: {video_path}")
    fill_short_landmark_gaps(frames)
    if len(frames) > 3600:
        raise ValueError(
            f"Pose track exceeds the 4-minute limit at {target_fps:g} FPS: {video_path}"
        )
    if not _has_playable_landmarks(frames):
        raise ValueError(
            f"Could not detect usable body and hand landmarks in video: {video_path}"
        )
    return {"gloss": gloss, "fps": output_fps, "frames": frames}
