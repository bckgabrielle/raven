"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Play } from "lucide-react";

type Character = "jack" | "jill";
type Gesture = "HELLO" | "THANK-YOU";
type Point = [number, number, number] | null;

interface PoseFrame {
  body: Point[];
  left_hand: Point[];
  right_hand: Point[];
}

interface PoseTrack {
  gloss: string;
  video_id: string;
  fps: number;
  frames: PoseFrame[];
}

interface PoseSequenceItem {
  gloss: string;
  poseUrl: string | null;
}

interface PoseClip {
  gloss: string;
  fps: number;
  frames: PoseFrame[];
}

interface PosePlayback {
  clips: PoseClip[];
  start: number;
}

interface Props {
  sequence: PoseSequenceItem[];
}

const MODELS: Record<Character, { label: string; path: string }> = {
  jack: { label: "Jack", path: "/raven-avatar.glb" },
  jill: { label: "Jill", path: "/raven-avatar-jill.glb" },
};

function isPoint(value: unknown): value is Point {
  return (
    value === null ||
    (Array.isArray(value) &&
      value.length === 3 &&
      value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)))
  );
}

function isPoseFrame(value: unknown): value is PoseFrame {
  if (typeof value !== "object" || value === null) return false;
  const frame = value as Partial<PoseFrame>;
  return (
    Array.isArray(frame.body) &&
    Array.isArray(frame.left_hand) &&
    Array.isArray(frame.right_hand) &&
    frame.body.every(isPoint) &&
    frame.left_hand.every(isPoint) &&
    frame.right_hand.every(isPoint)
  );
}

function isPoseTrack(value: unknown): value is PoseTrack {
  if (typeof value !== "object" || value === null) return false;
  const track = value as Partial<PoseTrack>;
  return (
    typeof track.gloss === "string" &&
    typeof track.video_id === "string" &&
    typeof track.fps === "number" &&
    Number.isFinite(track.fps) &&
    track.fps > 0 &&
    track.fps <= 30 &&
    Array.isArray(track.frames) &&
    track.frames.length > 0 &&
    track.frames.length <= 3600 &&
    track.frames.every(isPoseFrame)
  );
}

function interpolatePoint(first: Point | undefined, second: Point | undefined, amount: number): Point {
  if (!first) return second ?? null;
  if (!second) return first;
  return [
    first[0] + (second[0] - first[0]) * amount,
    first[1] + (second[1] - first[1]) * amount,
    first[2] + (second[2] - first[2]) * amount,
  ];
}

function interpolatePose(first: PoseFrame, second: PoseFrame, amount: number): PoseFrame {
  const blend = (a: Point[], b: Point[]) =>
    a.map((point, index) => interpolatePoint(point, b[index], amount));
  return {
    body: blend(first.body, second.body),
    left_hand: blend(first.left_hand, second.left_hand),
    right_hand: blend(first.right_hand, second.right_hand),
  };
}

