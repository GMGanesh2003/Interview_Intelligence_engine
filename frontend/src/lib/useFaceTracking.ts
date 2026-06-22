"use client";

import { useEffect, useRef, useState } from "react";
import { FaceLandmarker, ObjectDetector, FilesetResolver } from "@mediapipe/tasks-vision";

export type FaceSample = {
  timestamp_sec: number;
  eye_contact: boolean;
  head_movement: number;
  face_visible: boolean;
  posture_score: number;
  multiple_faces: boolean;
  cell_phone: boolean;
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
 * Runs MediaPipe Face Mesh and Object Detector against a <video> element.
 * Reports Eye Contact, Head Movement, Face Visibility, Posture, and Cheating Flags (multiple faces, cell phone)
 * once per second.
 */
export function useFaceTracking(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
  onSample: (s: FaceSample) => void
) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const detectorRef = useRef<ObjectDetector | null>(null);
  
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
        
        // 1. Face Landmarker (numFaces: 2 for multiple person detection)
        const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 2,
          outputFacialTransformationMatrixes: true,
        });

        // 2. Object Detector (EfficientDet-Lite0 for cell phone detection)
        const detector = await ObjectDetector.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          scoreThreshold: 0.5,
          maxResults: 3,
        });

        if (!cancelled) {
          landmarkerRef.current = landmarker;
          detectorRef.current = detector;
          setReady(true);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load AI models");
      }
    })();
    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      detectorRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!active || !ready) return;
    startTimeRef.current = performance.now();
    lastSampleAtRef.current = 0;

    const loop = () => {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      const detector = detectorRef.current;
      
      if (video && landmarker && detector && video.readyState >= 2) {
        const nowMs = performance.now();
        const elapsedSec = (nowMs - startTimeRef.current) / 1000;
        
        // Run AI models
        const faceResult = landmarker.detectForVideo(video, nowMs);
        const objectResult = detector.detectForVideo(video, nowMs);

        // 1. Process Objects (Check for Cell Phone)
        let hasCellPhone = false;
        for (const detection of objectResult.detections) {
          for (const category of detection.categories) {
            // COCO dataset classes "cell phone" (ID 77)
            if (category.categoryName === "cell phone" || category.categoryName === "remote") {
              hasCellPhone = true;
              break;
            }
          }
        }

        // 2. Process Faces
        const numFaces = faceResult.faceLandmarks?.length ?? 0;
        const faceVisible = numFaces > 0;
        const multipleFaces = numFaces > 1;
        
        let eyeContact = false;
        let posture = 0.5;
        let movement = 0;

        if (faceVisible) {
          const landmarks = faceResult.faceLandmarks[0];
          const nose = landmarks[1]; // nose tip
          if (lastNoseRef.current) {
            const dx = nose.x - lastNoseRef.current.x;
            const dy = nose.y - lastNoseRef.current.y;
            movement = clamp(Math.sqrt(dx * dx + dy * dy) * 8, 0, 1);
          }
          lastNoseRef.current = { x: nose.x, y: nose.y };

          const matrix = faceResult.facialTransformationMatrixes?.[0]?.data;
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
            multiple_faces: multipleFaces,
            cell_phone: hasCellPhone,
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
