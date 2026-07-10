import { useState, useCallback, useRef, useEffect } from "react";

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

// Map a SpeechRecognitionErrorEvent.error code to an actionable, user-facing
// message. Returning null means "don't surface anything" (e.g. the user just
// cancelled). Previously every error was swallowed silently, so any failure
// looked to the user like a dead button (see doableinfo/microphone_bug.md).
function messageForError(error: string): string | null {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked. Click the padlock in your browser's address bar and allow microphone for this site.";
    case "audio-capture":
      return "No microphone detected. Please plug in or enable a microphone and try again.";
    case "network":
      return "Voice recognition can't reach the speech server. Check your internet connection or firewall.";
    case "no-speech":
      return "I didn't catch any speech. Try again and speak clearly.";
    case "aborted":
      return null; // user cancelled — no message needed
    default:
      return `Voice input failed: ${error}`;
  }
}

export function useSpeechRecognition(onResult: (transcript: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported] = useState(() => getSpeechRecognitionConstructor() !== null);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const toggle = useCallback(async () => {
    if (!isSupported) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    // Clear any prior error before a fresh attempt.
    setError(null);

    // Pre-check microphone permission. When it is already denied, Chrome fires
    // SpeechRecognition.start()'s onerror internally without ever prompting,
    // so without this the click would appear to do nothing. Surface actionable
    // guidance instead.
    if (typeof navigator !== "undefined" && "permissions" in navigator) {
      try {
        const status = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        if (status.state === "denied") {
          setError(
            "Microphone permission is blocked for this site. Open the padlock icon → Site settings → Microphone → Allow, then try again."
          );
          return;
        }
      } catch {
        // Some browsers don't support querying the "microphone" permission —
        // fall through and let SpeechRecognition surface any error via onerror.
      }
    }

    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i]!.isFinal) {
          transcript += event.results[i]![0]!.transcript;
        }
      }
      if (transcript) {
        onResultRef.current(transcript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsListening(false);
      recognitionRef.current = null;
      const message = messageForError(event.error);
      if (message) setError(message);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch (err) {
      // start() throws synchronously if called in an invalid state.
      recognitionRef.current = null;
      setError(
        err instanceof Error
          ? `Voice input couldn't start: ${err.message}`
          : "Voice input couldn't start. Please try again."
      );
    }
  }, [isListening, isSupported]);

  return { isListening, isSupported, error, clearError, toggle };
}