export default function AvatarViewer({ sequence }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posePlaybackRef = useRef<PosePlayback | null>(null);
  const [character, setCharacter] = useState<Character>("jack");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [playingGesture, setPlayingGesture] = useState<Gesture | null>(null);
  const [gestureAvailable, setGestureAvailable] = useState(false);
  const [loadingPoses, setLoadingPoses] = useState(false);
  const [playingPoses, setPlayingPoses] = useState(false);
  const [poseError, setPoseError] = useState("");
  const gestureRef = useRef<{ name: Gesture; start: number } | null>(null);
  const availablePoseCount = sequence.filter((item) => item.poseUrl !== null).length;

  const playPoseSequence = async () => {
    const items = sequence.filter(
      (item): item is PoseSequenceItem & { poseUrl: string } => item.poseUrl !== null,
    );
    if (items.length === 0 || loadingPoses || playingPoses) return;

    setLoadingPoses(true);
    setPoseError("");
    try {
      const clips = await Promise.all(
        items.map(async (item): Promise<PoseClip> => {
          const response = await fetch(item.poseUrl, {
            cache: "no-store",
            signal: AbortSignal.timeout(30_000),
          });
          let payload: unknown;
          try {
            payload = await response.json();
          } catch {
            throw new Error(`The pose service returned invalid data for ${item.gloss}.`);
          }
          if (!response.ok) {
            const message =
              typeof payload === "object" &&
              payload !== null &&
              "error" in payload &&
              typeof payload.error === "string"
                ? payload.error
                : `Could not load the ${item.gloss} pose track.`;
            throw new Error(message);
          }
          if (!isPoseTrack(payload)) {
            throw new Error(`The pose service returned an invalid track for ${item.gloss}.`);
          }
          return { gloss: item.gloss, fps: payload.fps, frames: payload.frames };
        }),
      );
      posePlaybackRef.current = { clips, start: performance.now() };
      setPlayingPoses(true);
    } catch (error) {
      setPoseError(error instanceof Error ? error.message : "The pose sequence could not be loaded.");
    } finally {
      setLoadingPoses(false);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      requestAnimationFrame(() => setStatus("error"));
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
    scene.add(new THREE.HemisphereLight(0xe9f2ff, 0x596174, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(-3, 5, 5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x9bbcff, 1.2);
    fillLight.position.set(3, 1, -4);
    scene.add(fillLight);

    const ground = new THREE.GridHelper(4, 20, 0x8294b5, 0xcdd5e2);
    ground.position.y = -0.92;
    scene.add(ground);

    const loader = new GLTFLoader();
    let avatar: THREE.Group | null = null;
    let animationFrame = 0;
    let disposed = false;
    let helloMotion:
      | {
          wrist: THREE.Bone;
          shoulder: THREE.Bone;
          elbow: THREE.Bone;
          restShoulder: THREE.Quaternion;
          restElbow: THREE.Quaternion;
          restWristPosition: THREE.Vector3;
          templePosition: THREE.Vector3;
          helloOutwardPosition: THREE.Vector3;
          thankYouMouthPosition: THREE.Vector3;
          thankYouOutwardPosition: THREE.Vector3;
          duration: number;
        }
      | undefined;
    let poseRig:
      | {
          arms: Record<"left" | "right", { upper: THREE.Bone; forearm: THREE.Bone; hand: THREE.Bone }>;
          fingers: Record<
            "left" | "right",
            Record<
              "thumb" | "index" | "middle" | "ring" | "pinky",
              (THREE.Bone | undefined)[]
            >
          >;
          trackedBones: THREE.Bone[];
          restRotations: Map<THREE.Bone, THREE.Quaternion>;
          modelShoulderCenter: THREE.Vector3;
          modelShoulderWidth: number;
        }
      | undefined;

    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width < 1 || height < 1) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    void loader.loadAsync(MODELS[character].path).then(
      (gltf) => {
        if (disposed) return;
        try {
          avatar = gltf.scene;
          const bounds = new THREE.Box3().setFromObject(avatar);
          const size = bounds.getSize(new THREE.Vector3());
          const center = bounds.getCenter(new THREE.Vector3());
          avatar.position.sub(center);
          scene.add(avatar);
          avatar.updateMatrixWorld(true);

          const bones = new Map<string, THREE.Bone>();
          const normalizeBoneName = (name: string) => name.replace(/[.\[\]:\/]/g, "");
          avatar.traverse((object) => {
            if ((object as THREE.Bone).isBone) {
              bones.set(normalizeBoneName(object.name), object as THREE.Bone);
            }
            if (object instanceof THREE.SkinnedMesh) {
              for (const bone of object.skeleton.bones) {
                bones.set(normalizeBoneName(bone.name), bone);
              }
            }
          });
          const bone = (name: string) => bones.get(normalizeBoneName(name));
          const rightWrist = bone("DEF-hand.R");
          const rightShoulder = bone("DEF-upper_arm.R");
          const rightElbow = bone("DEF-forearm.R");
          const head = bone("head");
          if (rightWrist && rightShoulder && rightElbow && head) {
            const wristPosition = avatar.worldToLocal(
              rightWrist.getWorldPosition(new THREE.Vector3()),
            );
            const headPosition = avatar.worldToLocal(head.getWorldPosition(new THREE.Vector3()));
            const templePosition = headPosition.clone().add(
              new THREE.Vector3(-size.x * 0.07, -size.y * 0.025, size.z * 0.35),
            );
            const helloOutwardPosition = templePosition.clone().add(
              new THREE.Vector3(-size.x * 0.16, size.y * 0.07, 0),
            );
            const thankYouMouthPosition = headPosition.clone().add(
              new THREE.Vector3(-size.x * 0.01, -size.y * 0.045, size.z * 0.45),
            );
            const thankYouOutwardPosition = thankYouMouthPosition.clone().add(
              new THREE.Vector3(0, -size.y * 0.035, size.z * 1.2),
            );
            helloMotion = {
              wrist: rightWrist,
              shoulder: rightShoulder,
              elbow: rightElbow,
              restShoulder: rightShoulder.quaternion.clone(),
              restElbow: rightElbow.quaternion.clone(),
              restWristPosition: wristPosition,
              templePosition,
              helloOutwardPosition,
              thankYouMouthPosition,
              thankYouOutwardPosition,
              duration: 2.6,
            };
            setGestureAvailable(true);
          } else {
            setGestureAvailable(false);
          }

          const leftUpper = bone("DEF-upper_arm.L");
          const leftForearm = bone("DEF-forearm.L");
          const leftHand = bone("DEF-hand.L");
          const rightUpper = bone("DEF-upper_arm.R");
          const rightForearm = bone("DEF-forearm.R");
          const rightHand = bone("DEF-hand.R");
          if (
            leftUpper &&
            leftForearm &&
            leftHand &&
            rightUpper &&
            rightForearm &&
            rightHand
          ) {
            const arms = {
              left: { upper: leftUpper, forearm: leftForearm, hand: leftHand },
              right: { upper: rightUpper, forearm: rightForearm, hand: rightHand },
            };
            const fingerNames = ["thumb", "index", "middle", "ring", "pinky"] as const;
            const fingers = {} as Record<
              "left" | "right",
              Record<
                "thumb" | "index" | "middle" | "ring" | "pinky",
                (THREE.Bone | undefined)[]
              >
            >;
            for (const side of ["left", "right"] as const) {
              const suffix = side === "left" ? "L" : "R";
              fingers[side] = {} as Record<
                "thumb" | "index" | "middle" | "ring" | "pinky",
                (THREE.Bone | undefined)[]
              >;
              for (const name of fingerNames) {
                const prefix = name === "thumb" ? "thumb" : `f_${name}`;
                fingers[side][name] = [1, 2, 3].map((segment) =>
                  bone(`DEF-${prefix}.${String(segment).padStart(2, "0")}.${suffix}`),
                );
              }
            }
            const trackedBones = [
              ...Object.values(arms).flatMap((arm) => [arm.upper, arm.forearm, arm.hand]),
              ...Object.values(fingers).flatMap((hand) =>
                Object.values(hand).flatMap((chain) =>
                  chain.filter((joint): joint is THREE.Bone => joint !== undefined),
                ),
              ),
            ];
            const uniqueBones = [...new Set(trackedBones)];
            const leftPosition = avatar.worldToLocal(
              leftUpper.getWorldPosition(new THREE.Vector3()),
            );
            const rightPosition = avatar.worldToLocal(
              rightUpper.getWorldPosition(new THREE.Vector3()),
            );
            poseRig = {
              arms,
              fingers,
              trackedBones: uniqueBones,
              restRotations: new Map(
                uniqueBones.map((joint) => [joint, joint.quaternion.clone()]),
              ),
              modelShoulderCenter: leftPosition.clone().add(rightPosition).multiplyScalar(0.5),
              modelShoulderWidth: leftPosition.distanceTo(rightPosition),
            };
          }

          camera.position.set(0, size.y * 0.08, Math.max(size.y * 2.35, 2.8));
          camera.lookAt(0, 0, 0);
          setStatus("ready");

          const point = (value: Point | undefined, frame: PoseFrame) => {
            const leftShoulder = frame.body[11];
            const rightShoulder = frame.body[12];
            if (!value || !leftShoulder || !rightShoulder || !poseRig || !avatar) return null;
            const centerX = (leftShoulder[0] + rightShoulder[0]) / 2;
            const centerY = (leftShoulder[1] + rightShoulder[1]) / 2;
            const centerZ = (leftShoulder[2] + rightShoulder[2]) / 2;
            const shoulderWidth = Math.abs(leftShoulder[0] - rightShoulder[0]);
            if (shoulderWidth < 0.001 || poseRig.modelShoulderWidth < 0.001) return null;
            const scale = poseRig.modelShoulderWidth / shoulderWidth;
            return new THREE.Vector3(
              poseRig.modelShoulderCenter.x + (value[0] - centerX) * scale,
              poseRig.modelShoulderCenter.y - (value[1] - centerY) * scale,
              poseRig.modelShoulderCenter.z - (value[2] - centerZ) * scale,
            );
          };

          const setWorldRotation = (joint: THREE.Bone, desiredWorld: THREE.Quaternion) => {
            const parentWorld =
              joint.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
            joint.quaternion.copy(parentWorld.invert().multiply(desiredWorld));
            joint.updateMatrix();
            avatar?.updateMatrixWorld(true);
          };

          const aimJoint = (
            joint: THREE.Bone,
            child: THREE.Bone | null,
            targetDirection: THREE.Vector3,
          ) => {
            if (!avatar || targetDirection.lengthSq() < 1e-8) return;
            const worldRotation = joint.getWorldQuaternion(new THREE.Quaternion());
            const sourceDirection = child
              ? child
                  .getWorldPosition(new THREE.Vector3())
                  .sub(joint.getWorldPosition(new THREE.Vector3()))
              : new THREE.Vector3(0, 1, 0).applyQuaternion(worldRotation);
            if (sourceDirection.lengthSq() < 1e-8) return;
            const delta = new THREE.Quaternion().setFromUnitVectors(
              sourceDirection.normalize(),
              targetDirection.clone().normalize(),
            );
            setWorldRotation(joint, delta.multiply(worldRotation));
          };

          const orientPalm = (
            hand: THREE.Bone,
            wrist: THREE.Vector3,
            indexMcp: THREE.Vector3,
            middleMcp: THREE.Vector3,
            pinkyMcp: THREE.Vector3,
          ) => {
            if (!avatar) return;
            const currentWorld = hand.getWorldQuaternion(new THREE.Quaternion());
            const currentX = new THREE.Vector3(1, 0, 0).applyQuaternion(currentWorld);
            const currentY = new THREE.Vector3(0, 1, 0).applyQuaternion(currentWorld);
            const currentZ = new THREE.Vector3().crossVectors(currentX, currentY).normalize();
            const currentBasis = new THREE.Matrix4().makeBasis(currentX, currentY, currentZ);
            const across = pinkyMcp.clone().sub(indexMcp).normalize();
            const forward = middleMcp.clone().sub(wrist);
            forward.addScaledVector(across, -forward.dot(across)).normalize();
            if (across.lengthSq() < 1e-8 || forward.lengthSq() < 1e-8) return;
            const normal = new THREE.Vector3().crossVectors(across, forward).normalize();
            const targetBasis = new THREE.Matrix4().makeBasis(across, forward, normal);
            const currentBasisRotation = new THREE.Quaternion().setFromRotationMatrix(currentBasis);
            const targetBasisRotation = new THREE.Quaternion().setFromRotationMatrix(targetBasis);
            const delta = targetBasisRotation.multiply(currentBasisRotation.invert());
            setWorldRotation(hand, delta.multiply(currentWorld));
          };

          const applyPoseFrame = (frame: PoseFrame) => {
            if (!avatar || !poseRig) return;
            for (const joint of poseRig.trackedBones) {
              const rest = poseRig.restRotations.get(joint);
              if (rest) joint.quaternion.copy(rest);
            }
            avatar.updateMatrixWorld(true);

            for (const side of ["left", "right"] as const) {
              const [shoulderIndex, elbowIndex, wristIndex] =
                side === "left" ? [11, 13, 15] : [12, 14, 16];
              const shoulder = point(frame.body[shoulderIndex], frame);
              const elbow = point(frame.body[elbowIndex], frame);
              const wrist = point(frame.body[wristIndex], frame);
              const handLandmarks = side === "left" ? frame.left_hand : frame.right_hand;
              const handPoints = handLandmarks.map((landmark) => point(landmark, frame));
              const arm = poseRig.arms[side];
              if (shoulder && elbow && wrist) {
                aimJoint(arm.upper, arm.forearm, elbow.clone().sub(shoulder));
                aimJoint(arm.forearm, arm.hand, wrist.clone().sub(elbow));
              }

              const palmPoints = [handPoints[0], handPoints[5], handPoints[9], handPoints[17]];
              if (palmPoints.every((landmark) => landmark !== null)) {
                orientPalm(
                  arm.hand,
                  palmPoints[0]!,
                  palmPoints[1]!,
                  palmPoints[2]!,
                  palmPoints[3]!,
                );
              }

              const fingerIndices = {
                thumb: [1, 2, 3, 4],
                index: [5, 6, 7, 8],
                middle: [9, 10, 11, 12],
                ring: [13, 14, 15, 16],
                pinky: [17, 18, 19, 20],
              } as const;
              for (const [name, indexes] of Object.entries(fingerIndices) as [
                keyof typeof fingerIndices,
                (typeof fingerIndices)[keyof typeof fingerIndices],
              ][]) {
                const joints = poseRig.fingers[side][name];
                for (let segment = 0; segment < joints.length; segment += 1) {
                  const joint = joints[segment];
                  if (!joint) continue;
                  const start = handPoints[indexes[segment]];
                  const end = handPoints[indexes[segment + 1]];
                  if (!start || !end) continue;
                  aimJoint(joint, joints[segment + 1] ?? null, end.clone().sub(start));
                }
              }
            }
            avatar.traverse((object) => {
              if (object instanceof THREE.SkinnedMesh) object.skeleton.update();
            });
          };

          const render = (time: number) => {
            if (disposed) return;
            const elapsed = time * 0.001;
            if (avatar) avatar.rotation.y = Math.sin(elapsed * 0.18) * 0.12;

            const playback = posePlaybackRef.current;
            if (avatar && poseRig && playback) {
              const sequenceElapsed = Math.max(0, (time - playback.start) / 1000);
              let clipOffset = 0;
              let selected: PoseClip | undefined;
              let clipElapsed = 0;
              for (const clip of playback.clips) {
                const duration = clip.frames.length / clip.fps;
                if (sequenceElapsed < clipOffset + duration) {
                  selected = clip;
                  clipElapsed = sequenceElapsed - clipOffset;
                  break;
                }
                clipOffset += duration;
              }
              if (!selected) {
                posePlaybackRef.current = null;
                for (const joint of poseRig.trackedBones) {
                  const rest = poseRig.restRotations.get(joint);
                  if (rest) joint.quaternion.copy(rest);
                }
                avatar.updateMatrixWorld(true);
                setPlayingPoses(false);
              } else {
                const framePosition = clipElapsed * selected.fps;
                const firstIndex = Math.min(Math.floor(framePosition), selected.frames.length - 1);
                const secondIndex = Math.min(firstIndex + 1, selected.frames.length - 1);
                const frame = interpolatePose(
                  selected.frames[firstIndex],
                  selected.frames[secondIndex],
                  framePosition - firstIndex,
                );
                applyPoseFrame(frame);
              }
            } else if (avatar && helloMotion && gestureRef.current) {
              const { name, start } = gestureRef.current;
              const progress = Math.min((time - start) / (helloMotion.duration * 1000), 1);
              const smooth = (value: number) => value * value * (3 - 2 * value);
              let target = helloMotion.restWristPosition;
              if (name === "HELLO") {
                if (progress < 0.3) {
                  const amount = smooth(progress / 0.3);
                  target = helloMotion.restWristPosition.clone().lerp(helloMotion.templePosition, amount);
                } else if (progress < 0.68) {
                  const amount = smooth((progress - 0.3) / 0.38);
                  target = helloMotion.templePosition.clone().lerp(helloMotion.helloOutwardPosition, amount);
                } else if (progress < 0.76) {
                  target = helloMotion.helloOutwardPosition;
                } else {
                  const amount = smooth((progress - 0.76) / 0.24);
                  target = helloMotion.helloOutwardPosition.clone().lerp(helloMotion.restWristPosition, amount);
                }
              } else if (progress < 0.3) {
                const amount = smooth(progress / 0.3);
                target = helloMotion.restWristPosition.clone().lerp(helloMotion.thankYouMouthPosition, amount);
              } else if (progress < 0.74) {
                const amount = smooth((progress - 0.3) / 0.44);
                target = helloMotion.thankYouMouthPosition.clone().lerp(helloMotion.thankYouOutwardPosition, amount);
              } else if (progress < 0.82) {
                target = helloMotion.thankYouOutwardPosition;
              } else {
                const amount = smooth((progress - 0.82) / 0.18);
                target = helloMotion.thankYouOutwardPosition.clone().lerp(helloMotion.restWristPosition, amount);
              }

              helloMotion.shoulder.quaternion.copy(helloMotion.restShoulder);
              helloMotion.elbow.quaternion.copy(helloMotion.restElbow);
              avatar.updateMatrixWorld(true);
              const targetWorld = avatar.localToWorld(target.clone());
              for (let pass = 0; pass < 2; pass += 1) {
                for (const joint of [helloMotion.elbow, helloMotion.shoulder]) {
                  const jointPosition = joint.getWorldPosition(new THREE.Vector3());
                  const wristPosition = helloMotion.wrist.getWorldPosition(new THREE.Vector3());
                  const toWrist = wristPosition.sub(jointPosition);
                  const toTarget = targetWorld.clone().sub(jointPosition);
                  if (toWrist.lengthSq() < 1e-8 || toTarget.lengthSq() < 1e-8) continue;
                  const delta = new THREE.Quaternion().setFromUnitVectors(
                    toWrist.normalize(),
                    toTarget.normalize(),
                  );
                  const worldRotation = delta.multiply(joint.getWorldQuaternion(new THREE.Quaternion()));
                  const parentRotation =
                    joint.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
                  joint.quaternion.copy(parentRotation.invert().multiply(worldRotation));
                  joint.updateMatrix();
                  avatar.updateMatrixWorld(true);
                }
              }
              avatar.traverse((object) => {
                if (object instanceof THREE.SkinnedMesh) object.skeleton.update();
              });
              if (progress >= 1) {
                helloMotion.shoulder.quaternion.copy(helloMotion.restShoulder);
                helloMotion.elbow.quaternion.copy(helloMotion.restElbow);
                avatar.updateMatrixWorld(true);
                gestureRef.current = null;
                setPlayingGesture(null);
              }
            } else if (poseRig) {
              for (const joint of poseRig.trackedBones) {
                const rest = poseRig.restRotations.get(joint);
                if (rest) joint.quaternion.copy(rest);
              }
              avatar?.updateMatrixWorld(true);
            }
            renderer.render(scene, camera);
            animationFrame = requestAnimationFrame(render);
          };
          animationFrame = requestAnimationFrame(render);
        } catch (error) {
          console.error("Could not initialize the avatar rig.", error);
          if (!disposed) {
            setGestureAvailable(false);
            setStatus("error");
          }
        }
      },
      () => {
        if (!disposed) setStatus("error");
      },
    );

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      gestureRef.current = null;
      posePlaybackRef.current = null;
      resizeObserver.disconnect();
      if (avatar) {
        avatar.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            for (const material of Array.isArray(object.material)
              ? object.material
              : [object.material]) {
              material.dispose();
            }
          }
        });
      }
      renderer.dispose();
    };
  }, [character]);

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-[#f2f5fa]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div>
          <p className="text-sm font-semibold">Rig preview · {MODELS[character].label}</p>
          <p className="muted text-xs">
            Local pose tracks retarget to the Raven arm and finger bones.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="btn btn-brand"
            disabled={
              status !== "ready" ||
              availablePoseCount === 0 ||
              loadingPoses ||
              playingPoses ||
              playingGesture !== null
            }
            onClick={() => void playPoseSequence()}
          >
            <Play size={15} aria-hidden />
            {loadingPoses
              ? "Loading pose clips…"
              : playingPoses
                ? "Playing gloss sequence…"
                : `Play extracted signs (${availablePoseCount})`}
          </button>
          {(["HELLO", "THANK-YOU"] as const).map((gesture) => (
            <button
              key={gesture}
              type="button"
              className="btn btn-ghost"
              disabled={
                status !== "ready" ||
                !gestureAvailable ||
                playingGesture !== null ||
                loadingPoses ||
                playingPoses
              }
              onClick={() => {
                gestureRef.current = { name: gesture, start: performance.now() };
                setPlayingGesture(gesture);
              }}
            >
              <Play size={15} aria-hidden />
              {playingGesture === gesture ? `Playing ${gesture}…` : `Play ${gesture} demo`}
            </button>
          ))}
          <div className="seg w-32">
            {(["jack", "jill"] as const).map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={character === name}
                aria-label={`Show ${MODELS[name].label} avatar`}
                onClick={() => {
                  gestureRef.current = null;
                  posePlaybackRef.current = null;
                  setPlayingGesture(null);
                  setPlayingPoses(false);
                  setGestureAvailable(false);
                  setStatus("loading");
                  setCharacter(name);
                }}
              >
                {MODELS[name].label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {poseError && <p role="alert" className="alert alert-danger mx-3 mb-2">{poseError}</p>}
      <div className="relative h-[360px] bg-gradient-to-b from-white to-[#e7edf6]">
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          aria-label={`${MODELS[character].label} 3D rig preview`}
        />
        {status !== "ready" && (
          <p
            role={status === "error" ? "alert" : "status"}
            className={`absolute inset-x-3 bottom-3 rounded-lg px-3 py-2 text-center text-sm ${
              status === "error" ? "alert alert-danger" : "bg-white/90 text-[var(--muted)]"
            }`}
          >
            {status === "error"
              ? "Could not load the 3D rig in this browser."
              : "Loading the 3D rig…"}
          </p>
        )}
      </div>
    </section>
  );
}
