import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Alert } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { apiFetch } from "../../lib/api";
import type {
  PlaybackSessionResponse,
  PlayerContextResponse,
} from "../../types";
import {
  formatDuration,
  formatMediaTypeLong,
  formatResolution,
} from "../library/media-format";

type PlaybackModeChoice = "auto" | "original" | "smooth";
type SmoothQuality = "auto" | "original" | "720p" | "480p" | "360p";

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<import("hls.js").default | null>(null);
  const sessionRef = useRef<PlaybackSessionResponse | null>(null);

  const [data, setData] = useState<PlayerContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [vlcBusy, setVlcBusy] = useState(false);
  const [modeChoice, setModeChoice] = useState<PlaybackModeChoice>("auto");
  const [smoothQuality, setSmoothQuality] = useState<SmoothQuality>("auto");
  const [smoothStartSeconds, setSmoothStartSeconds] = useState(0);
  const [directSeekSeconds, setDirectSeekSeconds] = useState<number | null>(null);
  const [startingSmooth, setStartingSmooth] = useState(false);
  const [activeSession, setActiveSession] =
    useState<PlaybackSessionResponse | null>(null);

  const returnTo = searchParams.get("return_to") || "/?tab=library";

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setData(null);
      setModeChoice("auto");
      setSmoothQuality("auto");
      setSmoothStartSeconds(0);
      setDirectSeekSeconds(null);
      const response = await apiFetch<PlayerContextResponse>(
        `/api/library/${id}/player-context`,
      );
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load player");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const originalUsesSmooth =
    modeChoice === "original" && data?.playback.mode === "smooth_hls";
  const effectiveMode = useMemo<"original" | "smooth">(() => {
    if (modeChoice === "original") {
      return data?.playback.mode === "smooth_hls" ? "smooth" : "original";
    }
    if (modeChoice === "smooth") return "smooth";
    return data?.playback.mode === "smooth_hls" ? "smooth" : "original";
  }, [data?.playback.mode, modeChoice]);
  const smoothSessionQuality: SmoothQuality = originalUsesSmooth
    ? "original"
    : smoothQuality;

  const stopSession = useCallback((updateState = true) => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (updateState) setActiveSession(null);
    if (!session) return;
    void apiFetch<{ ok: boolean }>(
      `/api/playback/sessions/${session.session_id}`,
      { method: "DELETE" },
    ).catch(() => {});
  }, []);

  const destroyHLS = useCallback(() => {
    hlsRef.current?.destroy();
    hlsRef.current = null;
    const video = videoRef.current;
    if (video && effectiveMode === "smooth") {
      video.removeAttribute("src");
      video.load();
    }
  }, [effectiveMode]);

  const currentAbsoluteTime = useCallback(() => {
    const video = videoRef.current;
    if (!video) return 0;
    return Number.isFinite(video.currentTime) ? video.currentTime : 0;
  }, []);

  const startSmoothAt = useCallback((seconds: number) => {
    const safeSeconds = Math.max(0, seconds);
    setDirectSeekSeconds(safeSeconds);
    setSmoothStartSeconds(safeSeconds);
  }, []);

  const chooseMode = useCallback(
    (nextMode: PlaybackModeChoice) => {
      const currentTime = currentAbsoluteTime();
      if (nextMode === "smooth") {
        startSmoothAt(currentTime);
      }
      if (nextMode === "original") {
        if (data?.playback.mode === "smooth_hls") {
          startSmoothAt(currentTime);
        } else {
          setDirectSeekSeconds(currentTime);
        }
      }
      if (nextMode === "auto" && data?.playback.mode === "smooth_hls") {
        startSmoothAt(currentTime);
      }
      setModeChoice(nextMode);
    },
    [currentAbsoluteTime, data?.playback.mode, startSmoothAt],
  );

  useEffect(() => {
    return () => {
      hlsRef.current?.destroy();
      stopSession(false);
    };
  }, [stopSession]);

  useEffect(() => {
    if (!data || effectiveMode !== "smooth") {
      destroyHLS();
      stopSession();
      setStartingSmooth(false);
      return;
    }

    let canceled = false;
    const video = videoRef.current;
    const sessionURL = data.playback.session_url;
    if (!video) return;
    const videoEl = video;

    async function startSession() {
      try {
        destroyHLS();
        stopSession();
        setError("");
        setStartingSmooth(true);

        const resumeAt = Math.max(0, smoothStartSeconds);
        const session = await apiFetch<PlaybackSessionResponse>(
          sessionURL,
          {
            method: "POST",
            body: JSON.stringify({
              start_seconds: resumeAt,
              quality: smoothSessionQuality,
            }),
          },
        );

        if (canceled) {
          void apiFetch<{ ok: boolean }>(
            `/api/playback/sessions/${session.session_id}`,
            { method: "DELETE" },
          ).catch(() => {});
          return;
        }

        sessionRef.current = session;
        setActiveSession(session);

        if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
          const onLoadedMetadata = () => {
            if (resumeAt > 0) videoEl.currentTime = resumeAt;
            void videoEl.play().catch(() => {});
            setStartingSmooth(false);
          };
          videoEl.addEventListener("loadedmetadata", onLoadedMetadata, {
            once: true,
          });
          videoEl.src = session.manifest_url;
          return;
        }

        const { default: Hls } = await import("hls.js");
        if (canceled) return;
        if (!Hls.isSupported()) {
          setError("This browser cannot play the smooth stream.");
          setStartingSmooth(false);
          return;
        }

        const hls = new Hls({
          maxBufferLength: 90,
          maxMaxBufferLength: 180,
          backBufferLength: 90,
        });
        hlsRef.current = hls;
        hls.loadSource(session.manifest_url);
        hls.attachMedia(videoEl);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (resumeAt > 0) videoEl.currentTime = resumeAt;
          setStartingSmooth(false);
          void videoEl.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_event, hlsError) => {
          if (hlsError.fatal) {
            if (hlsError.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
              return;
            }
            if (hlsError.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad(videoEl.currentTime);
              return;
            }
            setError(
              "Playback stopped. Try Smooth at a lower quality or restart playback.",
            );
            setStartingSmooth(false);
          }
        });
      } catch (err) {
        if (!canceled) {
          setError(
            err instanceof Error ? err.message : "Failed to start smooth stream",
          );
          setStartingSmooth(false);
        }
      }
    }

    void startSession();
    return () => {
      canceled = true;
      destroyHLS();
      stopSession(false);
    };
  }, [
    data,
    destroyHLS,
    effectiveMode,
    smoothSessionQuality,
    smoothStartSeconds,
    stopSession,
  ]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const video = videoRef.current;
      if (!video) return;

      if (event.code === "Space") {
        event.preventDefault();
        if (video.paused) {
          void video.play();
        } else {
          video.pause();
        }
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const delta = event.key === "ArrowLeft" ? -10 : 10;
        const duration = Number.isFinite(video.duration)
          ? video.duration
          : data?.item.duration_seconds || 0;
        video.currentTime = Math.min(
          Math.max(video.currentTime + delta, 0),
          duration || Number.MAX_SAFE_INTEGER,
        );
      }

      if (event.key === "Escape") {
        stopSession(false);
        navigate(returnTo);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    currentAbsoluteTime,
    data?.item.duration_seconds,
    navigate,
    returnTo,
    stopSession,
  ]);

  function goBackToSourcePage() {
    stopSession(false);
    navigate(returnTo);
  }

  async function openInVLC() {
    if (!data) return;
    try {
      setVlcBusy(true);
      await apiFetch<{ ok: boolean }>(`/api/library/${data.item.id}/open-vlc`, {
        method: "POST",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open in VLC");
    } finally {
      setVlcBusy(false);
    }
  }

  function onDirectLoadedMetadata() {
    const video = videoRef.current;
    if (!video || directSeekSeconds === null || effectiveMode !== "original") {
      return;
    }
    video.currentTime = Math.max(0, directSeekSeconds);
    setDirectSeekSeconds(null);
  }

  function onVideoPlaybackError() {
    if (effectiveMode === "original") {
      setError("Original direct playback failed. Try Smooth or Open VLC.");
    }
  }

  if (loading) {
    return (
      <div className="app-frame flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-lg p-8 text-center">
          <div className="brand-mark mx-auto">MV</div>
          <h1 className="mt-5 text-3xl font-bold">Loading playback</h1>
          <p className="mt-3 text-sm text-(--text-secondary)">
            Preparing stream metadata and episode navigation.
          </p>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app-frame min-h-screen">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Button onClick={goBackToSourcePage} variant="secondary">
            Back
          </Button>
          <Alert tone="danger" className="mt-6">
            {error || "Player data not found."}
          </Alert>
        </div>
      </div>
    );
  }

  const item = data.item;
  const directSource =
    effectiveMode === "original" ? data.playback.stream_url : undefined;
  const playbackBadgeText =
    originalUsesSmooth || effectiveMode === "original" ? "Original" : "Smooth";
  const playbackBadgeVariant =
    originalUsesSmooth || effectiveMode === "original" ? "success" : "warning";
  const activeQualityLabel =
    activeSession?.quality === "original"
      ? "Source resolution"
      : activeSession?.quality;

  return (
    <div className="player-page">
      <div className="player-topbar">
        <div className="min-w-0">
          <Button onClick={goBackToSourcePage} variant="secondary" size="sm">
            Back
          </Button>
          <h1 className="mt-3 truncate text-2xl font-bold text-(--text-primary)">
            {item.title}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="default">{formatMediaTypeLong(item.media_type)}</Badge>
            <Badge variant="info">{formatDuration(item.duration_seconds)}</Badge>
            <Badge variant="accent">{formatResolution(item)}</Badge>
            <Badge variant={playbackBadgeVariant}>
              {playbackBadgeText}
            </Badge>
            {activeSession ? (
              <Badge variant="info">{activeQualityLabel}</Badge>
            ) : null}
            {item.company_name ? (
              <Badge variant="success">{item.company_name}</Badge>
            ) : null}
            {item.media_type === "series_episode" &&
            item.season_number > 0 &&
            item.episode_number > 0 ? (
              <Badge variant="accent">
                S{String(item.season_number).padStart(2, "0")}E
                {String(item.episode_number).padStart(2, "0")}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="player-actions">
          <div className="player-mode-controls" aria-label="Playback mode">
            <Button
              onClick={() => chooseMode("auto")}
              variant={modeChoice === "auto" ? "primary" : "outline"}
              size="sm"
            >
              Auto
            </Button>
            <Button
              onClick={() => chooseMode("original")}
              variant={modeChoice === "original" ? "primary" : "outline"}
              size="sm"
            >
              Original
            </Button>
            <Button
              onClick={() => chooseMode("smooth")}
              variant={modeChoice === "smooth" ? "primary" : "outline"}
              size="sm"
            >
              Smooth
            </Button>
            <select
              aria-label="Smooth quality"
              className="player-quality-select"
              value={originalUsesSmooth ? "original" : smoothQuality}
              disabled={effectiveMode !== "smooth" || originalUsesSmooth}
              onChange={(event) =>
                setSmoothQuality(event.target.value as SmoothQuality)
              }
            >
              <option value="auto">Auto</option>
              <option value="original">Original</option>
              <option value="720p">720p</option>
              <option value="480p">480p</option>
              <option value="360p">360p</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                data.prev_episode_id &&
                navigate(
                  `/player/${data.prev_episode_id}?return_to=${encodeURIComponent(returnTo)}`,
                )
              }
              disabled={!data.prev_episode_id}
              variant="outline"
              size="sm"
            >
              Previous
            </Button>
            <Button
              onClick={() =>
                data.next_episode_id &&
                navigate(
                  `/player/${data.next_episode_id}?return_to=${encodeURIComponent(returnTo)}`,
                )
              }
              disabled={!data.next_episode_id}
              variant="outline"
              size="sm"
            >
              Next
            </Button>
            <Button
              onClick={openInVLC}
              disabled={vlcBusy}
              variant="primary"
              size="sm"
            >
              {vlcBusy ? "Opening..." : "Open VLC"}
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <Alert tone="danger" className="mx-5 mt-5">
          {error}
        </Alert>
      ) : null}

      <main className="player-stage">
        <video
          ref={videoRef}
          key={`${item.id}-${effectiveMode}-${directSource ?? "smooth"}`}
          src={directSource}
          controls
          autoPlay
          preload="auto"
          onLoadedMetadata={onDirectLoadedMetadata}
          onError={onVideoPlaybackError}
          className="h-full w-full object-contain"
        />
        {startingSmooth ? (
          <div className="player-starting" role="status">
            {originalUsesSmooth
              ? "Starting original stream..."
              : "Starting smooth stream..."}
          </div>
        ) : null}
      </main>
    </div>
  );
}
