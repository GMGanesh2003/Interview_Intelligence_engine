"use client";

import { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export type FaceSample = {
  timestamp_sec: number;
  eye_contact: boolean;
  head_movement: number;
  face_visible: boolean;
  posture_score: number;
};

const YAW_THRESHOLD_DEG = 18;
const PITCH_THRESHOLD_DEG = 15;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Decode an approximate yaw/pitch (degrees) from MediaPipe's row-major 4x4 facial transform matrix. */
function decodeYawPitch(m: number[]): { yaw: number; pitch: number } {
  const yaw = (Math.asin(clamp(m[2], -1, 1)) * 180) / Math.PI;
  const pitch = (Math.asin(clamp(-m[6], -1, 1)) * 180) / Math.PI;
  return { yaw, pitch };
}

/**
 * Runs MediaPipe Face Mesh (FaceLandmarker) against a <video> element and
 * reports Eye Contact, Head Movement, Face Visibility, and Posture once per
 * second — matching Module 3 (Video Intelligence) of the plan.
 *
 * NOTE: eye-contact and posture are heuristics derived from head pose /
 * face-box position (no dedicated gaze or body-pose model). Good enough for
 * an MVP signal; swap in iris landmarks or MediaPipe Pose for more rigor.
 */
export function useFaceTracking(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
  onSample: (s: FaceSample) => void
) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastNoseRef = useRef<{ x: number; y: number } | null>(null);
  const lastSampleAtRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFacialTransformationMatrixes: true,
        });
        if (!cancelled) {
          landmarkerRef.current = landmarker;
          setReady(true);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load face model");
      }
    })();
    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!active || !ready) return;
    startTimeRef.current = performance.now();
    lastSampleAtRef.current = 0;

    const loop = () => {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (video && landmarker && video.readyState >= 2) {
        const nowMs = performance.now();
        const elapsedSec = (nowMs - startTimeRef.current) / 1000;
        const result = landmarker.detectForVideo(video, nowMs);

        const faceVisible = (result.faceLandmarks?.length ?? 0) > 0;
        let eyeContact = false;
        let posture = 0.5;
        let movement = 0;

        if (faceVisible) {
          const landmarks = result.faceLandmarks[0];
          const nose = landmarks[1]; // nose tip
          if (lastNoseRef.current) {
            const dx = nose.x - lastNoseRef.current.x;
            const dy = nose.y - lastNoseRef.current.y;
            movement = clamp(Math.sqrt(dx * dx + dy * dy) * 8, 0, 1);
          }
          lastNoseRef.current = { x: nose.x, y: nose.y };

          const matrix = result.facialTransformationMatrixes?.[0]?.data;
          if (matrix) {
            const { yaw, pitch } = decodeYawPitch(matrix as number[]);
            eyeContact = Math.abs(yaw) < YAW_THRESHOLD_DEG && Math.abs(pitch) < PITCH_THRESHOLD_DEG;
          }

          // Posture heuristic: face vertically centered in the upper-middle band of frame
          posture = clamp(1 - Math.abs(nose.y - 0.42) * 2.2, 0, 1);
        } else {
          lastNoseRef.current = null;
        }

        // Sample roughly once per second
        if (elapsedSec - lastSampleAtRef.current >= 1) {
          lastSampleAtRef.current = elapsedSec;
          onSample({
            timestamp_sec: Math.round(elapsedSec * 10) / 10,
            eye_contact: eyeContact,
            head_movement: Math.round(movement * 1000) / 1000,
            face_visible: faceVisible,
            posture_score: Math.round(posture * 1000) / 1000,
          });
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ready]);

  return { ready, error };
}
