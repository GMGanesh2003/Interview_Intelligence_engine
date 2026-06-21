"use client";

import { useCallback, useRef, useState } from "react";

export function useAudioRecorder(stream: MediaStream | null) {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const resolverRef = useRef<((blob: Blob) => void) | null>(null);

  const start = useCallback(() => {
    if (!stream) return;
    const audioOnlyStream = new MediaStream(stream.getAudioTracks());
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(audioOnlyStream, { mimeType });
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      resolverRef.current?.(blob);
    };

    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
  }, [stream]);

  const stop = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      recorderRef.current?.stop();
      setRecording(false);
    });
  }, []);

  return { recording, start, stop };
}
